import { Callout, Code, H2, H3, Inline, Lead, P, Table, UL } from "@/components/docs-ui";

export default function HowItWorksPage() {
  return (
    <>
      <p className="label mb-4 text-hydra">How it works</p>
      <h1 className="font-display mb-6 text-4xl font-medium tracking-tight text-chalk md:text-5xl">
        Architecture
      </h1>

      <Lead>
        A pipeline that builds a weighted citation graph on your machine, and a
        web app that only ever reads it.
      </Lead>

      <H2 id="split">The split, and why</H2>
      <P>
        Vercel&apos;s serverless functions have hard execution ceilings. The
        OpenAlex crawl and the classification pass run for hours, so they
        can&apos;t live there. The project is therefore two programs sharing one
        repository:
      </P>

      <Code filename="architecture">{`scripts/    long-lived, runs on your machine
            crawls APIs -> classifies edges -> writes to HydraDB

app/        deployed to Vercel, read-only
            queries a graph that is already built; every request is fast`}</Code>

      <P>
        The one long-running thing on Vercel is a daily cron that pulls new
        retractions and fires watchlist alerts — seconds of work, comfortably
        inside the limits.
      </P>

      <H2 id="sources">Data sources</H2>
      <P>
        All public, all free, no auth walls. Every response is cached to disk
        keyed by a hash of its URL.
      </P>

      <Table
        head={["Source", "Role"]}
        rows={[
          [
            "OpenAlex",
            "The citation graph in both directions, plus an is_retracted flag that seeds everything",
          ],
          [
            "Crossref",
            "update-to / updated-by relations linking a retraction notice to the article it retracts",
          ],
          [
            "Retraction Watch",
            "Retraction reasons — fabrication, plagiarism, error, duplication",
          ],
          [
            "Europe PMC",
            "Open-access full text, for extracting the sentence around each citation",
          ],
        ]}
      />

      <Callout kind="note" title="The seeding shortcut">
        <p>
          OpenAlex exposes <Inline>is_retracted</Inline> as a first-class
          filterable boolean. <Inline>filter=is_retracted:true</Inline> seeds the
          entire graph in one query — a day of work that doesn&apos;t need
          doing.
        </p>
      </Callout>

      <H2 id="scope">Scope</H2>
      <Code filename="slice">{`seeds       top N most-cited retracted works, life & health sciences
hop-1       every direct citer of each seed
hop-2       top 20 citers per hop-1 node, by citation count
classified  edges where Europe PMC open-access full text exists
rest        edge_class: "unknown"`}</Code>
      <P>
        Designed for the full corpus, run on a slice. A working 300k-node graph
        beats a broken 3M-node one, and the scaling path is documented rather
        than pretended.
      </P>

      <H2 id="model">Data model</H2>
      <P>
        One HydraDB database. Because the graph is derived from ingested
        content, object types are distinguished by a metadata discriminator
        rather than separate stores.
      </P>

      <Code filename="metadata schema">{`node_type          "work" | "notice" | "edge"
openalex_id        string
doi, pmid          string
year, field        number, string
journal            string
is_retracted       boolean
retraction_date    ISO date
retraction_reason  fabrication | falsification | plagiarism
                   | error | duplication | unknown
oa_status          string

// edges only
src_id, dst_id     openalex ids — always
edge_class         see the weights table
edge_weight        number
citation_year      number
section            methods | results | intro | discussion | unknown`}</Code>

      <H2 id="classification">Edge classification</H2>
      <P>
        The technical core. Each edge is classified by an LLM given the retracted
        paper&apos;s title and abstract, the citing paper&apos;s title, the
        extracted citation sentence, and the section heading it sits under.
      </P>
      <P>
        It returns a class, a confidence, and{" "}
        <strong className="text-chalk">the exact quote that justifies it</strong>
        . The quote isn&apos;t decoration — it&apos;s rendered in the UI so a
        reader can check the machine&apos;s work, and it&apos;s what makes the
        gold-set evaluation auditable.
      </P>

      <Code filename="scripts/4-classify.ts">{`const EdgeClass = z.object({
  edge_class: z.enum([
    "load_bearing_data", "load_bearing_method",
    "supporting", "incidental", "contrasting",
  ]),
  confidence: z.enum(["high", "medium", "low"]),
  evidence_quote: z.string(),
});

const batch = await client.messages.batches.create({
  requests: contexts.map((c) => ({
    custom_id: \`\${c.src_id}__\${c.dst_id}\`,
    params: {
      model: "claude-opus-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(EdgeClass) },
      system: CLASSIFY_SYSTEM,
      messages: [{ role: "user", content: renderContext(c) }],
    },
  })),
});`}</Code>

      <Callout kind="warn" title="Two things that will bite you">
        <p className="mb-3">
          Batch results arrive in <strong>any order</strong> — key them by{" "}
          <Inline>custom_id</Inline>, never by position.
        </p>
        <p>
          On Claude Opus 5, <Inline>max_tokens</Inline> caps thinking{" "}
          <em>and</em> output together. Setting it to 512 truncates
          mid-response.
        </p>
      </Callout>

      <P>
        Roughly 8,000 edges at ~2k input tokens each costs about{" "}
        <strong className="text-chalk">$45</strong> at batch rates. Haiku 4.5
        brings it to about $9 — but classify the 200-edge gold set with the same
        model you ship, so reported precision reflects reality.
      </P>

      <H2 id="scoring">Scoring</H2>
      <P>
        Shared between the pipeline and the app via <Inline>lib/score.ts</Inline>{" "}
        so the numbers cannot drift.
      </P>

      <H3>Path severity</H3>
      <P>
        A route&apos;s severity starts at the retraction&apos;s severity and is
        multiplied by each edge&apos;s weight, decayed by hop distance.
      </P>
      <Code filename="lib/score.ts">{`export const HOP_DECAY = 0.55;

export function pathSeverity(path: Path): number | null {
  if (!pathIsCertain(path)) return null;

  const base = REASON_SEVERITY[path.seed.retractionReason ?? "unknown"];

  return path.edges.reduce((acc, edge, hop) => {
    const w = EDGE_WEIGHT[edge.edgeClass] as number;
    return acc * w * HOP_DECAY ** hop;
  }, base);
}`}</Code>

      <H3>Combining routes</H3>
      <P>
        Independent paths combine with a noisy-OR: several weak routes raise the
        score, but no single one can push it to certainty.
      </P>
      <Code filename="lib/score.ts">{`export function combine(severities: number[]): number {
  return 1 - severities.reduce((acc, s) => acc * (1 - s), 1);
}`}</Code>

      <H3>Retraction severity</H3>
      <Table
        head={["Reason", "Severity"]}
        rows={[
          ["fabrication / falsification", "1.0"],
          ["error", "0.7"],
          ["plagiarism", "0.5"],
          ["duplication", "0.3"],
          ["unknown", "0.6"],
        ]}
      />
      <P>
        Plagiarism scores low on purpose. A plagiarised paper&apos;s{" "}
        <em>results</em> may be perfectly sound — the misconduct is in
        attribution, not the data. Fabrication is the opposite.
      </P>

      <H2 id="abstention">Abstention</H2>
      <P>
        Any path containing an <Inline>unknown</Inline> edge is excluded from the
        score entirely and counted in <Inline>uncertainPaths</Inline>. The UI
        always shows both numbers. There is no code path that turns missing
        evidence into a guess.
      </P>

      <H2 id="metrics">Metrics</H2>
      <UL>
        <li>
          <strong className="text-chalk">Entity-resolution lift</strong> —
          notices resolved to their article via HydraDB versus raw Crossref
          metadata.
        </li>
        <li>
          <strong className="text-chalk">Classifier precision and recall</strong>{" "}
          — against 200 hand-labelled edges.
        </li>
        <li>
          <strong className="text-chalk">Baseline comparison</strong> — versus a
          naive &ldquo;does this cite any retracted work anywhere?&rdquo; check.
          The naive version flags an order of magnitude more papers; that gap is
          the result-quality argument.
        </li>
        <li>
          <strong className="text-chalk">Discovery count</strong> — papers with a
          load-bearing dependency on a retracted work and no subsequent
          correction. A real finding about live literature.
        </li>
      </UL>

      <H2 id="generalises">Why the engine generalises</H2>
      <P>
        Strip the domain and PRION is: dependency contamination through a
        directed graph, weighted by whether each edge is load-bearing, sliced by
        time. Citations are one instance. Software supply chains are another —
        package depends on package, is the vulnerable function actually
        reachable, when did exposure begin. Same traversal, same temporal split,
        different nodes.
      </P>
    </>
  );
}
