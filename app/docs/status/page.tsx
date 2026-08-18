import { Callout, H2, Inline, Lead, P, StatusRow } from "@/components/docs-ui";

export default function StatusPage() {
  return (
    <>
      <p className="label mb-4 text-hydra">Build status</p>
      <h1 className="font-display mb-6 text-4xl font-medium tracking-tight text-chalk md:text-5xl">
        What works today
      </h1>

      <Lead>
        An accurate picture of the build, kept honest on purpose — a demo that
        overstates itself is worse than one that admits its edges.
      </Lead>

      <H2 id="pipeline">Pipeline</H2>

      <StatusRow state="done" name="scripts/lib/fetcher.ts">
        Rate limiting, on-disk HTTP cache, resumable checkpoints, exponential
        backoff. Verified against live OpenAlex and Crossref traffic.
      </StatusRow>

      <StatusRow state="done" name="scripts/1-seeds.ts">
        Harvests retracted works from OpenAlex and links them to retraction
        notices through Crossref. Live-tested; reports the entity-resolution
        baseline on completion.
      </StatusRow>

      <StatusRow state="todo" name="scripts/2-expand.ts">
        Two-hop citation closure. Next to be written.
      </StatusRow>

      <StatusRow state="todo" name="scripts/3-fulltext.ts">
        Europe PMC open-access full text and citation-context extraction.
      </StatusRow>

      <StatusRow state="todo" name="scripts/4-classify.ts">
        Edge classification via the Anthropic Batch API.
      </StatusRow>

      <StatusRow state="todo" name="scripts/5-ingest.ts">
        Load the graph into HydraDB.
      </StatusRow>

      <StatusRow state="todo" name="scripts/6-eval.ts">
        Entity-resolution lift, classifier precision, naive-baseline comparison.
      </StatusRow>

      <H2 id="app">Application</H2>

      <StatusRow state="done" name="Landing page">
        Hero, scroll-driven contamination lattice, evidence and results
        sections, path-trace visual. Runs with no data and no keys.
      </StatusRow>

      <StatusRow state="done" name="lib/score.ts">
        Edge weights, retraction severities, hop decay, noisy-OR combination,
        temporal classification, report assembly. Pure functions, no I/O.
      </StatusRow>

      <StatusRow state="done" name="lib/types.ts">
        Shared shapes across the pipeline and the app.
      </StatusRow>

      <StatusRow state="wip" name="POST /api/trace">
        Validates input and reports honestly that the graph has not been
        ingested. Returns no fabricated results. Traversal lands once{" "}
        <Inline>5-ingest.ts</Inline> exists.
      </StatusRow>

      <StatusRow state="todo" name="/paper/[doi]">
        The contamination report — score, uncertain-path count, temporal split,
        and every route rendered with its evidence quote.
      </StatusRow>

      <StatusRow state="todo" name="/watchlist">
        Register a reference library; get alerted when an ancestor is retracted
        later.
      </StatusRow>

      <StatusRow state="todo" name="/review">
        Systematic-review auditor — which pooled studies are retracted.
      </StatusRow>

      <H2 id="open">Open questions</H2>

      <Callout kind="warn" title="The entity-resolution thesis needs re-measuring">
        <p className="mb-3">
          A live run measured a <strong className="text-chalk">100% link rate</strong>{" "}
          between retracted articles and their notices on the 40 most-cited
          retracted papers. The original plan assumed that number would be poor,
          and that HydraDB closing the gap would be the headline result.
        </p>
        <p className="mb-3">
          The cause is sampling. Sorting by citation count selects the most
          scrutinised, best-curated records in the corpus — all 40 had DOIs and
          clean Crossref relations. Metadata rot, if it exists, lives in the long
          tail.
        </p>
        <p>Three responses, not mutually exclusive:</p>
      </Callout>

      <P>
        <strong className="text-chalk">Re-sample.</strong> Replace{" "}
        <Inline>sort=cited_by_count:desc</Inline> with a random slice across all
        134,147 retracted works and re-measure. Ten minutes of work, and it
        settles whether the gap is real.
      </P>
      <P>
        <strong className="text-chalk">Move the claim.</strong>{" "}
        Notice-to-article linking is evidently well curated at scale.
        Preprint-to-published-version linking and author disambiguation are not,
        and OpenAlex is openly imperfect at the latter.
      </P>
      <P>
        <strong className="text-chalk">Let traversal carry it.</strong>{" "}
        Multi-hop path-finding and the temporal split remain things a vector
        store structurally cannot do. That argument never depended on the
        entity-resolution number.
      </P>

      <H2 id="verified">Verified, not assumed</H2>
      <P>
        Every figure quoted in these docs and on the site came from a real run
        against live APIs — including the 134,147 retracted works, which
        replaced an earlier from-memory estimate of &ldquo;around
        60,000.&rdquo; Where something has not been measured, it is marked as
        not built rather than described as though it works.
      </P>
    </>
  );
}
