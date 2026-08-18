import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Counts read from the committed corpus at build time.

const CACHE = path.join(process.cwd(), "data", "cache");

// External figure, measured from OpenAlex's own `is_retracted:true` count.
export const OPENALEX_RETRACTED = 134_147;

export interface CorpusStats {
  seeds: number;
  works: number;
  edges: number;
  contexts: number;
  classified: number;
}

async function countLines(file: string): Promise<number> {
  try {
    const text = await readFile(path.join(CACHE, file), "utf8");
    return text.split("\n").filter((l) => l.trim().length > 0).length;
  } catch {
    return 0;
  }
}

export async function corpusStats(): Promise<CorpusStats> {
  const [seeds, works, edges, contexts] = await Promise.all([
    countLines("seeds.ndjson"),
    countLines("works.ndjson"),
    countLines("edges.ndjson"),
    countLines("contexts.ndjson"),
  ]);

  // Classified output is per-provider, so sum whichever files exist.
  let classified = 0;
  try {
    for (const f of await readdir(CACHE)) {
      if (f.startsWith("classified.") && f.endsWith(".ndjson")) {
        classified += await countLines(f);
      }
    }
  } catch {
    // no cache directory in this environment
  }

  return { seeds, works, edges, contexts, classified };
}
