import type {
  ContaminationReport,
  Edge,
  EdgeClass,
  Path,
  RetractionReason,
  Timing,
  Work,
} from "./types";

// contrasting is 0 (disputing is not contamination); unknown is null, never guessed.
export const EDGE_WEIGHT: Record<EdgeClass, number | null> = {
  load_bearing_data: 1.0,
  load_bearing_method: 0.8,
  supporting: 0.5,
  incidental: 0.15,
  contrasting: 0.0,
  unknown: null,
};

// Not all retractions are equally load-bearing on the downstream claim.
export const REASON_SEVERITY: Record<RetractionReason, number> = {
  fabrication: 1.0,
  falsification: 1.0,
  error: 0.7,
  plagiarism: 0.5,
  duplication: 0.3,
  unknown: 0.6,
};

// Each additional hop dilutes the dependency.
export const HOP_DECAY = 0.55;

export function pathIsCertain(path: Path): boolean {
  return path.edges.every((e) => EDGE_WEIGHT[e.edgeClass] !== null);
}

// Severity of a single route, in [0, 1]. Returns null if any hop is unknown.
export function pathSeverity(path: Path): number | null {
  if (!pathIsCertain(path)) return null;

  const base = REASON_SEVERITY[path.seed.retractionReason ?? "unknown"];

  return path.edges.reduce((acc, edge, hop) => {
    const w = EDGE_WEIGHT[edge.edgeClass] as number;
    return acc * w * HOP_DECAY ** hop;
  }, base);
}

// Noisy-OR: several weak paths raise the score, none alone reaches certainty.
export function combine(severities: number[]): number {
  return 1 - severities.reduce((acc, s) => acc * (1 - s), 1);
}

// When did this citation happen, relative to the retraction?
export function classifyTiming(
  edge: Edge,
  seed: Work,
  citingWasCorrected: boolean,
): Timing {
  if (!seed.retractionDate) return "latent";

  const retractedYear = new Date(seed.retractionDate).getFullYear();

  if (edge.citationYear > retractedYear) return "post";
  return citingWasCorrected ? "pre" : "latent";
}

export function buildReport(
  target: Work,
  paths: Path[],
  correctedIds: ReadonlySet<string> = new Set(),
): ContaminationReport {
  const certain = paths.filter(pathIsCertain);
  const severities = certain
    .map(pathSeverity)
    .filter((s): s is number => s !== null);

  const timing: Record<Timing, number> = { pre: 0, post: 0, latent: 0 };

  for (const path of certain) {
    const leaf = path.edges.at(-1);
    if (!leaf) continue;
    timing[classifyTiming(leaf, path.seed, correctedIds.has(leaf.src))] += 1;
  }

  return {
    target,
    score: combine(severities),
    paths: certain,
    uncertainPaths: paths.length - certain.length,
    timing,
  };
}
