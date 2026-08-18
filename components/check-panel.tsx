"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  CheckCircle2,
  ExternalLink,
  FileStack,
  Loader2,
  ScanSearch,
  TriangleAlert,
} from "lucide-react";
import { PrionMark } from "./prion-mark";
import { parseReferences } from "@/lib/parse-refs";
import type { TraceResult } from "@/lib/trace";
import type { BatchRow } from "@/app/api/batch/route";

// Real papers. The third is clean on purpose: that is a useful answer, not a failure.
const EXAMPLES = [
  {
    id: "10.1016/j.jclinepi.2010.07.015",
    label: "A contaminated guideline",
    note: "GRADE — how medicine rates evidence quality",
    tone: "toxic" as const,
  },
  {
    id: "10.1016/S0140-6736(97)11096-0",
    label: "A retracted paper itself",
    note: "Wakefield, MMR — retracted 2010",
    tone: "toxic" as const,
  },
  {
    id: "10.1016/j.agsy.2017.01.023",
    label: "A clean paper",
    note: "Big Data in Smart Farming — verified",
    tone: "clean" as const,
  },
];

// Requests are chunked at this size; the whole list is still checked.
const CHUNK = 12;

type Mode = "single" | "batch";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "trace"; data: TraceResult }
  | { status: "batch"; rows: BatchRow[]; summary: Summary }
  | { status: "error"; text: string };

interface Summary {
  submitted: number;
  resolved: number;
  flagged: number;
  clean: number;
  truncatedInput: number;
}

export function CheckPanel() {
  const [mode, setMode] = useState<Mode>("single");
  const [value, setValue] = useState("");
  const [bib, setBib] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const loading = state.status === "loading";
  // Parsed live so the count updates as they paste.
  const parsed = parseReferences(bib);

  async function traceOne(raw: string) {
    setValue(raw);
    setState({ status: "loading" });

    try {
      const res = await fetch("/api/trace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: raw }),
      });
      const data = await res.json();

      if (!res.ok) {
        setState({ status: "error", text: data.message ?? "Trace failed." });
        return;
      }
      setState({ status: "trace", data });
    } catch {
      setState({ status: "error", text: "Could not reach the trace service." });
    }
  }

  async function traceMany() {
    const { ids } = parseReferences(bib);
    if (ids.length === 0) return;

    setState({ status: "loading" });
    setProgress({ done: 0, total: ids.length });

    // Chunked client-side so a long bibliography is not capped by the
    // serverless time limit — each request stays well inside it.
    const rows: BatchRow[] = [];

    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const res = await fetch("/api/batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: ids.slice(i, i + CHUNK) }),
        });
        const data = await res.json();

        if (!res.ok) {
          setState({ status: "error", text: data.message ?? "Batch failed." });
          return;
        }

        rows.push(...data.rows);
        setProgress({ done: Math.min(i + CHUNK, ids.length), total: ids.length });
      }
    } catch {
      setState({ status: "error", text: "Could not reach the trace service." });
      return;
    }

    const resolved = rows.filter((r) => r.ok);
    const flagged = resolved.filter((r) => (r.findings ?? 0) > 0);

    setState({
      status: "batch",
      rows,
      summary: {
        submitted: ids.length,
        resolved: resolved.length,
        flagged: flagged.length,
        clean: resolved.length - flagged.length,
        truncatedInput: 0,
      },
    });
  }

  return (
    <section id="check" className="border-t border-line bg-ink">
      <div className="mx-auto max-w-3xl px-5 py-32 md:px-8 md:py-44">
        <div className="mb-9 flex justify-center">
          <PrionMark size={52} />
        </div>

        <h2 className="font-display text-center text-4xl leading-[1.05] font-semibold tracking-tight text-chalk md:text-5xl">
          Is your work standing
          <br />
          on retracted ground?
        </h2>

        {/* ── Mode ─────────────────────────────────────── */}

        <div className="mt-10 flex justify-center">
          <div className="inline-flex border border-line">
            {(
              [
                ["single", "One paper", ScanSearch],
                ["batch", "Whole bibliography", FileStack],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => {
                  setMode(key);
                  setState({ status: "idle" });
                }}
                className={`label flex items-center gap-2 px-5 py-3 transition-colors ${
                  mode === key
                    ? "bg-hydra text-void"
                    : "text-mist hover:text-chalk"
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === "single" ? (
          <>
            <p className="mt-8 text-center text-base leading-relaxed text-mist md:text-lg">
              Paste a DOI or PMID. PRION walks upward through the citation graph
              and returns every route to a retracted paper.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (value.trim()) traceOne(value.trim());
              }}
              className="mx-auto mt-10 flex max-w-xl flex-col gap-3 sm:flex-row"
            >
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="10.1016/j.jclinepi.2010.07.015"
                aria-label="DOI or PMID"
                className="flex-1 border border-line bg-void px-5 py-4 font-mono text-sm text-chalk placeholder:text-mist/45 focus:border-hydra focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="label inline-flex items-center justify-center gap-2.5 border border-hydra bg-hydra px-7 py-4 text-void transition-colors hover:bg-transparent hover:text-hydra disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ScanSearch size={14} />
                )}
                Trace
              </button>
            </form>

            {/* ── Examples ────────────────────────────── */}

            <div className="mx-auto mt-8 max-w-xl">
              <p className="label mb-3 text-mist/60">Or try one of these</p>
              <div className="grid gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => traceOne(ex.id)}
                    disabled={loading}
                    className="group flex items-center gap-3 border border-line bg-void px-4 py-3 text-left transition-colors hover:border-mist disabled:opacity-50"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 ${
                        ex.tone === "toxic" ? "bg-toxic" : "bg-clean"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-chalk">{ex.label}</span>
                      <span className="block truncate text-xs text-mist">
                        {ex.note}
                      </span>
                    </span>
                    <span className="label shrink-0 text-mist/50 transition-colors group-hover:text-hydra">
                      Trace →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="mt-8 text-center text-base leading-relaxed text-mist md:text-lg">
              Paste your reference list — raw, straight out of the document.
              Nothing in publishing tells you when a paper you cited is retracted{" "}
              <em className="lit not-italic text-chalk">afterwards</em>. This does.
            </p>

            <div className="mx-auto mt-10 max-w-xl">
              <textarea
                value={bib}
                onChange={(e) => setBib(e.target.value)}
                rows={8}
                placeholder={
                  '[1] S. Wolfert et al., "Big Data in Smart Farming – A review,"\n' +
                  "    Agricultural Systems, vol. 153, 2017. doi: 10.1016/j.agsy.2017.01.023\n" +
                  '[2] A. G. Howard et al., "MobileNets," arXiv preprint arXiv:1704.04861, 2017.'
                }
                aria-label="Reference list"
                className="w-full resize-y border border-line bg-void px-5 py-4 font-mono text-xs leading-relaxed text-chalk placeholder:text-mist/40 focus:border-hydra focus:outline-none"
              />

              <div className="mt-3 flex min-h-5 items-center justify-between">
                <p className="label text-mist/60">
                  {parsed.found > 0
                    ? `${parsed.found} identifier${parsed.found === 1 ? "" : "s"} found` +
                      (parsed.unresolvable > 0
                        ? ` · ${parsed.unresolvable} entr${parsed.unresolvable === 1 ? "y has" : "ies have"} no DOI`
                        : "")
                    : "IEEE, APA, BibTeX, or bare DOIs — all fine"}
                </p>

              </div>

              <button
                onClick={traceMany}
                disabled={loading || parsed.found === 0}
                className="label mt-3 inline-flex w-full items-center justify-center gap-2.5 border border-hydra bg-hydra px-7 py-4 text-void transition-colors hover:bg-transparent hover:text-hydra disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <FileStack size={14} />
                )}
                {loading && progress.total > 0
                  ? `Checking ${progress.done} of ${progress.total}…`
                  : parsed.found > 0
                    ? `Check ${parsed.found} reference${parsed.found === 1 ? "" : "s"}`
                    : "Check all references"}
              </button>
              <p className="label mt-3 text-center text-mist/50">
                DOIs and arXiv IDs are extracted automatically · a few seconds each
              </p>
            </div>
          </>
        )}

        {/* ── Results ──────────────────────────────────── */}

        <div className="mx-auto mt-10 max-w-xl">
          {state.status === "error" && (
            <Panel tone="amber">
              <p className="font-mono text-xs leading-relaxed">{state.text}</p>
            </Panel>
          )}
          {state.status === "trace" && <TraceView data={state.data} />}
          {state.status === "batch" && (
            <BatchView rows={state.rows} summary={state.summary} />
          )}
        </div>
      </div>
    </section>
  );
}

function Panel({
  tone,
  children,
}: {
  tone: "toxic" | "clean" | "amber";
  children: React.ReactNode;
}) {
  const skin = {
    toxic: "border-toxic/40 bg-toxic/[0.06] text-toxic",
    clean: "border-clean/40 bg-clean/[0.06] text-clean",
    amber: "border-amber/35 bg-amber/[0.06] text-amber",
  }[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={`border p-6 text-left ${skin}`}
    >
      {children}
    </motion.div>
  );
}

function doiUrl(doi?: string | null) {
  if (!doi) return null;
  return doi.startsWith("http") ? doi : `https://doi.org/${doi}`;
}

function bareDoi(doi?: string | null) {
  return doi ? doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") : null;
}

function PaperLink({
  work,
  strong,
}: {
  work: { title: string; doi?: string | null; year?: number | null; journal?: string | null; citedByCount?: number };
  strong?: boolean;
}) {
  const href = doiUrl(work.doi);

  const meta = [
    work.journal,
    work.year ? String(work.year) : null,
    typeof work.citedByCount === "number" && work.citedByCount > 0
      ? `cited ${work.citedByCount.toLocaleString()}×`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const title = (
    <span className={`lit leading-snug ${strong ? "text-base text-chalk md:text-lg" : "text-sm text-chalk"}`}>
      {work.title}
    </span>
  );

  return (
    <div className="min-w-0">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-start gap-1.5 underline-offset-4 hover:underline"
        >
          {title}
          <ExternalLink size={12} className="mt-1.5 shrink-0 opacity-50 transition-opacity group-hover:opacity-100" />
        </a>
      ) : (
        title
      )}

      {meta && <p className="label mt-1 opacity-70">{meta}</p>}
      {bareDoi(work.doi) && (
        <p className="mt-1 font-mono text-[0.68rem] opacity-50">{bareDoi(work.doi)}</p>
      )}
    </div>
  );
}

function TraceView({ data }: { data: TraceResult }) {
  const { target, findings, stats } = data;
  const contaminated = findings.length > 0;

  return (
    <Panel tone={contaminated ? "toxic" : "clean"}>
      <div className="flex items-start gap-3">
        {contaminated ? (
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
        ) : (
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="label">
            {contaminated
              ? `${findings.length} retracted work${findings.length === 1 ? "" : "s"} upstream`
              : "Verified clean"}
          </p>
          <div className="mt-2">
            <PaperLink work={target} strong />
          </div>
        </div>
      </div>

      {contaminated ? (
        <div className="mt-6 space-y-7 border-t border-current/20 pt-6">
          {findings.map((f, i) => (
            <div key={i}>
              <p className="label mb-3 opacity-70">
                Route {i + 1} · {f.hops} hop{f.hops === 1 ? "" : "s"}
              </p>

              <ol className="space-y-0">
                {f.path.map((step, j) => {
                  const last = j === f.path.length - 1;

                  return (
                    <li key={step.id ?? j} className="relative flex gap-3 pb-4 last:pb-0">
                      {!last && (
                        <span className="absolute top-5 bottom-0 left-[5px] w-px bg-current opacity-25" />
                      )}
                      <span
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                          last ? "bg-current" : "bg-current opacity-30"
                        }`}
                      />
                      <PaperLink work={step} />
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-3 gap-4 border-t border-current/20 pt-5">
          <Metric value={stats.directReferences} label="Direct refs checked" />
          <Metric value={stats.worksExamined - 1} label="Works examined" />
          <Metric value={stats.depthReached} label="Levels deep" />
        </div>
      )}

      <p className="mt-6 border-t border-current/20 pt-4 font-mono text-[0.7rem] leading-relaxed opacity-70">
        {stats.skipped > 0
          ? `${stats.skipped.toLocaleString()} deeper references were not followed — a clean result for what was examined, not a proof of absence.`
          : "Ancestry exhausted — nothing upstream was skipped."}
      </p>
    </Panel>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="font-mono text-xl text-chalk">{value.toLocaleString()}</p>
      <p className="label mt-1 opacity-70">{label}</p>
    </div>
  );
}

function BatchView({ rows, summary }: { rows: BatchRow[]; summary: Summary }) {
  const anyFlagged = summary.flagged > 0;

  const flagged = rows.filter((r) => r.ok && (r.findings ?? 0) > 0);
  const clean = rows.filter((r) => r.ok && (r.findings ?? 0) === 0);
  const unresolved = rows.filter((r) => !r.ok);

  return (
    <Panel tone={anyFlagged ? "toxic" : "clean"}>
      <div className="flex items-start gap-3">
        {anyFlagged ? (
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
        ) : (
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="label">
            {anyFlagged
              ? `${summary.flagged} of ${summary.submitted} references need a look`
              : `All ${summary.resolved} resolved references are clean`}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-current/20 pt-5">
        <Metric value={summary.flagged} label="Flagged" />
        <Metric value={summary.clean} label="Clean" />
        <Metric value={summary.submitted - summary.resolved} label="Unresolved" />
      </div>

      {flagged.length > 0 && (
        <BatchGroup title="Needs a look" rows={flagged} />
      )}
      {clean.length > 0 && <BatchGroup title="Verified clean" rows={clean} />}
      {unresolved.length > 0 && (
        <BatchGroup title="Not in OpenAlex" rows={unresolved} />
      )}

      {unresolved.length > 0 && (
        <p className="mt-6 border-t border-current/20 pt-4 font-mono text-[0.7rem] leading-relaxed opacity-70">
          Unresolved entries are not errors. OpenAlex indexes recent papers and
          preprints with a lag, and datasheets or web pages have no DOI at all.
        </p>
      )}
    </Panel>
  );
}

function BatchGroup({ title, rows }: { title: string; rows: BatchRow[] }) {
  return (
    <div className="mt-7">
      <p className="label mb-3 opacity-70">
        {title} · {rows.length}
      </p>

      <ul className="divide-y divide-current/15 border-t border-current/20">
        {rows.map((row, i) => {
          const flagged = row.ok && (row.findings ?? 0) > 0;

          return (
            <li key={i} className="flex items-start gap-3 py-4">
              <span
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                  !row.ok
                    ? "bg-current opacity-30"
                    : flagged
                      ? "bg-current"
                      : "bg-current opacity-60"
                }`}
              />
              <div className="min-w-0 flex-1">
                <PaperLink
                  work={{ title: row.title ?? row.input, doi: row.ok ? row.input : null }}
                />
                <p className="label mt-1.5 opacity-70">
                  {!row.ok
                    ? "Not indexed"
                    : flagged
                      ? `${row.findings} retracted upstream · nearest ${row.nearestHops} hop${row.nearestHops === 1 ? "" : "s"}`
                      : `${row.directReferences} references checked`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
