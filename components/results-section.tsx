import { OPENALEX_RETRACTED, corpusStats } from "@/lib/corpus-stats";
import { Results, type ResultStat } from "./sections";

// Every figure is counted from the corpus or measured from a named source.
export async function ResultsSection() {
  const s = await corpusStats();

  const stats: ResultStat[] = [
    {
      value: OPENALEX_RETRACTED,
      label: "Retracted works in OpenAlex",
      note: "Measured from OpenAlex's own is_retracted filter.",
    },
    {
      value: s.works,
      label: "Works in the traced graph",
      note: "Crawled two hops out from the retracted seed set.",
    },
    {
      value: s.edges,
      label: "Citation edges mapped",
      note: "Directed, citing paper to cited paper.",
    },
    {
      value: s.seeds,
      label: "Retracted seed papers",
      note: "Each linked to its retraction notice via Crossref.",
    },
  ];

  return <Results stats={stats} />;
}
