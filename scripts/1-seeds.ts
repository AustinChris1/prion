// scripts/1-seeds.ts — the retracted seed set, and the ER baseline.

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
  requireEnv,
  saveCheckpoint,
} from "./lib/fetcher";

const MAILTO = requireEnv("OPENALEX_MAILTO");
const TARGET = Number(process.argv[2] ?? 5000);

const SEEDS_FILE = path.join(CACHE_DIR, "seeds.ndjson");
const PAGE = 200;

// OpenAlex groups topics into four domains; these are the two we want.
const DOMAINS = new Set(["Life Sciences", "Health Sciences"]);

const openalex = new RateLimiter(8);
const crossref = new RateLimiter(5);

interface OAWork {
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

interface OAPage {
  results: OAWork[];
  meta: { next_cursor: string | null; count: number };
}

interface CrossrefUpdate {
  type?: string;
  DOI?: string;
  label?: string;
  updated?: { "date-parts"?: number[][] };
}

interface CrossrefResponse {
  message?: {
    "updated-by"?: CrossrefUpdate[];
    "update-to"?: CrossrefUpdate[];
  };
}

export interface Seed {
  openalexId: string;
  doi: string | null;
  pmid: string | null;
  title: string;
  year: number | null;
  journal: string | null;
  oaStatus: string | null;
  citedByCount: number;
  // Filled only when Crossref links this article to a retraction notice.
  noticeDoi: string | null;
  noticeDate: string | null;
  // How the link was established — the ER baseline hinges on this.
  linkSource: "crossref_updated_by" | "crossref_update_to" | "unlinked";
}

const SELECT = [
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

async function harvest(): Promise<OAWork[]> {
  const out: OAWork[] = [];
  let cursor: string | null = (await loadCheckpoint("seeds-cursor")) ?? "*";
  let pages = 0;

  console.log(`\n  Harvesting retracted works from OpenAlex (target ${TARGET})…`);

  while (out.length < TARGET && cursor) {
    // Annotated to break the cursor -> url -> page -> cursor inference cycle.
    const url: string =
      `https://api.openalex.org/works` +
      `?filter=is_retracted:true` +
      `&sort=cited_by_count:desc` +
      `&per-page=${PAGE}` +
      `&cursor=${encodeURIComponent(cursor)}` +
      `&select=${SELECT}` +
      `&mailto=${encodeURIComponent(MAILTO)}`;

    const page: OAPage = await getJSON<OAPage>(url, openalex, {
      label: "openalex works",
    });
    if (isMissing(page) || !page.results?.length) break;

    if (pages === 0) {
      console.log(`  OpenAlex reports ${page.meta.count.toLocaleString()} retracted works total.`);
    }

    const kept = page.results.filter((w) => {
      const domain = w.primary_topic?.domain?.display_name;
      return domain ? DOMAINS.has(domain) : false;
    });

    out.push(...kept);
    pages++;

    cursor = page.meta.next_cursor;
    if (cursor) await saveCheckpoint("seeds-cursor", cursor);

    process.stdout.write(
      `\r  page ${pages} · kept ${out.length}/${TARGET} biomedical`,
    );
  }

  process.stdout.write("\n");
  return out.slice(0, TARGET);
}

function toDate(u?: CrossrefUpdate): string | null {
  const parts = u?.updated?.["date-parts"]?.[0];
  if (!parts?.length) return null;
  const [y, m = 1, d = 1] = parts;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const isRetraction = (u: CrossrefUpdate) =>
  (u.type ?? "").toLowerCase().includes("retract") ||
  (u.label ?? "").toLowerCase().includes("retract");

async function linkNotice(
  doi: string | null,
): Promise<Pick<Seed, "noticeDoi" | "noticeDate" | "linkSource">> {
  const unlinked = {
    noticeDoi: null,
    noticeDate: null,
    linkSource: "unlinked" as const,
  };

  if (!doi) return unlinked;

  const clean = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  const url = `https://api.crossref.org/works/${encodeURIComponent(clean)}?mailto=${encodeURIComponent(MAILTO)}`;

  const body = await getJSON<CrossrefResponse>(url, crossref, { label: `crossref ${clean}` });
  if (isMissing(body) || !body.message) return unlinked;

  // The retracted article normally carries `updated-by` pointing at the notice.
  const byRetraction = (body.message["updated-by"] ?? []).find(isRetraction);
  if (byRetraction?.DOI) {
    return {
      noticeDoi: byRetraction.DOI,
      noticeDate: toDate(byRetraction),
      linkSource: "crossref_updated_by",
    };
  }

  // Some publishers deposit it the other way round.
  const toRetraction = (body.message["update-to"] ?? []).find(isRetraction);
  if (toRetraction?.DOI) {
    return {
      noticeDoi: toRetraction.DOI,
      noticeDate: toDate(toRetraction),
      linkSource: "crossref_update_to",
    };
  }

  return unlinked;
}

async function main() {
  const already = await readNDJSON<Seed>(SEEDS_FILE);
  const seen = new Set(already.map((s) => s.openalexId));
  if (already.length) {
    console.log(`  Resuming — ${already.length} seeds already on disk.`);
  }

  const works = (await harvest()).filter((w) => !seen.has(w.id));
  console.log(`\n  Linking ${works.length} articles to their retraction notices…`);

  const batch: Seed[] = [];
  let done = 0;

  for (const w of works) {
    const link = await linkNotice(w.doi);

    batch.push({
      openalexId: w.id,
      doi: w.doi,
      pmid: w.ids?.pmid ?? null,
      title: w.display_name ?? "(untitled)",
      year: w.publication_year,
      journal: w.primary_location?.source?.display_name ?? null,
      oaStatus: w.open_access?.oa_status ?? null,
      citedByCount: w.cited_by_count,
      ...link,
    });

    done++;
    if (batch.length >= 50) {
      await appendNDJSON(SEEDS_FILE, batch.splice(0));
    }
    if (done % 25 === 0) {
      process.stdout.write(`\r  linked ${done}/${works.length}`);
    }
  }

  await appendNDJSON(SEEDS_FILE, batch);
  process.stdout.write("\n");

  const all = await readNDJSON<Seed>(SEEDS_FILE);
  const linked = all.filter((s) => s.linkSource !== "unlinked").length;
  const withDoi = all.filter((s) => s.doi).length;
  const rate = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(1) : "0.0");

  console.log(`
  ────────────────────────────────────────────────
   ER BASELINE — raw registry metadata
  ────────────────────────────────────────────────
   Seeds harvested            ${all.length}
   With a DOI                 ${withDoi}
   Linked to a notice         ${linked}

   Link rate (of all seeds)   ${rate(linked, all.length)}%
   Link rate (of DOI'd seeds) ${rate(linked, withDoi)}%

   ${all.length - linked} retracted papers cannot be connected to their own
   retraction notice by Crossref metadata alone.

   This is the number HydraDB's entity resolution has to beat.
   Record it in the README before running scripts/5-ingest.ts.
  ────────────────────────────────────────────────
`);

  console.log(`  Wrote ${SEEDS_FILE}\n`);
}

main().catch((err) => {
  console.error("\n  Failed:", err);
  process.exit(1);
});
