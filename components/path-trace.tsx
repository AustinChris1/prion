"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { Quote, TriangleAlert } from "lucide-react";
import type { EdgeClass } from "@/lib/types";
import { EDGE_WEIGHT } from "@/lib/score";

export type Hop = {
  title: string;
  meta: string;
  edgeClass: EdgeClass | null;
  section?: string;
  evidence?: string;
  retracted?: { reason: string; date: string; citations: number; after: number };
};

// Shown only if the live trace is unavailable (upstream outage at build time).
const FALLBACK_CHAIN: Hop[] = [
  {
    title: "Your systematic review",
    meta: "In preparation · 2026",
    edgeClass: null,
  },
  {
    title: "Pooled effect of perioperative β-blockade on 30-day mortality",
    meta: "Smith et al. · Meta-analysis · 2021",
    edgeClass: "load_bearing_data",
    section: "Methods",
    evidence:
      "…we pooled the effect estimates reported by Jones et al. (2018) with the four remaining trials…",
  },
  {
    title: "A randomised trial of perioperative β-blockade",
    meta: "Jones et al. · RCT · 2018",
    edgeClass: "load_bearing_data",
    section: "Results",
    evidence:
      "…primary outcome data were drawn from the trial registry described previously…",
  },
  {
    title: "Cardiac outcomes following perioperative intervention",
    meta: "Retracted 2022",
    edgeClass: null,
    retracted: {
      reason: "Data fabrication",
      date: "2022-04-11",
      citations: 340,
      after: 190,
    },
  },
];

const CLASS_META: Record<EdgeClass, { label: string; color: string; dot: string }> = {
  load_bearing_data: { label: "Load-bearing · data", color: "text-toxic", dot: "bg-toxic" },
  load_bearing_method: { label: "Load-bearing · method", color: "text-toxic", dot: "bg-toxic" },
  supporting: { label: "Supporting", color: "text-amber", dot: "bg-amber" },
  incidental: { label: "Incidental", color: "text-mist", dot: "bg-mist" },
  contrasting: { label: "Contrasting — not contamination", color: "text-clean", dot: "bg-clean" },
  unknown: { label: "Unknown — no open-access text", color: "text-amber", dot: "bg-amber" },
};

export function PathTrace({
  chain,
  tracedTitle,
}: {
  // A real traced path. Null when the live trace was unavailable.
  chain?: Hop[] | null;
  tracedTitle?: string | null;
}) {
  const live = Boolean(chain?.length);
  const CHAIN = chain?.length ? chain : FALLBACK_CHAIN;
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end 0.65"],
  });

  const draw = useTransform(scrollYProgress, [0.05, 0.9], [0, 1]);

  return (
    <section id="evidence" ref={ref} className="relative mx-auto max-w-5xl px-5 py-32 md:px-8 md:py-44">
      <header className="mb-16 max-w-2xl">
        <p className="label mb-5 text-hydra">The output</p>
        <h2 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight text-chalk md:text-6xl">
          Not a score in a box.
          <br />
          <span className="text-mist">The actual chain.</span>
        </h2>
        <p className="mt-7 text-base leading-relaxed text-mist md:text-lg">
          Every hop carries the sentence that justifies it, so a reader can check
          the claim rather than trust it. Citations that <em className="lit not-italic text-clean">dispute</em>{" "}
          a retracted paper score zero — criticising bad work is not contamination.
        </p>
      </header>

      <div className="relative">
        {/* the spine, drawn on scroll */}
        <svg
          className="pointer-events-none absolute top-4 left-[15px] h-[calc(100%-2rem)] w-0.5 overflow-visible"
          preserveAspectRatio="none"
          viewBox="0 0 2 100"
          aria-hidden
        >
          <line x1="1" y1="0" x2="1" y2="100" stroke="var(--color-line)" strokeWidth="2" />
          <motion.line
            x1="1"
            y1="0"
            x2="1"
            y2="100"
            stroke="var(--color-toxic)"
            strokeWidth="2"
            style={{ pathLength: draw }}
          />
        </svg>

        <ol className="space-y-5">
          {CHAIN.map((hop, i) => (
            <HopCard key={i} hop={hop} index={i} total={CHAIN.length} p={scrollYProgress} />
          ))}
        </ol>
      </div>

      <p className="label mt-10 pl-11 text-mist/60">
        {live ? (
          <>
            <span className="text-clean">Live trace</span>
            {tracedTitle ? ` · ${tracedTitle}` : ""} · refreshed hourly
          </>
        ) : (
          <>
            <span className="text-amber">Illustrative</span> · the live trace was
            unreachable at build time
          </>
        )}
      </p>
    </section>
  );
}

function HopCard({
  hop,
  index,
  total,
  p,
}: {
  hop: Hop;
  index: number;
  total: number;
  p: MotionValue<number>;
}) {
  const at = 0.05 + (index / total) * 0.8;
  const opacity = useTransform(p, [at - 0.06, at + 0.05], [0.25, 1]);
  const x = useTransform(p, [at - 0.06, at + 0.05], [-14, 0]);
  const cls = hop.edgeClass ? CLASS_META[hop.edgeClass] : null;

  return (
    <motion.li style={{ opacity, x }} className="relative pl-11">
      <span
        className={`absolute top-6 left-0 flex h-8 w-8 items-center justify-center border ${
          hop.retracted ? "border-toxic bg-toxic/15" : "border-line bg-ink"
        }`}
      >
        {hop.retracted ? (
          <TriangleAlert size={14} className="text-toxic" />
        ) : (
          <span className="h-1.5 w-1.5 bg-mist" />
        )}
      </span>

      {cls && (
        <div className="mb-3 flex items-center gap-2.5">
          <span className={`h-1.5 w-1.5 ${cls.dot}`} />
          <span className={`label ${cls.color}`}>{cls.label}</span>
          <span className="label text-mist/50">
            w = {EDGE_WEIGHT[hop.edgeClass!] ?? "—"} · {hop.section}
          </span>
        </div>
      )}

      <article
        className={`border p-6 transition-colors md:p-7 ${
          hop.retracted ? "border-toxic/40 bg-toxic/[0.06]" : "border-line bg-ink"
        }`}
      >
        <h3 className="lit text-lg leading-snug text-chalk md:text-xl">{hop.title}</h3>
        <p className="label mt-3 text-mist">{hop.meta}</p>

        {hop.evidence && (
          <figure className="mt-5 flex gap-3 border-l-2 border-line pl-4">
            <Quote size={14} className="mt-1 shrink-0 text-mist/50" />
            <blockquote className="lit text-sm leading-relaxed text-mist italic md:text-base">
              {hop.evidence}
            </blockquote>
          </figure>
        )}

        {hop.retracted && (
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-toxic/25 pt-5 sm:grid-cols-4">
            <Stat label="Reason" value={hop.retracted.reason} tone="toxic" />
            <Stat label="Retracted" value={hop.retracted.date} />
            <Stat label="Citations" value={String(hop.retracted.citations)} />
            <Stat
              label="After retraction"
              value={String(hop.retracted.after)}
              tone="toxic"
            />
          </dl>
        )}
      </article>
    </motion.li>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "toxic";
}) {
  return (
    <div>
      <dt className="label text-mist/60">{label}</dt>
      <dd
        className={`mt-1.5 font-mono text-sm ${
          tone === "toxic" ? "text-toxic" : "text-chalk"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
