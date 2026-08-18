// scripts/2-expand.ts — two-hop citation closure.

import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import path from "node:path";
import {
  CACHE_DIR,
  appendNDJSON,
  loadCheckpoint,
  readNDJSON,
  requireEnv,
  saveCheckpoint,
} from "./lib/fetcher";
import { citersOf, toWorkRecord, type OAWork, type WorkRecord } from "./lib/openalex";
import type { Seed } from "./1-seeds";

const MAILTO = requireEnv("OPENALEX_MAILTO");
const SEED_LIMIT = Number(process.argv[2] ?? Infinity);

// Request budget per seed; without caps one heavily-cited seed trips the burst limit.
const HOP1_LIMIT = Number(process.env.PRION_HOP1_LIMIT ?? 500);
const HOP1_EXPAND = Number(process.env.PRION_HOP1_EXPAND ?? 30);
const HOP2_PER_NODE = Number(process.env.PRION_HOP2_LIMIT ?? 20);

// Skip hop-2 for hop-1 works nobody cites — saves a request per node.
const HOP2_MIN_CITATIONS = 1;

const SEEDS_FILE = path.join(CACHE_DIR, "seeds.ndjson");
const WORKS_FILE = path.join(CACHE_DIR, "works.ndjson");
const EDGES_FILE = path.join(CACHE_DIR, "edges.ndjson");

export interface EdgeRecord {
  // The citing work.
  src: string;
  // The cited work.
  dst: string;
  // Publication year of the citing work — drives the temporal split.
  citationYear: number | null;
  // 1 = cites a seed directly, 2 = cites something that cites a seed.
  hop: 1 | 2;
}

async function main() {
  const seeds = (await readNDJSON<Seed>(SEEDS_FILE)).slice(0, SEED_LIMIT);

  if (seeds.length === 0) {
    console.error(`\n  No seeds found. Run \`pnpm seeds\` first.\n`);
    process.exit(1);
  }

  // Rebuild the dedupe set from disk so a resumed run doesn't re-emit works.
  const known = new Set<string>(
    (await readNDJSON<WorkRecord>(WORKS_FILE)).map((w) => w.openalexId),
  );

  const startAt = Number((await loadCheckpoint("expand-seed-index")) ?? 0);

  console.log(`
  Expanding ${seeds.length} seeds.
  Caps: ${HOP1_LIMIT} hop-1 collected, top ${HOP1_EXPAND} expanded, ${HOP2_PER_NODE} hop-2 each.
  ${known.size.toLocaleString()} works already on disk${startAt > 0 ? `, resuming at seed ${startAt}` : ""}.
`);

  // Seeds themselves are depth 0.
  const seedRecords: WorkRecord[] = seeds
    .filter((s) => !known.has(s.openalexId))
    .map((s) => {
      known.add(s.openalexId);
      return {
        openalexId: s.openalexId,
        doi: s.doi,
        pmid: s.pmid,
        title: s.title,
        year: s.year,
        journal: s.journal,
        oaStatus: s.oaStatus,
        citedByCount: s.citedByCount,
        isRetracted: true,
        depth: 0,
      };
    });

  await appendNDJSON(WORKS_FILE, seedRecords);

  let totalEdges = 0;
  let hop2Requests = 0;
  const started = Date.now();

  for (let i = startAt; i < seeds.length; i++) {
    const seed = seeds[i];

    const works: WorkRecord[] = [];
    const edges: EdgeRecord[] = [];

    const hop1 = await citersOf(seed.openalexId, MAILTO, HOP1_LIMIT);

    for (const w of hop1) {
      if (!known.has(w.id)) {
        known.add(w.id);
        works.push(toWorkRecord(w, 1));
      }
      edges.push({
        src: w.id,
        dst: seed.openalexId,
        citationYear: w.publication_year,
        hop: 1,
      });
    }

    // Sorted by citation count, so the slice keeps the widest-spreading works.
    // likely to have propagated the contamination furthest.
    const worthExpanding = hop1
      .filter((w) => w.cited_by_count >= HOP2_MIN_CITATIONS)
      .slice(0, HOP1_EXPAND);

    for (const parent of worthExpanding) {
      const hop2: OAWork[] = await citersOf(parent.id, MAILTO, HOP2_PER_NODE);
      hop2Requests++;

      for (const w of hop2) {
        if (!known.has(w.id)) {
          known.add(w.id);
          works.push(toWorkRecord(w, 2));
        }
        edges.push({
          src: w.id,
          dst: parent.id,
          citationYear: w.publication_year,
          hop: 2,
        });
      }
    }

    await appendNDJSON(WORKS_FILE, works);
    await appendNDJSON(EDGES_FILE, edges);
    await saveCheckpoint("expand-seed-index", String(i + 1));

    totalEdges += edges.length;

    const elapsed = (Date.now() - started) / 1000;
    const perSeed = elapsed / (i - startAt + 1);
    const remaining = Math.round((perSeed * (seeds.length - i - 1)) / 60);

    console.log(
      `  [${i + 1}/${seeds.length}] ${seed.title.slice(0, 48)}…\n` +
        `      hop1 ${hop1.length}  ·  hop2 requests ${worthExpanding.length}  ·  ` +
        `+${works.length} works  +${edges.length} edges  ·  ~${remaining}m left`,
    );
  }

  const allWorks = await readNDJSON<WorkRecord>(WORKS_FILE);
  const allEdges = await readNDJSON<EdgeRecord>(EDGES_FILE);
  const byDepth = (d: number) => allWorks.filter((w) => w.depth === d).length;

  console.log(`
  ────────────────────────────────────────────────
   GRAPH BUILT
  ────────────────────────────────────────────────
   Seeds (retracted)          ${byDepth(0).toLocaleString()}
   Hop 1 (cite a seed)        ${byDepth(1).toLocaleString()}
   Hop 2 (cite a citer)       ${byDepth(2).toLocaleString()}
   ────────────────────────────────────────────────
   Total works                ${allWorks.length.toLocaleString()}
   Total edges                ${allEdges.length.toLocaleString()}
   Open-access hop-1+ works   ${allWorks
     .filter((w) => w.depth > 0 && w.oaStatus && w.oaStatus !== "closed")
     .length.toLocaleString()}   <- classifiable in step 3
   ────────────────────────────────────────────────
   Added this run: ${totalEdges.toLocaleString()} edges, ${hop2Requests.toLocaleString()} hop-2 requests
  ────────────────────────────────────────────────

  Next: pnpm fulltext
`);
}

main().catch((err) => {
  console.error("\n  Failed:", err);
  console.error("  Re-run `pnpm expand` — it resumes from the last completed seed.\n");
  process.exit(1);
});
