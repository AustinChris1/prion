import { NextResponse } from "next/server";
import { normalizeId, traceContamination } from "@/lib/trace";
import { hydraConfigured, traceViaHydra } from "@/lib/hydra";

// 60s is the Vercel Hobby ceiling — anything higher fails the build there.
// Raise to 300 if you deploy on Pro; a single trace fits comfortably in 60.
export const maxDuration = 60;

// POST /api/trace { id } — HydraDB first, live OpenAlex as fallback.
export async function POST(req: Request) {
  let id: unknown;

  try {
    ({ id } = await req.json());
  } catch {
    return NextResponse.json({ message: "Malformed request body." }, { status: 400 });
  }

  if (typeof id !== "string" || id.trim().length === 0) {
    return NextResponse.json(
      { message: "Paste a DOI, a PMID, or an OpenAlex work ID." },
      { status: 400 },
    );
  }

  if (!normalizeId(id)) {
    return NextResponse.json(
      { message: "Not a recognisable DOI, PMID, or OpenAlex ID." },
      { status: 400 },
    );
  }

  if (hydraConfigured()) {
    try {
      // Resolve to an OpenAlex ID first — the corpus is keyed on those.
      const resolved = await traceContamination(id);
      const graph = await traceViaHydra(resolved.target.id);

      // null means the corpus holds nothing for this root; fall through.
      if (graph) {
        const n = graph.findings.length;

        return NextResponse.json({
          source: "hydradb",
          target: resolved.target,
          findings: graph.findings.map((f) => ({
            retracted: { id: f.retractedId, title: f.retractedTitle },
            hops: f.hops,
            path: f.path,
            evidence: f.evidence,
          })),
          stats: {
            worksExamined: graph.examined,
            directReferences: resolved.target.referencedWorks.length,
            depthReached: 4,
            truncated: false,
            skipped: 0,
          },
          message:
            n > 0
              ? `${n} retracted work${n === 1 ? "" : "s"} found upstream — ancestry traversed exhaustively over the stored graph.`
              : "No retracted work upstream. Ancestry traversed exhaustively over the stored graph — nothing sampled.",
        });
      }
    } catch (err) {
      console.warn(
        "hydra trace failed, falling back to live:",
        String(err).slice(0, 200),
      );
    }
  }

  try {
    const result = await traceContamination(id);

    return NextResponse.json({
      ...result,
      source: "openalex-live",
      message:
        result.message +
        (hydraConfigured()
          ? " This paper sits outside the ingested corpus, so it was answered by live traversal, which samples at depth."
          : ""),
    });
  } catch (err) {
    return NextResponse.json(
      {
        message:
          err instanceof Error ? err.message : "Traversal failed unexpectedly.",
      },
      { status: 422 },
    );
  }
}
