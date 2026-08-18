import Link from "next/link";
import { Callout, Code, H2, H3, Inline, Lead, P, Table, UL } from "@/components/docs-ui";

export default function UsagePage() {
  return (
    <>
      <p className="label mb-4 text-hydra">Install &amp; run</p>
      <h1 className="font-display mb-6 text-4xl font-medium tracking-tight text-chalk md:text-5xl">
        Running PRION locally
      </h1>

      <Lead>
        The web app and the pipeline are separate programs. The pipeline builds
        the graph on your machine; the app only reads it. You can run the site
        today — the pipeline is partially built.
      </Lead>

      <H2 id="requirements">Requirements</H2>
      <UL>
        <li>Node 20 or newer (developed on Node 25)</li>
        <li>pnpm 9+</li>
        <li>
          An email address for the OpenAlex and Crossref polite pools — no
          account, no key, just an address they can contact
        </li>
        <li>
          A HydraDB API key (only needed from step 5 onward) and an Anthropic API
          key (only for step 4)
        </li>
      </UL>

      <H2 id="install">1. Install</H2>
      <Code filename="terminal">{`pnpm install`}</Code>

      <H2 id="env">2. Environment</H2>
      <P>
        Copy the example file and fill in what you have. Only{" "}
        <Inline>OPENALEX_MAILTO</Inline> is needed to run the first pipeline
        step or the site.
      </P>
      <Code filename="terminal">{`cp .env.example .env.local`}</Code>
      <Code filename=".env.local">{`# Identifies you to OpenAlex and Crossref. Any address you control.
OPENALEX_MAILTO=you@example.com

# Needed from scripts/5-ingest.ts onward, and by /api/trace.
HYDRA_DB_API_KEY=

# Needed by scripts/4-classify.ts only.
ANTHROPIC_API_KEY=`}</Code>

      <Callout kind="note" title="Why .env.local and not .env">
        <p>
          Next.js reads <Inline>.env.local</Inline> automatically, but plain{" "}
          <Inline>dotenv</Inline> defaults to <Inline>.env</Inline>. The scripts
          load <Inline>.env.local</Inline> explicitly so both halves of the
          project read the same file.
        </p>
      </Callout>

      <H2 id="site">3. Run the site</H2>
      <Code filename="terminal">{`pnpm dev`}</Code>
      <P>
        Open <Inline>http://localhost:3000</Inline>. The landing page, the
        scroll-driven contamination lattice, and the path-trace visual all work
        with no data and no keys — they render the explanation, not live
        results.
      </P>

      <H2 id="pipeline">4. Run the pipeline</H2>
      <P>
        Six steps, run in order. Each writes to <Inline>data/cache/</Inline> and
        resumes if interrupted, so a crash costs minutes rather than hours.
        Every HTTP response is cached on disk — re-running a step never re-hits
        the APIs.
      </P>

      <Table
        head={["Step", "Command", "What it does"]}
        rows={[
          [
            "1",
            <Inline key="1">pnpm seeds</Inline>,
            "Harvest retracted works from OpenAlex; link each to its retraction notice via Crossref",
          ],
          [
            "2",
            <Inline key="2">pnpm expand</Inline>,
            "Two-hop citation closure — who cites the retracted work, and who cites them",
          ],
          [
            "3",
            <Inline key="3">pnpm fulltext</Inline>,
            "Pull open-access full text from Europe PMC and extract citation context",
          ],
          [
            "4",
            <Inline key="4">pnpm classify</Inline>,
            "Classify each citation edge via the Anthropic Batch API",
          ],
          [
            "5",
            <Inline key="5">pnpm ingest</Inline>,
            "Load works, notices, and weighted edges into HydraDB",
          ],
          [
            "6",
            <Inline key="6">pnpm eval</Inline>,
            "Entity-resolution lift, classifier precision, naive-baseline comparison",
          ],
        ]}
      />

      <H3>Start small</H3>
      <P>
        Step 1 takes a seed count. Use a small number while you&apos;re finding
        your feet — 40 seeds finishes in about a minute and exercises the whole
        path.
      </P>
      <Code filename="terminal">{`pnpm seeds 40      # quick smoke test
pnpm seeds         # the real run — 5,000 seeds`}</Code>

      <P>It prints the entity-resolution baseline when it finishes:</P>
      <Code filename="output">{`  OpenAlex reports 134,147 retracted works total.

  ────────────────────────────────────────────────
   ER BASELINE — raw registry metadata
  ────────────────────────────────────────────────
   Seeds harvested            40
   With a DOI                 40
   Linked to a notice         40

   Link rate (of all seeds)   100.0%
   Link rate (of DOI'd seeds) 100.0%
  ────────────────────────────────────────────────`}</Code>

      <Callout kind="warn" title="Clear the cache before a full run">
        <p>
          Step 1 appends to <Inline>data/cache/seeds.ndjson</Inline> and saves a
          pagination cursor, so a later run resumes where the last one stopped.
          If you smoke-tested with a small count and now want a clean full run,
          delete <Inline>data/cache/</Inline> first.
        </p>
      </Callout>

      <H2 id="verify">5. Verify</H2>
      <Code filename="terminal">{`npx tsc --noEmit     # types
pnpm lint            # eslint
pnpm build           # production build`}</Code>

      <H2 id="troubleshooting">Troubleshooting</H2>

      <H3>&ldquo;Missing OPENALEX_MAILTO&rdquo;</H3>
      <P>
        The scripts read <Inline>.env.local</Inline>, not <Inline>.env</Inline>.
        Confirm the file exists at the repo root and the variable has a value.
      </P>

      <H3>OpenAlex returns 429</H3>
      <P>
        The fetcher rate-limits to 8 requests per second and retries with
        exponential backoff, which sits inside the polite-pool allowance — but
        only if <Inline>OPENALEX_MAILTO</Inline> is set, since that&apos;s what
        puts you in the polite pool at all.
      </P>

      <H3>A step died halfway</H3>
      <P>
        Re-run the same command. Cached responses are reused and the checkpoint
        resumes from the last completed page.
      </P>

      <H3>Everything is stale after a code change</H3>
      <P>
        Delete <Inline>data/cache/http/</Inline> to force fresh fetches while
        keeping the derived <Inline>.ndjson</Inline> outputs, or delete all of{" "}
        <Inline>data/cache/</Inline> to start over.
      </P>

      <H2 id="status">What actually runs today</H2>
      <P>
        Steps 2–6 aren&apos;t written yet, and <Inline>/api/trace</Inline>{" "}
        returns an honest &ldquo;not ingested&rdquo; message rather than
        inventing a result.{" "}
        <Link
          href="/docs/status"
          className="text-hydra underline-offset-4 hover:underline"
        >
          Build status
        </Link>{" "}
        has the current state of every piece.
      </P>
    </>
  );
}
