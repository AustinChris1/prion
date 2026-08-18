import { RateLimiter, getJSON, isMissing } from "./fetcher";

// 5/s sits inside the polite pool; 8/s tripped a 429 when sustained.
// testing once sustained across thousands of consecutive requests.
export const openalex = new RateLimiter(5);

// Only ask for the fields we store — payloads are ~10x smaller.
export const SELECT = [
  "id",
  "doi",
  "ids",
  "display_name",
  "publication_year",
  "cited_by_count",
  "is_retracted",
  "open_access",
  "primary_location",
  "primary_topic",
].join(",");

export interface OAWork {
  id: string;
  doi: string | null;
  ids?: { pmid?: string; doi?: string };
  display_name: string | null;
  publication_year: number | null;
  cited_by_count: number;
  is_retracted: boolean;
  open_access?: { oa_status?: string };
  primary_location?: { source?: { display_name?: string } | null } | null;
  primary_topic?: { domain?: { display_name?: string } } | null;
}

export interface OAPage {
  results: OAWork[];
  meta: { next_cursor: string | null; count: number };
}

// Flat record as stored in works.ndjson.
export interface WorkRecord {
  openalexId: string;
  doi: string | null;
  pmid: string | null;
  title: string;
  year: number | null;
  journal: string | null;
  oaStatus: string | null;
  citedByCount: number;
  isRetracted: boolean;
  // Hops from the nearest retracted seed. 0 = the seed itself.
  depth: number;
}

// OpenAlex returns PMIDs as full URLs; we want the bare identifier.
export function barePmid(raw?: string): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d+)\s*$/);
  return m ? m[1] : null;
}

export function toWorkRecord(w: OAWork, depth: number): WorkRecord {
  return {
    openalexId: w.id,
    doi: w.doi,
    pmid: barePmid(w.ids?.pmid),
    title: w.display_name ?? "(untitled)",
    year: w.publication_year,
    journal: w.primary_location?.source?.display_name ?? null,
    oaStatus: w.open_access?.oa_status ?? null,
    citedByCount: w.cited_by_count,
    isRetracted: w.is_retracted,
    depth,
  };
}

// Every work that cites `openalexId`, newest-first by citation count.
export async function citersOf(
  openalexId: string,
  mailto: string,
  limit = Infinity,
): Promise<OAWork[]> {
  const shortId = openalexId.replace("https://openalex.org/", "");
  const out: OAWork[] = [];
  let cursor: string | null = "*";

  while (cursor && out.length < limit) {
    const url: string =
      `https://api.openalex.org/works` +
      `?filter=cites:${shortId}` +
      `&sort=cited_by_count:desc` +
      `&per-page=${Math.min(200, limit === Infinity ? 200 : limit)}` +
      `&cursor=${encodeURIComponent(cursor)}` +
      `&select=${SELECT}` +
      `&mailto=${encodeURIComponent(mailto)}`;

    const page: OAPage = await getJSON<OAPage>(url, openalex, {
      label: `citers of ${shortId}`,
    });

    if (isMissing(page) || !page.results?.length) break;

    out.push(...page.results);
    cursor = page.meta.next_cursor;
  }

  return out.slice(0, limit === Infinity ? undefined : limit);
}
