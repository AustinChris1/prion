// How a citation relates the citing paper to the cited one.
export type EdgeClass =
  | "load_bearing_data"    // reuses the cited paper's data or effect estimate
  | "load_bearing_method"  // the citing paper's method depends on it
  | "supporting"           // cited as evidence for a central claim
  | "incidental"           // background, "see also", passing mention
  | "contrasting"          // cited in order to dispute or refute it
  | "unknown";             // no open-access full text — never guessed

export type RetractionReason =
  | "fabrication"
  | "falsification"
  | "plagiarism"
  | "error"
  | "duplication"
  | "unknown";

export interface Work {
  openalexId: string;
  doi?: string;
  pmid?: string;
  title: string;
  year: number;
  journal?: string;
  oaStatus?: string;
  isRetracted: boolean;
  retractionDate?: string;
  retractionReason?: RetractionReason;
}

export interface Edge {
  src: string;   // citing work (OpenAlex id)
  dst: string;   // cited work
  edgeClass: EdgeClass;
  section?: string;
  evidence?: string;
  citationYear: number;
}

// One route from a target paper back to a retracted seed.
export interface Path {
  edges: Edge[];
  seed: Work;
}

// When the contamination happened, relative to the retraction.
export type Timing = "pre" | "post" | "latent";

export interface ContaminationReport {
  target: Work;
  score: number;          // 0–1, excludes anything uncertain
  paths: Path[];
  uncertainPaths: number; // paths containing an `unknown` edge — reported, never scored
  timing: Record<Timing, number>;
}
