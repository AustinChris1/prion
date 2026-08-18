import { NextResponse } from "next/server";
import { traceContamination } from "@/lib/trace";

// 60s is the Vercel Hobby ceiling — anything higher fails the build there.
export const maxDuration = 60;

// Sized to finish inside the 60s Hobby ceiling; raise both on Pro.
const MAX_IDS = 16;
// Traces run concurrently, but politely — OpenAlex is a public good.
const CONCURRENCY = 4;

export interface BatchRow {
  input: string;
  ok: boolean;
  title?: string;
  findings?: number;
  nearestHops?: number | null;
  directReferences?: number;
  error?: string;
}

// POST /api/batch { ids } — the watchlist surface: check a whole bibliography.
export async function POST(req: Request) {
  let ids: unknown;

  try {
    ({ ids } = await req.json());
  } catch {
    return NextResponse.json({ message: "Malformed request body." }, { status: 400 });
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { message: "Provide `ids` — an array of DOIs or PMIDs." },
      { status: 400 },
    );
  }

  const list = ids
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, MAX_IDS);

  const rows: BatchRow[] = new Array(list.length);
  let cursor = 0;

  async function worker() {
    while (cursor < list.length) {
      const i = cursor++;
      const input = list[i];

      try {
        const result = await traceContamination(input);
        rows[i] = {
          input,
          ok: true,
          title: result.target.title,
          findings: result.findings.length,
          nearestHops: result.findings[0]?.hops ?? null,
          directReferences: result.stats.directReferences,
        };
      } catch (err) {
        rows[i] = {
          input,
          ok: false,
          error: err instanceof Error ? err.message : "Trace failed.",
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker),
  );

  const resolved = rows.filter((r) => r.ok);
  const flagged = resolved.filter((r) => (r.findings ?? 0) > 0);

  return NextResponse.json({
    rows,
    summary: {
      submitted: list.length,
      resolved: resolved.length,
      flagged: flagged.length,
      clean: resolved.length - flagged.length,
      truncatedInput: ids.length > MAX_IDS ? ids.length - MAX_IDS : 0,
    },
  });
}
