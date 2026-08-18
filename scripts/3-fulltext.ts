// scripts/3-fulltext.ts — citation context from open-access full text.

import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import path from "node:path";
import {
  CACHE_DIR,
  RateLimiter,
  appendNDJSON,
  getJSON,
  isMissing,
  loadCheckpoint,
  readNDJSON,
  saveCheckpoint,
} from "./lib/fetcher";
import type { WorkRecord } from "./lib/openalex";
import type { EdgeRecord } from "./2-expand";

const EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const LIMIT = Number(process.argv[2] ?? Infinity);

const CONTEXTS_FILE = path.join(CACHE_DIR, "contexts.ndjson");
const epmc = new RateLimiter(4);

export interface ContextRecord {
  src: string;
  dst: string;
  // The sentence(s) around the citation marker.
  context: string;
  // Section heading the citation sits under, when detectable.
  section: string | null;
  citingTitle: string;
  citedTitle: string;
}

interface EpmcResult {
  pmcid?: string;
  isOpenAccess?: string;
  inEPMC?: string;
}

async function findPmcid(doi: string): Promise<string | null> {
  // HAS_FT:Y is the real gate; isOpenAccess alone sends every request to a 404.
  // OA alone sends every request to a 404.
  const url =
    `${EPMC}/search?query=${encodeURIComponent(`DOI:"${doi}" AND HAS_FT:Y`)}` +
    `&format=json&resultType=core&pageSize=1`;

  const body = await getJSON<{ resultList?: { result?: EpmcResult[] } }>(
    url,
    epmc,
    { label: `epmc search ${doi}` },
  );

  if (isMissing(body)) return null;

  const hit = body.resultList?.result?.[0];
  if (!hit?.pmcid) return null;
  if (hit.isOpenAccess !== "Y" && hit.inEPMC !== "Y") return null;

  return hit.pmcid;
}

async function fetchFullText(pmcid: string): Promise<string | null> {
  // Not JSON — fetch directly, but keep the same politeness budget.
  await epmc.acquire();

  try {
    // No source prefix — `/PMC1234/fullTextXML`, not `/PMC/PMC1234/fullTextXML`.
    const res = await fetch(`${EPMC}/${pmcid}/fullTextXML`, {
      headers: { Accept: "application/xml" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

// Map each <ref id> to the DOI and title it points at.
function parseRefList(xml: string): Map<string, { doi?: string; title?: string }> {
  const out = new Map<string, { doi?: string; title?: string }>();

  for (const m of xml.matchAll(/<ref\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/ref>/gi)) {
    const [, id, inner] = m;
    const doi = inner.match(
      /<pub-id[^>]*pub-id-type="doi"[^>]*>([\s\S]*?)<\/pub-id>/i,
    )?.[1];
    const title = inner.match(/<article-title[^>]*>([\s\S]*?)<\/article-title>/i)?.[1];

    out.set(id, {
      doi: doi ? stripTags(doi).toLowerCase() : undefined,
      title: title ? stripTags(title).toLowerCase() : undefined,
    });
  }

  return out;
}

// Mark citations before stripping tags; positions shift once tags are removed.
function markAndFlatten(xml: string): string {
  return stripTags(
    xml.replace(
      /<xref\b[^>]*ref-type="bibr"[^>]*\brid="([^"]+)"[^>]*>[\s\S]*?<\/xref>/gi,
      (_m, rid: string) =>
        ` ${String(rid).split(/\s+/).map((r) => `⟦${r}⟧`).join(" ")} `,
    ),
  );
}

// Section titles, paired with the flattened body of each `<sec>`.
function sectionsOf(xml: string): { title: string; body: string }[] {
  const out: { title: string; body: string }[] = [];

  for (const m of xml.matchAll(/<sec\b[^>]*>([\s\S]*?)<\/sec>/gi)) {
    const inner = m[1];
    const title = inner.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    if (!title) continue;
    out.push({ title: stripTags(title), body: markAndFlatten(inner) });
  }

  return out;
}

// The sentence containing the marker, padded to neighbouring sentences.
function sentenceAround(text: string, marker: string): string | null {
  const at = text.indexOf(marker);
  if (at < 0) return null;

  const start = Math.max(0, text.lastIndexOf(".", Math.max(0, at - 1)) + 1);
  let end = text.indexOf(".", at + marker.length);
  if (end < 0) end = Math.min(text.length, at + 320);

  return text
    .slice(start, end + 1)
    .replace(/⟦[^⟧]*⟧/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const works = await readNDJSON<WorkRecord>(path.join(CACHE_DIR, "works.ndjson"));
  const edges = await readNDJSON<EdgeRecord>(path.join(CACHE_DIR, "edges.ndjson"));

  if (edges.length === 0) {
    console.error("\n  No edges. Run `pnpm expand` first.\n");
    process.exit(1);
  }

  const byId = new Map(works.map((w) => [w.openalexId, w]));

  // Group outbound edges by citing paper — one full text serves all of them.
  const byCiting = new Map<string, EdgeRecord[]>();
  for (const e of edges) {
    const list = byCiting.get(e.src);
    if (list) list.push(e);
    else byCiting.set(e.src, [e]);
  }

  // Spend the request budget on open-access papers first: far likelier to have text.
  // so spend the request budget on those first.
  const oaRank = (id: string) => {
    const s = byId.get(id)?.oaStatus ?? "closed";
    return s === "closed" || s === "unknown" ? 1 : 0;
  };

  const citing = [...byCiting.keys()]
    .filter((id) => byId.get(id)?.doi)
    .sort((a, b) => oaRank(a) - oaRank(b))
    .slice(0, LIMIT);

  const startAt = Number((await loadCheckpoint("fulltext-index")) ?? 0);

  console.log(`
  ${edges.length.toLocaleString()} edges across ${byCiting.size.toLocaleString()} citing papers.
  ${citing.length.toLocaleString()} have a DOI${startAt > 0 ? `, resuming at ${startAt}` : ""}.
`);

  let withText = 0;
  let extracted = 0;
  let noFullText = 0;

  for (let i = startAt; i < citing.length; i++) {
    const srcId = citing[i];
    const src = byId.get(srcId)!;
    const doi = src.doi!.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");

    const pmcid = await findPmcid(doi);
    if (!pmcid) {
      noFullText++;
      await saveCheckpoint("fulltext-index", String(i + 1));
      continue;
    }

    const xml = await fetchFullText(pmcid);
    if (!xml) {
      noFullText++;
      await saveCheckpoint("fulltext-index", String(i + 1));
      continue;
    }

    withText++;

    const refs = parseRefList(xml);
    const secs = sectionsOf(xml);
    const flat = markAndFlatten(xml);
    const rows: ContextRecord[] = [];

    for (const edge of byCiting.get(srcId)!) {
      const dst = byId.get(edge.dst);
      if (!dst) continue;

      const dstDoi = dst.doi
        ?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
        .toLowerCase();
      const dstTitle = dst.title.toLowerCase();

      // Match the bibliography entry by DOI, else by title.
      let rid: string | undefined;
      for (const [id, ref] of refs) {
        if (dstDoi && ref.doi === dstDoi) {
          rid = id;
          break;
        }
        if (!rid && ref.title && dstTitle.length > 20 && ref.title.includes(dstTitle.slice(0, 40))) {
          rid = id;
        }
      }

      if (!rid) continue;

      const marker = `⟦${rid}⟧`;
      const context = sentenceAround(flat, marker);
      if (!context || context.length < 30) continue;

      const section =
        secs.find((s) => s.body.includes(marker))?.title ?? null;

      rows.push({
        src: srcId,
        dst: edge.dst,
        context: context.slice(0, 900),
        section,
        citingTitle: src.title,
        citedTitle: dst.title,
      });
    }

    await appendNDJSON(CONTEXTS_FILE, rows);
    await saveCheckpoint("fulltext-index", String(i + 1));
    extracted += rows.length;

    if ((i + 1) % 10 === 0 || rows.length > 0) {
      console.log(
        `  [${i + 1}/${citing.length}] ${pmcid} · +${rows.length} contexts ` +
          `(${extracted} total, ${withText} papers with text)`,
      );
    }
  }

  const all = await readNDJSON<ContextRecord>(CONTEXTS_FILE);
  const withSection = all.filter((c) => c.section).length;

  console.log(`
  ────────────────────────────────────────────────
   CITATION CONTEXTS
  ────────────────────────────────────────────────
   Citing papers checked      ${citing.length.toLocaleString()}
   With OA full text          ${withText.toLocaleString()}
   Without full text          ${noFullText.toLocaleString()}
   ────────────────────────────────────────────────
   Contexts extracted         ${all.length.toLocaleString()}
   With a section heading     ${withSection.toLocaleString()}
   Edges left unknown         ${(edges.length - all.length).toLocaleString()}
  ────────────────────────────────────────────────

  Next: pnpm classify
`);
}

main().catch((err) => {
  console.error("\n  Failed:", err);
  console.error("  Re-run `pnpm fulltext` — it resumes from the last paper.\n");
  process.exit(1);
});
