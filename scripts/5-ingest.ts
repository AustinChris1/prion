// scripts/5-ingest.ts — load the citation graph into HydraDB.

import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import path from "node:path";
import { readdir } from "node:fs/promises";
import {
  CACHE_DIR,
  loadCheckpoint,
  readNDJSON,
  requireEnv,
  saveCheckpoint,
} from "./lib/fetcher";
import type { WorkRecord } from "./lib/openalex";
import type { EdgeRecord } from "./2-expand";
import type { Seed } from "./1-seeds";
import type { ClassifiedEdge } from "./4-classify";
import {
  HYDRA_DB,
  ensureDatabase,
  ingestWorks,
  waitForIndexing,
  type WorkNode,
} from "../lib/hydra";

requireEnv("HYDRA_DB_API_KEY");

const LIMIT = Number(process.argv[2] ?? Infinity);

// 16 KiB metadata cap per item; 40 keeps requests comfortably small.
const BATCH = 40;

async function main() {
  const works = await readNDJSON<WorkRecord>(path.join(CACHE_DIR, "works.ndjson"));
  const edges = await readNDJSON<EdgeRecord>(path.join(CACHE_DIR, "edges.ndjson"));
  const seeds = await readNDJSON<Seed>(path.join(CACHE_DIR, "seeds.ndjson"));

  // Classified edges from step 4; the evidence quote becomes the relation's context.
  // evidence quote becomes the citation relation's context in the graph.
  const classified = new Map<string, ClassifiedEdge>();
  for (const file of await readdir(CACHE_DIR).catch(() => [] as string[])) {
    if (!file.startsWith("classified.") || !file.endsWith(".ndjson")) continue;
    for (const c of await readNDJSON<ClassifiedEdge>(path.join(CACHE_DIR, file))) {
      classified.set(`${c.src}|${c.dst}`, c);
    }
  }

  if (works.length === 0) {
    console.error("\n  No works found. Run `pnpm seeds` then `pnpm expand` first.\n");
    process.exit(1);
  }

  console.log(`
  Loaded ${works.length.toLocaleString()} works, ${edges.length.toLocaleString()} edges.
  Target database: ${HYDRA_DB}
`);

  // Retraction detail lives on the seeds, not the crawled work records.
  const seedById = new Map(seeds.map((s) => [s.openalexId, s]));

  // Outbound citations, restricted to works we actually hold.
  const present = new Set(works.map((w) => w.openalexId));
  const outbound = new Map<string, EdgeRecord[]>();

  for (const e of edges) {
    if (!present.has(e.src) || !present.has(e.dst)) continue;
    const list = outbound.get(e.src);
    if (list) list.push(e);
    else outbound.set(e.src, [e]);
  }

  const nodes: WorkNode[] = works.slice(0, LIMIT).map((w) => {
    const seed = seedById.get(w.openalexId);
    const out = outbound.get(w.openalexId) ?? [];

    return {
      id: w.openalexId,
      title: w.title,
      year: w.year,
      journal: w.journal,
      doi: w.doi,
      isRetracted: w.isRetracted || Boolean(seed),
      retractionDate: seed?.noticeDate ?? null,
      // Reason lands in step 1's Retraction Watch join; unknown until then.
      retractionReason: null,
      cites: out.map((e) => e.dst).slice(0, 60),
      // Capped: sentences go into content, which shares a per-item size budget.
      // per-item size budget.
      citedDetails: out.slice(0, 8).flatMap((e) => {
        const target = works.find((t) => t.openalexId === e.dst);
        if (!target) return [];

        const c = classified.get(`${e.src}|${e.dst}`);

        return [
          {
            id: e.dst,
            title: target.title,
            // Unclassified stays `unknown` — weight null, never guessed.
            edgeClass: c?.edgeClass ?? ("unknown" as const),
            evidence: c?.evidenceQuote ?? null,
            section: c?.section ?? null,
          },
        ];
      }),
    };
  });

  const done = new Set(
    ((await loadCheckpoint("ingest-done")) ?? "").split(",").filter(Boolean),
  );

  const todo = nodes.filter((n) => !done.has(n.id));

  console.log(`  ${nodes.length.toLocaleString()} to ingest, ${done.size.toLocaleString()} already done.`);
  console.log(`  ${todo.length.toLocaleString()} remaining.\n`);

  if (todo.length === 0) {
    console.log("  Nothing to do.\n");
    return;
  }

  console.log("  Waiting for database…");
  await ensureDatabase(HYDRA_DB);
  console.log("  Ready.\n");

  let accepted = 0;
  let indexed = 0;
  let failed = 0;

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);

    try {
      const res = await ingestWorks(batch, HYDRA_DB);
      accepted += res.accepted;

      const status = await waitForIndexing(res.ids, HYDRA_DB, 120_000);
      indexed += status.completed;
      failed += status.errored;

      for (const n of batch) done.add(n.id);
      await saveCheckpoint("ingest-done", [...done].join(","));

      console.log(
        `  [${Math.min(i + BATCH, todo.length)}/${todo.length}] ` +
          `accepted ${res.accepted} · indexed ${status.completed}` +
          (status.errored ? ` · errored ${status.errored}` : "") +
          (status.pending ? ` · still pending ${status.pending}` : ""),
      );
    } catch (err) {
      console.error(`  batch at ${i} failed: ${String(err).slice(0, 300)}`);
      failed += batch.length;
    }
  }

  const withEdges = nodes.filter((n) => n.cites.length > 0).length;
  const retracted = nodes.filter((n) => n.isRetracted).length;

  console.log(`
  ────────────────────────────────────────────────
   INGESTED INTO HYDRADB
  ────────────────────────────────────────────────
   Database                   ${HYDRA_DB}
   Works accepted             ${accepted.toLocaleString()}
   Confirmed indexed          ${indexed.toLocaleString()}
   Failed                     ${failed.toLocaleString()}
   ────────────────────────────────────────────────
   Works carrying edges       ${withEdges.toLocaleString()}
   Retracted works            ${retracted.toLocaleString()}
  ────────────────────────────────────────────────

  /api/trace now queries HydraDB first and falls back to live OpenAlex
  only for papers outside the corpus.
`);
}

main().catch((err) => {
  console.error("\n  Failed:", err);
  process.exit(1);
});
