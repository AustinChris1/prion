// Pull identifiers out of a pasted bibliography.

// arXiv papers are registered with DataCite under this prefix.
const ARXIV_DOI_PREFIX = "10.48550/arXiv.";

// `.` and `-` are legal inside a DOI, so only strip punctuation that cannot end one.
const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>,;]+)/gi;
const ARXIV_RE = /arxiv[:\s/]*([0-9]{4}\.[0-9]{4,5})(v\d+)?/gi;

function tidyDoi(raw: string): string | null {
  let doi = raw.trim();

  // PDF copy-paste wraps mid-identifier and leaves stray spaces.
  doi = doi.replace(/\s+/g, "");

  // Trailing citation punctuation, applied repeatedly: "…2016.01.017." -> "…017"
  while (/[.,;:)\]}>]$/.test(doi)) doi = doi.slice(0, -1);

  // Publisher pages append junk to the URL path.
  doi = doi.replace(/\/(full|abstract|pdf|epdf|meta)$/i, "");

  return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : null;
}

export interface ParsedRefs {
  ids: string[];
  // How many identifiers were found, before the caller's own cap.
  found: number;
  // Lines that looked like references but yielded no identifier.
  unresolvable: number;
}

export function parseReferences(text: string): ParsedRefs {
  const seen = new Set<string>();

  // Join hyphenated line-breaks from PDFs before matching.
  const cleaned = text.replace(/-\s*\n\s*/g, "").replace(/\r/g, "");

  for (const m of cleaned.matchAll(DOI_RE)) {
    const doi = tidyDoi(m[1]);
    if (doi) seen.add(`doi:${doi.toLowerCase()}`);
  }

  for (const m of cleaned.matchAll(ARXIV_RE)) {
    // OpenAlex indexes arXiv preprints under their DataCite DOI.
    seen.add(`doi:${(ARXIV_DOI_PREFIX + m[1]).toLowerCase()}`);
  }

  // Count numbered entries so we can say how many yielded nothing.
  const entries = (cleaned.match(/^\s*\[\d+\]/gm) ?? []).length;
  const ids = [...seen];

  return {
    ids,
    found: ids.length,
    unresolvable: Math.max(0, entries - ids.length),
  };
}

// Bare DOIs one-per-line still work; this handles both shapes.
export function looksLikeBibliography(text: string): boolean {
  return /^\s*\[\d+\]/m.test(text) || text.trim().split(/\n/).length > 3;
}
