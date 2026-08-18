import { traceContamination } from "@/lib/trace";
import { PathTrace, type Hop } from "./path-trace";

// Runs a real trace on the server, revalidated hourly, instead of showing a mock-up.
export const revalidate = 3600;

const EXAMPLE_DOI = "10.1016/j.jclinepi.2010.07.015";

export async function EvidenceSection() {
  let chain: Hop[] | null = null;
  let traced: string | null = null;

  try {
    const result = await traceContamination(EXAMPLE_DOI);
    const finding = result.findings[0];

    if (finding) {
      chain = finding.path.map((work, i) => {
        const last = i === finding.path.length - 1;

        return {
          title: work.title,
          meta: [
            work.journal,
            work.year ? String(work.year) : null,
            work.doi?.replace("https://doi.org/", ""),
          ]
            .filter(Boolean)
            .join(" · "),
          // Edges are unclassified until the corpus is classified end to end.
          // unknown is the honest render: reported, but excluded from scoring.
          edgeClass: i === 0 ? null : ("unknown" as const),
          retracted: last
            ? {
                reason: "Retracted",
                date: work.year ? `published ${work.year}` : "date unavailable",
                citations: work.citedByCount,
                after: 0,
              }
            : undefined,
        };
      });

      traced = result.target.title;
    }
  } catch {
    // Upstream hiccup: render without the live chain rather than failing the page.
  }

  return <PathTrace chain={chain} tracedTitle={traced} />;
}
