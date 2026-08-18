// scripts/4-classify.ts — how load-bearing is each citation?

import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

import path from "node:path";
import {
  CACHE_DIR,
  appendNDJSON,
  readNDJSON,
  saveCheckpoint,
} from "./lib/fetcher";
import { classifyEdge, resolveProvider, type Provider } from "../lib/llm";
import { EDGE_WEIGHT } from "../lib/score";
import type { EdgeClass } from "../lib/types";
import type { ContextRecord } from "./3-fulltext";

const args = process.argv.slice(2);
const FORCE_HEURISTIC = args.includes("--heuristic");
const LIMIT = Number(
  args.find((a) => a.startsWith("--limit"))?.split("=")[1] ??
    args[args.indexOf("--limit") + 1] ??
    Infinity,
);

// Providers are rate-limited; a handful in flight is plenty.
const CONCURRENCY = 4;

const CONTEXTS_FILE = path.join(CACHE_DIR, "contexts.ndjson");

export interface ClassifiedEdge {
  src: string;
  dst: string;
  edgeClass: EdgeClass;
  weight: number | null;
  confidence: "high" | "medium" | "low";
  evidenceQuote: string;
  section: string | null;
  provider: Provider;
}

async function main() {
  const contexts = await readNDJSON<ContextRecord>(CONTEXTS_FILE);

  if (contexts.length === 0) {
    console.error("\n  No contexts. Run `pnpm fulltext` first.\n");
    process.exit(1);
  }

  const provider: Provider = FORCE_HEURISTIC ? "heuristic" : resolveProvider();
  const outFile = path.join(CACHE_DIR, `classified.${provider}.ndjson`);
  const ckpt = `classify-${provider}`;

  // Keyed per provider so the two outputs can be compared for the ablation.
  // outputs can be compared directly for the ablation.
  const done = new Set(
    (await readNDJSON<ClassifiedEdge>(outFile)).map((c) => `${c.src}|${c.dst}`),
  );

  const todo = contexts
    .filter((c) => !done.has(`${c.src}|${c.dst}`))
    .slice(0, LIMIT === Infinity ? undefined : LIMIT);

  console.log(`
  Provider: ${provider}${provider === "heuristic" ? " (no key needed)" : ` · ${process.env.PRION_LLM_MODEL ?? "default model"}`}
  ${contexts.length.toLocaleString()} contexts · ${done.size.toLocaleString()} already classified · ${todo.length.toLocaleString()} to do
`);

  if (todo.length === 0) {
    console.log("  Nothing to do.\n");
    return;
  }

  const results: ClassifiedEdge[] = [];
  const tally: Record<string, number> = {};
  let cursor = 0;
  let failures = 0;

  async function worker() {
    while (cursor < todo.length) {
      const i = cursor++;
      const c = todo[i];

      try {
        const out = await classifyEdge(
          {
            retractedTitle: c.citedTitle,
            citingTitle: c.citingTitle,
            context: c.context,
            section: c.section ?? undefined,
          },
          provider,
        );

        const row: ClassifiedEdge = {
          src: c.src,
          dst: c.dst,
          edgeClass: out.edgeClass,
          weight: EDGE_WEIGHT[out.edgeClass],
          confidence: out.confidence,
          evidenceQuote: out.evidenceQuote,
          section: c.section,
          provider: out.provider,
        };

        results.push(row);
        tally[out.edgeClass] = (tally[out.edgeClass] ?? 0) + 1;

        // Flush steadily so a crash never loses more than a few calls.
        if (results.length % 20 === 0) {
          await appendNDJSON(outFile, results.splice(0));
          await saveCheckpoint(ckpt, String(i));
          process.stdout.write(`\r  classified ${i + 1}/${todo.length}`);
        }
      } catch (err) {
        failures++;
        console.warn(`\n  edge ${c.src} -> ${c.dst} failed: ${String(err).slice(0, 160)}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker),
  );

  await appendNDJSON(outFile, results);
  process.stdout.write("\n");

  const all = await readNDJSON<ClassifiedEdge>(outFile);
  const loadBearing = all.filter(
    (c) => c.edgeClass === "load_bearing_data" || c.edgeClass === "load_bearing_method",
  ).length;
  const contrasting = all.filter((c) => c.edgeClass === "contrasting").length;
  const fellBack = all.filter((c) => c.provider === "heuristic").length;

  const pct = (n: number) => ((n / all.length) * 100).toFixed(1);

  console.log(`
  ────────────────────────────────────────────────
   CLASSIFIED EDGES — ${provider}
  ────────────────────────────────────────────────
${Object.entries(tally)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `   ${k.padEnd(24)} ${String(v).padStart(6)}`)
  .join("\n")}
   ────────────────────────────────────────────────
   Total classified           ${all.length.toLocaleString()}
   Load-bearing               ${loadBearing.toLocaleString()} (${pct(loadBearing)}%)
   Contrasting (score 0)      ${contrasting.toLocaleString()} (${pct(contrasting)}%)
   Failed                     ${failures.toLocaleString()}
${provider !== "heuristic" && fellBack > 0 ? `   Fell back to heuristic     ${fellBack.toLocaleString()}\n` : ""}  ────────────────────────────────────────────────

  Wrote ${outFile}

  Compare against the baseline:
    pnpm classify -- --heuristic
`);
}

main().catch((err) => {
  console.error("\n  Failed:", err);
  process.exit(1);
});
