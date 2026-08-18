<div align="center">
  <img src="public/prion-mark.svg" width="72" alt="PRION" />
  <h1>PRION</h1>
  <p><strong>Retractions don't stop at the paper.</strong></p>
  <p>
    <a href="https://hackhydra.hydradb.com/">Hack Hydra</a> ·
    Track 1 — Enterprise Context &amp; Ontology
  </p>
</div>

---

A retraction notice reaches the paper it retracts. It does not reach the papers
built on top of it. PRION walks the citation graph and tells you what is still
standing on retracted ground.

**Full documentation lives in the app at `/docs`** — run `pnpm dev` and open
[localhost:3000/docs](http://localhost:3000/docs).

## The problem

OpenAlex flags **134,147** works as retracted. Retracting one stops that paper —
it does nothing about the work already built on it. A fabricated trial gets
pooled into a meta-analysis; the meta-analysis feeds a clinical guideline; the
guideline changes what a doctor does. The notice never propagates down the chain.

Nobody traces the contamination, because tracing it is a **multi-hop, weighted
graph traversal** — the thing a vector store structurally cannot do and a graph
database exists for.

## The idea

Not every citation is a dependency. "See also Jones" is noise; "we pooled
Jones's effect estimate" is structural. PRION classifies every citation edge by
how load-bearing it is, then decays contamination across hops.

| Edge class | Weight | Meaning |
|---|---|---|
| `load_bearing_data` | 1.0 | Reuses the cited paper's data or effect estimate |
| `load_bearing_method` | 0.8 | The citing paper's method depends on it |
| `supporting` | 0.5 | Cited as evidence for a central claim |
| `incidental` | 0.15 | Background, passing reference |
| `contrasting` | **0.0** | Cited in order to dispute it — not contamination |
| `unknown` | **null** | No open-access full text — excluded, never guessed |

Two deliberate zeroes. `contrasting` is 0.0 because citing a retracted paper *to
refute it* is good scholarship. `unknown` is `null` rather than a default
weight — paths containing one are excluded from the score and reported
separately as `uncertainPaths`. There is no code path that turns missing
evidence into a guess.

### The temporal split

Comparing each citation's date against the retraction date separates three
categories that are invisible today:

- **Pre-retraction** — cited before the retraction. Forgivable.
- **Post-retraction** — cited after. Negligent.
- **Latent** — cited before, never corrected since. The largest and most
  dangerous bucket, and it only exists as a query because the database can
  answer "what was true as of this date."

## How HydraDB is used

Four primitives, each load-bearing rather than decorative:

1. **Graph traversal** — walking citation ancestry N hops upward from any target.
2. **Temporal queries** — the point-in-time split above.
3. **Entity resolution** — the same work exists as preprint, published version,
   DOI, and PMID; authors collide constantly.
4. **Metadata filtering** — scoping traversals by field, year, and journal.

See [`/docs/how-it-works`](http://localhost:3000/docs/how-it-works) for the data
model and scoring maths.

## Architecture

Vercel's serverless functions have hard execution ceilings, and the crawl plus
classification pass run for hours. So the repo is two programs:

```
scripts/    long-lived, runs on your machine
            crawls APIs -> classifies edges -> writes to HydraDB

app/        deployed to Vercel, read-only
            queries a graph that is already built; every request is fast
```

## Quick start

```bash
pnpm install
cp .env.example .env.local     # set OPENALEX_MAILTO
pnpm dev                       # site runs with no data and no keys
```

Then the pipeline, in order:

```bash
pnpm seeds 40   # smoke test — ~1 minute
pnpm seeds      # full run — 5,000 seeds
pnpm expand     # not yet built
pnpm fulltext   # not yet built
pnpm classify   # not yet built
pnpm ingest     # not yet built
pnpm eval       # not yet built
```

Each step caches every HTTP response to `data/cache/` and resumes if
interrupted. Re-running never re-hits the APIs. Full instructions and
troubleshooting: [`/docs/usage`](http://localhost:3000/docs/usage).

## Build status

`scripts/1-seeds.ts` and the full front end work and are live-tested. Steps 2–6
are not written yet, and `POST /api/trace` reports honestly that the graph has
not been ingested rather than inventing a result. The current state of every
piece is at [`/docs/status`](http://localhost:3000/docs/status).

### An open question, stated plainly

The original thesis was that retraction-notice metadata is broken, and that
HydraDB's entity resolution closing that gap would be the headline metric. A
live run of `scripts/1-seeds.ts` measured a **100% link rate** on the 40
most-cited retracted papers — no gap to close.

The cause is sampling: the most-cited retracted papers are the most scrutinised
records in the corpus. Any metadata rot lives in the long tail. Re-measuring on
a random slice across all 134,147 works is the next step. This is documented
rather than buried because a benchmark that flatters the tool is worth nothing.

## Data sources

| Source | Licence | Role |
|---|---|---|
| [OpenAlex](https://openalex.org/) | CC0 | Citation graph, `is_retracted` flag |
| [Crossref](https://www.crossref.org/) | Open | Notice-to-article relations |
| [Retraction Watch](https://retractionwatch.com/) | CC0, via Crossref | Retraction reasons |
| [Europe PMC](https://europepmc.org/) | Varies by article | Open-access full text |

Only the open-access subset is used for full-text extraction. Edges without
accessible full text are marked `unknown` and excluded from scoring.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS v4 · Motion · lucide-react ·
HydraDB · Anthropic API (Claude Opus 5, Message Batches) · pnpm

## Licence

MIT — see [LICENSE](LICENSE).
