# PRION — Build Spec

**Retractions don't stop at the paper.**

Hack Hydra, Track 1 (Enterprise Context & Ontology). Submission due **Aug 20, 2026, 11:59 PM PT**.
Stack: TypeScript, Next.js (App Router), pnpm, Vercel, HydraDB, Anthropic API.

---

## 0. The one architectural decision that shapes everything

**Vercel cannot run the pipeline.** Serverless functions have hard execution ceilings; the OpenAlex crawl and the LLM classification pass run for hours. So the project splits in two:

```
scripts/     ← runs on YOUR machine. Long-lived. Writes into HydraDB + a committed cache.
app/         ← runs on Vercel. Read-only against HydraDB. Every request is fast.
```

The web app never crawls, never classifies, never blocks. It queries a graph that is already built. This is also the honest answer to "does it work end to end?" — yes, and the ingest is reproducible from a committed manifest.

The only long-running thing on Vercel is a **Vercel Cron** job (daily) that pulls new retractions and fires watchlist alerts. That's a few seconds of work, well inside limits.

---

## 1. Repo layout

```
prion/
├── app/
│   ├── page.tsx                  # Check: paste a DOI / PMID / .bib
│   ├── paper/[doi]/page.tsx      # Contamination report + rendered paths
│   ├── watchlist/page.tsx
│   ├── review/page.tsx           # Systematic-review auditor
│   └── api/
│       ├── trace/route.ts        # POST { doi } -> contamination paths
│       ├── bib/route.ts          # POST .bib text -> per-entry verdicts
│       ├── watch/route.ts
│       └── cron/retractions/route.ts
├── lib/
│   ├── hydra.ts                  # HydraDB client + typed query helpers
│   ├── score.ts                  # contamination scoring (shared w/ scripts)
│   └── types.ts
├── scripts/
│   ├── 1-seeds.ts                # retracted works -> data/cache/seeds.ndjson
│   ├── 2-expand.ts               # 2-hop citation closure
│   ├── 3-fulltext.ts             # Europe PMC OA full text for citing papers
│   ├── 4-classify.ts             # Anthropic Batch API -> edge classes
│   ├── 5-ingest.ts               # everything -> HydraDB
│   └── 6-eval.ts                 # ER lift, classifier precision, baseline
├── data/
│   ├── cache/                    # gzipped ndjson, committed
│   └── gold/edges-200.jsonl      # hand-labeled evaluation set
├── public/prion-mark.svg
├── SPEC.md
├── README.md
└── LICENSE                       # MIT
```

```bash
pnpm create next-app@latest prion --typescript --app --tailwind --eslint --no-src-dir
pnpm add @hydradb/sdk @anthropic-ai/sdk zod
pnpm add -D tsx @types/node
```

Run pipeline steps with `pnpm tsx scripts/1-seeds.ts`.

---

## 2. Day 0 spike — 2 hours, before anything else

Two unknowns can reshape the design. Resolve both before writing pipeline code.

1. **HydraDB graph traversal depth.** Does `/context/relations` return multi-hop relationships, or only 1-hop neighbors? Does `query` with `graph_context` traverse deeper? Write a 30-line script: ingest 5 fake papers in a citation chain A→B→C, then try to retrieve the full path from A. **If multi-hop is native, use it.** If not, Plan B is client-side iterative 1-hop expansion with memoization — same result, more round trips, and you say so plainly in the README.
2. **Track 1 dataset policy.** The rules explicitly permit public datasets with README disclosure, but confirm in Discord that Track 1 accepts a submission built on your own public corpus rather than the provided 9-platform one. Ask on day one; the answer costs you nothing and de-risks everything.

---

## 3. Data sources

All free, all public, no auth walls. Cache every response to `data/cache/` keyed by URL hash — you will re-run these scripts many times and you must not re-hammer the APIs.

| Source | Endpoint | Role |
|---|---|---|
| **OpenAlex** | `https://api.openalex.org/works?mailto=you@example.com` | Citation graph, both directions. Free, no key. Polite pool: ~100k req/day, 10/sec, `mailto` required. |
| **Crossref** | `https://api.crossref.org/works/{doi}` | `update-to` relations — links a retraction notice to the article it retracts. |
| **Retraction Watch** | Public CC0 dataset distributed via Crossref | Retraction reasons (fabrication / plagiarism / error / duplication). |
| **Europe PMC** | `https://www.ebi.ac.uk/europepmc/webservices/rest/` | Open-access full text for citation-context classification. |

Key OpenAlex fields you will use:

- `is_retracted` (boolean) — **this is your seeding shortcut**; `filter=is_retracted:true` gives you the seed set directly.
- `referenced_works` — outbound citations on a work.
- `filter=cites:W12345` — inbound citations (paginate with `cursor=*`, `per-page=200`).
- `ids.doi`, `ids.pmid`, `publication_year`, `open_access.oa_status`, `authorships`, `primary_location.source`.

Verify the exact Retraction Watch CSV path and Europe PMC full-text route on day one — those two have moved before.

### Scope (keeps this finishable in 5 days)

```
seeds        = top 5,000 most-cited retracted works, biomedicine
hop-1        = all direct citers of each seed        (~120–180k works)
hop-2        = top 20 citers per hop-1 node, by citation count  (sampled, ~150k)
classified   = ~8,000 edges where Europe PMC OA full text exists
everything else -> edge_class: "unknown"
```

Design for the full corpus, run on this slice, document the scaling path in the README. A working 300k-node graph beats a broken 3M-node one.

---

## 4. HydraDB data model

One database, `prion`. Object types distinguished by a metadata field, since the graph is derived from ingested content.

### Metadata schema (`PATCH /databases/{db}/metadata-schema`)

```ts
{
  node_type:      "work" | "notice" | "edge",
  openalex_id:    string,
  doi:            string,
  pmid:           string,
  year:           number,
  field:          string,        // OpenAlex concept, top-level
  journal:        string,
  is_retracted:   boolean,
  retraction_date: string,       // ISO
  retraction_reason: string,     // fabrication | falsification | plagiarism | error | duplication | unknown
  oa_status:      string,
  // edges only:
  src_id:         string,
  dst_id:         string,
  edge_class:     string,        // see §6
  edge_weight:    number,
  citation_year:  number,
  section:        string         // methods | results | intro | discussion | unknown
}
```

`node_type` is the discriminator on every filter. `src_id`/`dst_id` are OpenAlex IDs, always.

### What HydraDB actually does (write this section into your README verbatim)

Four primitives, each load-bearing:

1. **Entity resolution** — the headline. Retraction metadata is genuinely broken: notices frequently aren't linked to the article they retract, and the same work exists as preprint + published + DOI + PMID. You feed HydraDB the notice text and the article records and let its ER unify them. **Measure it**: `%` of retraction notices resolved to their article vs. raw Crossref `update-to` coverage. That single number is your strongest possible answer to "did HydraDB do real work?"
2. **Graph traversal** — `graph_context` on `/query` plus `/context/relations` to walk citation ancestry.
3. **Temporal** — point-in-time queries separating pre-retraction, post-retraction, and latent contamination.
4. **Metadata filtering** — scoping traversals by field, year, journal.

---

## 5. Pipeline

### `1-seeds.ts`
```
OpenAlex filter=is_retracted:true, biomedicine concepts, sort by cited_by_count desc, take 5000
  ↓ for each: Crossref /works/{doi} -> update-to relation -> notice DOI
  ↓ join Retraction Watch -> retraction reason + date
  → data/cache/seeds.ndjson
```
Record two counters: how many seeds Crossref linked to a notice, and how many you couldn't link. That's your ER baseline — HydraDB has to beat it.

### `2-expand.ts`
```
for each seed: OpenAlex filter=cites:{id}, cursor-paginate all
for each hop-1 work: take its top 20 citers by cited_by_count
  → data/cache/works.ndjson, data/cache/edges.ndjson
```
Rate-limit to 8 req/sec with a token bucket. Checkpoint after every seed so a crash resumes instead of restarting. This is the long one — start it Saturday and let it run.

### `3-fulltext.ts`
```
for each edge where the citing work has oa_status in {gold, green, hybrid}:
  Europe PMC fullTextXML -> extract the sentence(s) containing the citation marker
  + the section heading it sits under
  → data/cache/contexts.ndjson   (cap at ~8,000)
```

### `4-classify.ts` — see §6

### `5-ingest.ts`
Ingest works, notices, and edges into HydraDB with the metadata above; poll `/context/status` until `indexing_status === "completed"`. Batch ingests and checkpoint IDs so re-runs are incremental.

### `6-eval.ts` — see §8

---

## 6. Edge classification

**Not every citation is a dependency.** This is the technical core: without it the whole thing is a firehose of false positives.

### Classes

| Class | Weight | Meaning |
|---|---|---|
| `load_bearing_data` | 1.0 | The citing paper reuses the cited paper's data or effect estimate (pooled in a meta-analysis, reanalyzed) |
| `load_bearing_method` | 0.8 | The citing paper's method depends on the cited work |
| `supporting` | 0.5 | Cited as evidence for a central claim |
| `incidental` | 0.15 | Background, "see also", passing reference |
| `contrasting` | **0.0** | Cited in order to dispute or refute it |
| `unknown` | `null` | No OA full text — **never guessed** |

`contrasting` at zero is the insight that makes this credible: citing a retracted paper *to criticize it* is not contamination. A tool that flags those looks naive; a tool that excludes them looks like it was built by someone who understands the literature.

`unknown` at `null` — not a default weight — is your abstention story. Report contamination score **and** `uncertain_paths: n` as separate numbers. Never fold a guess into the score.

### Model and cost

Use **`claude-opus-5`** via the **Message Batches API** (50% discount, results within an hour).

```ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const EdgeClass = z.object({
  edge_class: z.enum([
    "load_bearing_data", "load_bearing_method",
    "supporting", "incidental", "contrasting",
  ]),
  confidence: z.enum(["high", "medium", "low"]),
  evidence_quote: z.string(),
});

const batch = await client.messages.batches.create({
  requests: contexts.map((c) => ({
    custom_id: `${c.src_id}__${c.dst_id}`,
    params: {
      model: "claude-opus-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(EdgeClass) },
      system: CLASSIFY_SYSTEM,          // stable prefix — cached
      messages: [{ role: "user", content: renderContext(c) }],
    },
  })),
});

// poll until processing_status === "ended"
for await (const r of await client.messages.batches.results(batch.id)) {
  if (r.result.type !== "succeeded") continue;
  // key by r.custom_id — results arrive in ANY order, never by position
}
```

Two things that matter: results come back **unordered**, so key by `custom_id`; and `max_tokens` caps thinking + output together on Opus 5, so don't set it to 512.

**Budget at 8,000 edges** (~2k input tokens each, ~150 output): roughly **$45** at batch rates ($2.50/$12.50 per MTok). If you want it cheaper, `claude-haiku-4-5` drops it to about $9 — your call, but classify the 200-edge gold set with Opus 5 either way so your reported precision reflects the model you shipped.

### Classification prompt shape

Give it: the retracted paper's title + abstract, the citing paper's title, the extracted citation sentence(s), and the section heading. Ask for the class, a confidence, and **the exact quote** that justifies it. The quote is not decoration — it's what you render in the UI so a reader can check your work, and it's what makes the classifier auditable during your gold-set eval.

---

## 7. Contamination scoring

`lib/score.ts`, shared between pipeline and app so the numbers can never drift.

```ts
const REASON_SEVERITY: Record<string, number> = {
  fabrication: 1.0, falsification: 1.0, error: 0.7,
  plagiarism: 0.5, duplication: 0.3, unknown: 0.6,
};

const DECAY = 0.55;

// severity of one path from target -> ... -> retracted seed
function pathSeverity(path: Edge[], seed: Work): number {
  const base = REASON_SEVERITY[seed.retraction_reason] ?? 0.6;
  return path.reduce(
    (acc, e, hop) => acc * e.weight * Math.pow(DECAY, hop),
    base,
  );
}

// noisy-OR across independent paths
function score(paths: Path[]): number {
  return 1 - paths.reduce((acc, p) => acc * (1 - pathSeverity(p)), 1);
}
```

Paths containing any `unknown` edge are **excluded from the score** and counted separately as `uncertain_paths`. The UI shows both: a number you stand behind, and an honest count of what you couldn't determine.

### The temporal split — the part only HydraDB gives you

For each contaminating path, compare the citing paper's publication date against the seed's retraction date:

- **pre-retraction** — cited before the retraction. Forgivable.
- **post-retraction** — cited after. Negligent.
- **latent** — cited before the retraction, and the citing paper has had no correction since. **This is the largest and most invisible category**, and it only exists as a query because your database can answer "what was true as of this date."

Show these as three distinct counts everywhere. It is the single most differentiated thing on screen.

---

## 8. Metrics — build these, they win "result quality"

`6-eval.ts` outputs a JSON blob the app renders as a chart.

1. **ER lift** — `%` of retraction notices resolved to their article via HydraDB vs. raw Crossref `update-to`. Headline number.
2. **Classifier precision/recall** — against `data/gold/edges-200.jsonl`, 200 edges you hand-label on Tuesday. Two hours of work; almost nobody submits this.
3. **Baseline comparison** — a 30-line naive checker: "does this paper cite any retracted work, anywhere in its ancestry?" Report how many papers it flags vs. how many PRION flags. The naive version will flag an order of magnitude more. That gap, on a chart, is your result-quality argument.
4. **Discovery count** — how many papers in your slice have a ≥1 load-bearing dependency on a retracted work and no subsequent correction. This is a real finding about the live literature.

Pick **three real contaminated papers** with clickable DOIs and put them on screen in the demo. A judge opening a live journal page beats any benchmark.

---

## 9. Web app surfaces

| Route | Does |
|---|---|
| `/` | Paste DOI / PMID / `.bib`. One input, one button. |
| `/paper/[doi]` | Contamination report: score, uncertain-path count, the three temporal categories, and every path rendered as an indented chain with the evidence quote on each edge. |
| `/watchlist` | Upload a `.bib`, get alerted when any ancestor is retracted later. |
| `/review` | Reference list → which pooled studies are retracted. |

The path rendering is the product. Not a score in a box — the actual chain, each hop labeled with its class and quote, terminating in a red retracted node with its reason and date.

---

## 10. Five days

| Day | Ship | Done when |
|---|---|---|
| **Sat 15** | Day-0 spike; `1-seeds.ts`; HydraDB schema; ER pass | You have the ER lift number |
| **Sun 16–17** | `2-expand.ts` running in background; `3-fulltext.ts`; `4-classify.ts` batch submitted | Batch is processing overnight |
| **Mon 18** | `5-ingest.ts`; `lib/score.ts`; `/paper/[doi]` with rendered paths | You can trace a real DOI end to end |
| **Tue 19** | Temporal split UI; watchlist; hand-label 200 gold edges; `6-eval.ts` + baseline chart | Charts render |
| **Wed 20** | README, MIT license, 3-min video, **submit early afternoon** | Submitted, not at 11:58 PM |

**Cut list if behind:** drop `/watchlist`, then `/review`. Never drop edge classification or the temporal split — those are the project.

---

## 11. Environment

```bash
# .env.local  (gitignored)
HYDRA_DB_API_KEY=
ANTHROPIC_API_KEY=
OPENALEX_MAILTO=you@example.com
```

`.env.example` with these keys, empty, **is** committed — judges need to know what to set.

---

## 12. Submission checklist

- [ ] Public GitHub repo, no access request needed
- [ ] All commits dated after Aug 12, 2026 (fresh repo — `git init` here, don't import anything)
- [ ] `LICENSE` — MIT
- [ ] README: setup steps, **explicit HydraDB usage section**, third-party attribution, dataset disclosure (OpenAlex CC0, Retraction Watch CC0, Crossref, Europe PMC), scaling path
- [ ] Demo video ≤ 3:00, YouTube or unlisted
- [ ] Google Form: name, description, problem statement, tech stack, team, repo link, video link
- [ ] Deployed Vercel URL in the README

### Video beats (180 seconds)

`0:00` the problem — retractions don't propagate · `0:20` paste a DOI → contamination paths with evidence quotes · `0:55` the three-way temporal split, with *latent* called out · `1:20` three real uncorrected papers, live DOIs · `1:50` eval chart vs. naive baseline · `2:20` the ER lift number and where HydraDB does the work · `2:45` "same engine works on package dependency graphs" — the cross-track close.
