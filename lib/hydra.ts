// HydraDB access layer.

import { HydraDBClient } from "@hydradb/sdk";
import type { EdgeClass } from "./types";

export const HYDRA_DB = process.env.PRION_HYDRA_DB ?? "prion";

let _client: HydraDBClient | null = null;

export function hydra(): HydraDBClient {
  if (!process.env.HYDRA_DB_API_KEY) {
    throw new Error("HYDRA_DB_API_KEY is not set.");
  }
  _client ??= new HydraDBClient({ token: process.env.HYDRA_DB_API_KEY });
  return _client;
}

export function hydraConfigured(): boolean {
  return Boolean(process.env.HYDRA_DB_API_KEY);
}

// Every HydraDB response is `{ success, data, meta }`.
type Envelope<T> = { success?: boolean; data?: T };

const unwrap = <T,>(res: unknown): T | undefined =>
  (res as Envelope<T>)?.data;

export interface WorkNode {
  id: string;
  title: string;
  year: number | null;
  journal: string | null;
  doi: string | null;
  isRetracted: boolean;
  retractionReason?: string | null;
  retractionDate?: string | null;
  // OpenAlex IDs this work cites, restricted to the ingested corpus.
  cites: string[];
  // Rendered into the item's text so HydraDB's extractor builds cites relations.
  citedDetails?: {
    id: string;
    title: string;
    edgeClass?: EdgeClass;
    evidence?: string | null;
    section?: string | null;
  }[];
}

export async function ensureDatabase(database = HYDRA_DB, timeoutMs = 180_000) {
  const client = hydra();

  try {
    await client.databases.create({ database });
  } catch {
    // Already exists — the only failure mode we can safely ignore here.
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const data = unwrap<{ infra?: { readyForIngestion?: boolean } }>(
      await client.databases.status({ database }),
    );
    if (data?.infra?.readyForIngestion) return;
    await new Promise((r) => setTimeout(r, 5000));
  }

  throw new Error(`Database ${database} was not ready within ${timeoutMs}ms.`);
}

// One knowledge item, in the shape the API actually accepts.
function toItem(work: WorkNode) {
  const lines = [
    work.title,
    work.journal ? `Published in ${work.journal}${work.year ? `, ${work.year}` : ""}.` : "",
    work.isRetracted
      ? `RETRACTED${work.retractionDate ? ` on ${work.retractionDate}` : ""}${
          work.retractionReason ? ` — ${work.retractionReason}` : ""
        }.`
      : "",
  ].filter(Boolean);

  for (const cited of work.citedDetails ?? []) {
    // One sentence per citation: the extractor needs a subject and an object.
    // relation's context.
    const parts = [`"${work.title}" cites "${cited.title}".`];

    if (cited.section) {
      parts.push(`The citation appears in the ${cited.section} section.`);
    }
    if (cited.evidence) {
      parts.push(`Quoted: "${cited.evidence.slice(0, 300)}"`);
    }
    if (cited.edgeClass && cited.edgeClass !== "unknown") {
      parts.push(`This citation is ${cited.edgeClass.replace(/_/g, " ")}.`);
    }

    lines.push(parts.join(" "));
  }

  const item: Record<string, unknown> = {
    id: work.id,
    title: work.title,
    content: { text: lines.join(" ") },
    metadata: {
      node_type: "work",
      openalex_id: work.id,
      doi: work.doi ?? "",
      year: work.year ?? 0,
      journal: work.journal ?? "",
      is_retracted: work.isRetracted,
      retraction_date: work.retractionDate ?? "",
      retraction_reason: work.retractionReason ?? "",
    },
  };

  if (work.cites.length > 0) {
    // Links sources explicitly, though this alone yields no traversable edges.
    // does not, on its own, yield traversable document-to-document edges.
    item.relations = { ids: work.cites, properties: { predicate: "cites" } };
  }

  return item;
}

export async function ingestWorks(
  works: WorkNode[],
  database = HYDRA_DB,
): Promise<{ accepted: number; ids: string[] }> {
  if (works.length === 0) return { accepted: 0, ids: [] };

  const data = unwrap<{ successCount?: number; results?: { id?: string }[] }>(
    await hydra().context.ingest({
      database,
      type: "knowledge",
      appKnowledge: JSON.stringify(works.map(toItem)),
    }),
  );

  const results = data?.results ?? [];

  return {
    accepted: data?.successCount ?? results.length,
    ids: results.map((r) => r.id).filter((v): v is string => Boolean(v)),
  };
}

// Ingestion is asynchronous; sources are not queryable until terminal.
export async function waitForIndexing(
  ids: string[],
  database = HYDRA_DB,
  timeoutMs = 300_000,
): Promise<{ completed: number; errored: number; pending: number }> {
  if (ids.length === 0) return { completed: 0, errored: 0, pending: 0 };

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const data = unwrap<{
      statuses?: { indexingStatus?: string; indexing_status?: string }[];
    }>(await hydra().context.status({ database, ids }));

    const statuses = data?.statuses ?? [];

    const state = (s: (typeof statuses)[number]) =>
      s.indexingStatus ?? s.indexing_status ?? "pending";

    const completed = statuses.filter((s) => state(s) === "completed").length;
    const errored = statuses.filter((s) => state(s) === "errored").length;
    const pending = statuses.length - completed - errored;

    if (pending === 0) return { completed, errored, pending };
    await new Promise((r) => setTimeout(r, 4000));
  }

  return { completed: 0, errored: 0, pending: ids.length };
}

interface RelationTriplet {
  source?: { identifier?: string; name?: string };
  target?: { identifier?: string; name?: string };
  relations?: {
    canonicalPredicate?: string;
    context?: string;
    confidence?: number;
    timestamp?: string;
  }[];
}

// Direct citation targets of one work, as stored in the graph.
export async function relationsOf(
  id: string,
  database = HYDRA_DB,
  limit = 200,
): Promise<RelationTriplet[]> {
  const data = unwrap<{ relations?: RelationTriplet[] }>(
    await hydra().context.relations({ database, id, type: "knowledge", limit }),
  );

  return data?.relations ?? [];
}

export interface HydraFinding {
  retractedId: string;
  retractedTitle: string;
  path: { id: string; title: string }[];
  hops: number;
  evidence: (string | null)[];
}

// Breadth-first walk over stored citation edges.
export async function traceViaHydra(
  rootId: string,
  database = HYDRA_DB,
  maxDepth = 4,
  // Without this the only signal is "retracted" in a title, which is a guess.
  retractedIds?: ReadonlySet<string>,
): Promise<{ findings: HydraFinding[]; examined: number } | null> {
  const parent = new Map<string, string>();
  const titles = new Map<string, string>();
  const evidence = new Map<string, string | null>();
  const seen = new Set<string>([rootId]);
  const findings: HydraFinding[] = [];

  let frontier = [rootId];
  let examined = 0;
  let sawAnything = false;

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];

    for (const id of frontier) {
      const rels = await relationsOf(id, database);
      if (rels.length > 0) sawAnything = true;
      examined++;

      for (const trip of rels) {
        const targetId = trip.target?.identifier;
        if (!targetId || seen.has(targetId)) continue;

        seen.add(targetId);
        parent.set(targetId, id);
        titles.set(targetId, trip.target?.name ?? targetId);
        evidence.set(targetId, trip.relations?.[0]?.context ?? null);
        next.push(targetId);
      }
    }

    frontier = next;
  }

  // Nothing in the corpus for this root — caller should fall back to live.
  if (!sawAnything) return null;

  for (const id of seen) {
    if (id === rootId) continue;
    const title = titles.get(id) ?? "";

    const isRetracted = retractedIds
      ? retractedIds.has(id)
      : /\bretracted\b/i.test(title);
    if (!isRetracted) continue;

    const chain: { id: string; title: string }[] = [];
    const quotes: (string | null)[] = [];
    let cursor: string | undefined = id;

    while (cursor) {
      chain.push({ id: cursor, title: titles.get(cursor) ?? cursor });
      quotes.push(evidence.get(cursor) ?? null);
      cursor = parent.get(cursor);
    }

    chain.reverse();
    quotes.reverse();

    findings.push({
      retractedId: id,
      retractedTitle: title,
      path: chain,
      hops: chain.length - 1,
      evidence: quotes,
    });
  }

  findings.sort((a, b) => a.hops - b.hops);
  return { findings, examined };
}
