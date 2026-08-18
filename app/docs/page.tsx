import Link from "next/link";
import { Callout, H2, Inline, Lead, P, Table, UL } from "@/components/docs-ui";

export default function OverviewPage() {
  return (
    <>
      <p className="label mb-4 text-hydra">Overview</p>
      <h1 className="font-display mb-6 text-4xl font-medium tracking-tight text-chalk md:text-5xl">
        Retractions don&apos;t stop at the paper.
      </h1>

      <Lead>
        A retraction notice reaches the paper it retracts. It does not reach the
        papers built on top of it. PRION walks the citation graph and tells you
        what is still standing on retracted ground.
      </Lead>

      <H2 id="problem">The problem</H2>
      <P>
        OpenAlex flags <strong className="text-chalk">134,147</strong> works as
        retracted. Retracting one stops that paper — it does nothing about the
        work already built on it. A fabricated trial gets pooled into a
        meta-analysis; the meta-analysis feeds a clinical guideline; the
        guideline changes what a doctor does. The notice never propagates down
        that chain.
      </P>
      <P>
        Nobody traces the contamination, because tracing it is a{" "}
        <strong className="text-chalk">
          multi-hop, weighted graph traversal
        </strong>{" "}
        — the thing a vector store structurally cannot do and a graph database
        exists for.
      </P>

      <H2 id="name">Why the name</H2>
      <P>
        A prion is a misfolded protein that propagates its misfolding into
        healthy proteins it touches. That is precisely what a retracted result
        does to the literature downstream of it.
      </P>

      <H2 id="idea">The core idea</H2>
      <P>
        Not every citation is a dependency. &ldquo;See also Jones&rdquo; is
        noise; &ldquo;we pooled Jones&apos;s effect estimate&rdquo; is
        structural. PRION classifies every citation edge by how load-bearing it
        is, then decays contamination across hops. Without that distinction the
        whole thing is a firehose of false positives.
      </P>

      <Table
        head={["Edge class", "Weight", "Meaning"]}
        rows={[
          [
            <Inline key="a">load_bearing_data</Inline>,
            "1.0",
            "Reuses the cited paper's data or effect estimate",
          ],
          [
            <Inline key="b">load_bearing_method</Inline>,
            "0.8",
            "The citing paper's method depends on it",
          ],
          [
            <Inline key="c">supporting</Inline>,
            "0.5",
            "Cited as evidence for a central claim",
          ],
          [
            <Inline key="d">incidental</Inline>,
            "0.15",
            "Background, passing reference",
          ],
          [
            <Inline key="e">contrasting</Inline>,
            "0.0",
            "Cited in order to dispute it — not contamination",
          ],
          [
            <Inline key="f">unknown</Inline>,
            "null",
            "No open-access full text — excluded, never guessed",
          ],
        ]}
      />

      <Callout kind="note" title="Two deliberate zeroes">
        <p className="mb-3">
          <Inline>contrasting</Inline> scores <strong>0.0</strong>. Citing a
          retracted paper <em>to refute it</em> is good scholarship, not
          contamination. A tool that flags those looks like it was built by
          someone who has never read a paper.
        </p>
        <p>
          <Inline>unknown</Inline> is <strong>null</strong>, not a default
          weight. Paths containing one are excluded from the score and counted
          separately as <Inline>uncertainPaths</Inline>. The result is a score worth
          trusting alongside an honest count of what could not be
          determined.
        </p>
      </Callout>

      <H2 id="temporal">The temporal split</H2>
      <P>
        Every citation has a date; every retraction has a date. Comparing them
        separates three categories that are invisible today:
      </P>
      <UL>
        <li>
          <strong className="text-chalk">Pre-retraction</strong> — cited before
          the retraction. Forgivable; the author couldn&apos;t have known.
        </li>
        <li>
          <strong className="text-chalk">Post-retraction</strong> — cited after.
          Negligent; the flag was already up.
        </li>
        <li>
          <strong className="text-chalk">Latent</strong> — cited before the
          retraction and never corrected since. The largest and most dangerous
          bucket, and it only exists as a query because the database can answer
          &ldquo;what was true as of this date.&rdquo;
        </li>
      </UL>

      <H2 id="hydra">Where HydraDB does the work</H2>
      <P>
        Four primitives, each load-bearing rather than decorative:
      </P>
      <UL>
        <li>
          <strong className="text-chalk">Graph traversal</strong> — walking
          citation ancestry N hops upward from any target paper.
        </li>
        <li>
          <strong className="text-chalk">Temporal queries</strong> — the
          point-in-time split above.
        </li>
        <li>
          <strong className="text-chalk">Entity resolution</strong> — the same
          work exists as preprint, published version, DOI, and PMID; authors
          collide constantly.
        </li>
        <li>
          <strong className="text-chalk">Metadata filtering</strong> — scoping
          traversals by field, year, and journal.
        </li>
      </UL>

      <Callout kind="warn" title="An honest finding, and it changed the plan">
        <p className="mb-3">
          The original thesis was that retraction-notice metadata is broken, and
          that HydraDB&apos;s entity resolution closing that gap would be the
          headline metric. A live run of{" "}
          <Inline>scripts/1-seeds.ts</Inline> measured a{" "}
          <strong className="text-chalk">100% link rate</strong> on the 40
          most-cited retracted papers — no gap to close.
        </p>
        <p>
          The cause is sampling: the most-cited retracted papers are the most
          scrutinised and best-curated records in the corpus. Any metadata rot
          lives in the long tail. Re-measuring on a random sample is the open
          question — see{" "}
          <Link
            href="/docs/status"
            className="text-hydra underline-offset-4 hover:underline"
          >
            Build status
          </Link>
          .
        </p>
      </Callout>

      <H2 id="next">Next</H2>
      <P>
        <Link
          href="/docs/usage"
          className="text-hydra underline-offset-4 hover:underline"
        >
          Install &amp; run
        </Link>{" "}
        gets the pipeline going on your machine.{" "}
        <Link
          href="/docs/how-it-works"
          className="text-hydra underline-offset-4 hover:underline"
        >
          How it works
        </Link>{" "}
        covers the architecture, the scoring maths, and the data model.
      </P>
    </>
  );
}
