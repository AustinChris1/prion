// Live citation-ancestry traversal.

const OA = "https://api.openalex.org";

const SELECT = [
  "id",
  "doi",
  "ids",
  "display_name",
  "publication_year",
  "cited_by_count",
  "is_retracted",
  "referenced_works",
  "primary_location",
  "open_access",
].join(",");

// Budgets: a web request cannot run for a minute.

const MAX_DEPTH = 3;
// References followed per work below depth 1.
const REFS_PER_WORK = 40;
// Works examined per level below depth 1.
const FRONTIER_CAP = 600;
// Hard ceiling on upstream requests for one trace.
const REQUEST_BUDGET = 45;

export interface TracedWork {
  id: string;
  doi: string | null;
  pmid: string | null;
  title: string;
  year: number | null;
  journal: string | null;
  citedByCount: number;
  isRetracted: boolean;
  referencedWorks: string[];
}

export interface Finding {
  // The retracted work found upstream.
  retracted: TracedWork;
  // Target first, retracted work last. Length - 1 = hop distance.
  path: TracedWork[];
  hops: number;
}

export interface TraceResult {
  target: TracedWork;
  findings: Finding[];
  stats: {
    worksExamined: number;
    requestsUsed: number;
    depthReached: number;
    truncated: boolean;
    // The target's own reference count — all of these are always followed.
    directReferences: number;
    // Upstream works discovered but not examined, because of the budgets.
    skipped: number;
  };
  message: string;
}

function mailto() {
  return encodeURIComponent(process.env.OPENALEX_MAILTO ?? "prion@example.com");
}

function shape(w: Record<string, unknown>): TracedWork {
  const ids = (w.ids ?? {}) as { pmid?: string };
  const loc = w.primary_location as { source?: { display_name?: string } } | null;
  const pmid = ids.pmid?.match(/(\d+)\s*$/)?.[1] ?? null;

  return {
    id: String(w.id),
    doi: (w.doi as string) ?? null,
    pmid,
    title: (w.display_name as string) ?? "(untitled)",
    year: (w.publication_year as number) ?? null,
    journal: loc?.source?.display_name ?? null,
    citedByCount: (w.cited_by_count as number) ?? 0,
    isRetracted: Boolean(w.is_retracted),
    // Stored whole; sampling happens at traversal time so depth 1 stays exhaustive.
    referencedWorks: (w.referenced_works as string[]) ?? [],
  };
}

// Accepts a DOI, a PMID, or an OpenAlex ID in any of their usual spellings.
export function normalizeId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  if (/^https?:\/\/openalex\.org\/W\d+$/i.test(s)) return s.split("/").pop()!;
  if (/^W\d+$/i.test(s)) return s.toUpperCase();
  if (/^\d{5,9}$/.test(s)) return `pmid:${s}`;

  const doi = s
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");

  if (/^10\.\d{4,9}\//.test(doi)) return `doi:${doi}`;

  return null;
}

async function get(url: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    // Upstream data changes rarely; let Next cache it for an hour.
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

async function fetchOne(id: string): Promise<TracedWork | null> {
  const body = await get(`${OA}/works/${id}?select=${SELECT}&mailto=${mailto()}`);
  return body ? shape(body) : null;
}

// Up to 100 works in a single request — this is what makes live traversal viable.
async function fetchMany(ids: string[]): Promise<TracedWork[]> {
  const out: TracedWork[] = [];

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids
      .slice(i, i + 100)
      .map((id) => id.replace("https://openalex.org/", ""));

    const body = await get(
      `${OA}/works?filter=openalex_id:${chunk.join("|")}` +
        `&per-page=100&select=${SELECT}&mailto=${mailto()}`,
    );

    const results = (body?.results as Record<string, unknown>[]) ?? [];
    out.push(...results.map(shape));
  }

  return out;
}

export async function traceContamination(rawId: string): Promise<TraceResult> {
  const id = normalizeId(rawId);
  if (!id) throw new Error("Not a recognisable DOI, PMID, or OpenAlex ID.");

  const target = await fetchOne(id);
  if (!target) throw new Error(`No work found for ${rawId}.`);

  let requests = 1;

  // The paper you pasted may itself be retracted — check before walking past it.
  if (target.isRetracted) {
    return {
      target,
      findings: [{ retracted: target, path: [target], hops: 0 }],
      stats: {
        worksExamined: 1,
        requestsUsed: requests,
        depthReached: 0,
        truncated: false,
        directReferences: target.referencedWorks.length,
        skipped: 0,
      },
      message: `"${target.title}" is itself retracted.`,
    };
  }

  // child -> parent, for walking a discovered retraction back to the target.
  const parent = new Map<string, string>();
  const works = new Map<string, TracedWork>([[target.id, target]]);
  const seen = new Set<string>([target.id]);
  const findings: Finding[] = [];

  let frontier = target.referencedWorks;
  for (const ref of frontier) parent.set(ref, target.id);

  let depth = 0;
  let truncated = false;
  let skipped = 0;

  while (frontier.length > 0 && depth < MAX_DEPTH) {
    depth++;

    if (requests >= REQUEST_BUDGET) {
      skipped += frontier.length;
      truncated = true;
      break;
    }

    const pending = frontier.filter((r) => !seen.has(r));

    // Depth 1 is the target's own bibliography — never sampled.
    const batch = depth === 1 ? pending : pending.slice(0, FRONTIER_CAP);

    if (batch.length < pending.length) {
      skipped += pending.length - batch.length;
      truncated = true;
    }
    for (const r of batch) seen.add(r);

    const level = await fetchMany(batch);
    requests += Math.ceil(batch.length / 100);

    const next: string[] = [];

    for (const work of level) {
      works.set(work.id, work);

      if (work.isRetracted) {
        // Walk the parent chain back to the target, then reverse it.
        const chain: TracedWork[] = [work];
        let cursor = parent.get(work.id);

        while (cursor) {
          const step = works.get(cursor);
          if (!step) break;
          chain.push(step);
          cursor = parent.get(cursor);
        }

        chain.reverse();
        findings.push({ retracted: work, path: chain, hops: chain.length - 1 });
        continue; // don't expand past a retraction
      }

      const refs = work.referencedWorks;
      if (refs.length > REFS_PER_WORK) skipped += refs.length - REFS_PER_WORK;

      for (const ref of refs.slice(0, REFS_PER_WORK)) {
        if (seen.has(ref) || parent.has(ref)) continue;
        parent.set(ref, work.id);
        next.push(ref);
      }
    }

    frontier = next;
  }

  findings.sort((a, b) => a.hops - b.hops);

  const stats = {
    worksExamined: works.size,
    requestsUsed: requests,
    depthReached: depth,
    truncated,
    directReferences: target.referencedWorks.length,
    skipped,
  };

  return { target, findings, stats, message: summarize(target, findings, stats) };
}

function summarize(
  target: TracedWork,
  findings: Finding[],
  stats: TraceResult["stats"],
): string {
  if (findings.length > 0) {
    const nearest = findings[0].hops;
    const s = findings.length === 1 ? "" : "s";
    return `${findings.length} retracted work${s} found upstream of "${target.title}" — nearest at ${nearest} hop${nearest === 1 ? "" : "s"}.`;
  }

  // A negative is only as strong as its coverage — say exactly what was checked.
  const base =
    `No retracted work found. All ${stats.directReferences} of the paper's own ` +
    `references were checked, plus ${(stats.worksExamined - 1 - stats.directReferences).toLocaleString()} ` +
    `works further upstream (${stats.depthReached} levels).`;

  return stats.skipped > 0
    ? `${base} ${stats.skipped.toLocaleString()} deeper references were not followed, so this is a clean result for what was examined — not a proof of absence.`
    : `${base} The ancestry was exhausted — nothing upstream was skipped.`;
}
