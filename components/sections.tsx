"use client";

import { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { Clock, GitBranch, Layers, ShieldQuestion } from "lucide-react";
import Link from "next/link";
import { PrionMark } from "./prion-mark";

const EASE = [0.16, 1, 0.3, 1] as const;

const TIMING = [
  {
    key: "pre",
    tone: "text-mist",
    border: "border-line",
    title: "Pre-retraction",
    blurb:
      "Cited before the notice existed, and corrected since. The author could not have known. Forgivable.",
  },
  {
    key: "post",
    tone: "text-toxic",
    border: "border-toxic/40",
    title: "Post-retraction",
    blurb:
      "Cited after the paper was publicly flagged. The retraction was already on the record. Negligent.",
  },
  {
    key: "latent",
    tone: "text-amber",
    border: "border-amber/40",
    title: "Latent",
    blurb:
      "Cited in good faith before the retraction — and never corrected since. The largest and least visible category, and the one only a temporal graph can find.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative border-t border-line bg-ink">
      <div className="mx-auto max-w-7xl px-5 py-32 md:px-8 md:py-44">
        <header className="mb-20 max-w-2xl">
          <p className="label mb-5 text-hydra">Why a graph database</p>
          <h2 className="font-display text-4xl leading-[1.05] font-semibold tracking-tight text-chalk md:text-6xl">
            Three states a citation
            <br />
            <span className="text-mist">can be in.</span>
          </h2>
          <p className="mt-7 text-base leading-relaxed text-mist md:text-lg">
            Every citation has a date. Every retraction has a date. Compare the
            two and the same edge means three completely different things — a
            distinction that only exists as a query if the database can answer
            what was true on a given day.
          </p>
        </header>

        <div className="grid gap-5 md:grid-cols-3">
          {TIMING.map((t, i) => (
            <motion.article
              key={t.key}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.75, ease: EASE, delay: i * 0.12 }}
              className={`border ${t.border} bg-void p-8 md:p-9`}
            >
              <Clock size={18} className={t.tone} />
              <h3 className={`mt-6 font-display text-2xl font-semibold ${t.tone}`}>
                {t.title}
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-mist md:text-base">
                {t.blurb}
              </p>
            </motion.article>
          ))}
        </div>

        <div className="mt-24 grid gap-5 md:grid-cols-3">
          <Primitive
            icon={<Layers size={16} />}
            title="Entity resolution"
            body="Retraction notices frequently aren't linked to the article they retract, and one work exists as preprint, DOI and PMID at once. HydraDB unifies them, and the resolution lift over raw Crossref metadata is reported rather than assumed."
          />
          <Primitive
            icon={<GitBranch size={16} />}
            title="Graph traversal"
            body="Contamination is a multi-hop path question: does a route exist from this paper, through load-bearing citations, to retracted ground? Vector similarity structurally cannot answer it."
          />
          <Primitive
            icon={<ShieldQuestion size={16} />}
            title="Calibrated abstention"
            body="Where no open-access full text exists, the edge weight is unknown — not a default. Those paths are excluded from the score and counted separately. Nothing is guessed."
          />
        </div>
      </div>
    </section>
  );
}

function Primitive({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, ease: EASE }}
      className="group border-t border-line pt-7"
    >
      <span className="inline-flex text-hydra transition-transform duration-500 group-hover:-translate-y-0.5">
        {icon}
      </span>
      <h3 className="mt-5 font-display text-lg font-semibold text-chalk">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-mist">{body}</p>
    </motion.div>
  );
}

export interface ResultStat {
  value: number;
  suffix?: string;
  label: string;
  // Where the figure comes from, so nothing on this band is unsourced.
  note?: string;
}

// Starts at the final value, not zero.
function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const reduce = useReducedMotion();
  const started = useRef(false);
  const [n, setN] = useState(to);

  useEffect(() => {
    if (!inView || reduce || started.current) return;
    started.current = true;

    const controls = animate(0, to, {
      duration: 1.6,
      ease: "easeOut",
      onUpdate: (v) => setN(Math.round(v)),
      onComplete: () => setN(to),
    });

    return () => controls.stop();
  }, [inView, reduce, to]);

  return (
    <span ref={ref} className="tabular-nums">
      {n.toLocaleString()}
      {suffix}
    </span>
  );
}

export function Results({ stats }: { stats: ResultStat[] }) {
  return (
    <section id="results" className="border-t border-line">
      <div className="mx-auto max-w-7xl px-5 py-28 md:px-8 md:py-36">
        <p className="label mb-14 text-hydra">By the numbers</p>
        <dl className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((r, i) => (
            <motion.div
              key={r.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, ease: EASE, delay: i * 0.08 }}
            >
              <dd className="font-display text-5xl font-bold tracking-tight text-chalk md:text-6xl">
                <Counter to={r.value} suffix={r.suffix} />
              </dd>
              <dt className="label mt-4 text-mist">{r.label}</dt>
              {r.note && (
                <p className="mt-2 text-xs leading-relaxed text-mist/60">
                  {r.note}
                </p>
              )}
            </motion.div>
          ))}
        </dl>

        <p className="mt-14 max-w-2xl text-xs leading-relaxed text-mist/60">
          Counted from the committed corpus at build time, not written by hand.
          Classification coverage is still small: most edges remain unclassified
          and are excluded from scoring rather than assigned a guessed weight.
        </p>
      </div>
    </section>
  );
}

export { CheckPanel } from "./check-panel";

const SOURCES = [
  { name: "OpenAlex", href: "https://openalex.org/", note: "CC0" },
  { name: "Crossref", href: "https://www.crossref.org/", note: "Open" },
  { name: "Retraction Watch", href: "https://retractionwatch.com/", note: "CC0" },
  { name: "Europe PMC", href: "https://europepmc.org/", note: "OA subset" },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-void">
      <div className="mx-auto max-w-6xl px-5 py-16 md:px-8">
        <div className="flex flex-col gap-12 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-3">
              <PrionMark size={24} />
              <span className="font-mono text-sm font-bold tracking-[0.28em] text-chalk">
                PRION
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-mist">
              Retractions don&apos;t stop at the paper. PRION walks the citation
              graph and tells you what is still standing on retracted ground.
            </p>
          </div>

          <div className="flex gap-16">
            <div>
              <p className="label mb-4 text-mist/60">Project</p>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <Link href="/docs" className="text-mist transition-colors hover:text-chalk">
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link href="/docs/status" className="text-mist transition-colors hover:text-chalk">
                    Build status
                  </Link>
                </li>
                <li>
                  <a
                    href="https://hackhydra.hydradb.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-mist transition-colors hover:text-chalk"
                  >
                    Hack Hydra
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <p className="label mb-4 text-mist/60">Data</p>
              <ul className="space-y-2.5 text-sm">
                {SOURCES.map((s) => (
                  <li key={s.name}>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-mist transition-colors hover:text-chalk"
                    >
                      {s.name}{" "}
                      <span className="text-mist/40">{s.note}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="label text-mist/50">
            MIT licensed · Built for Hack Hydra, Track 1
          </p>
          <p className="label text-mist/50">
            Retraction data is imperfect — always verify against the publisher
          </p>
        </div>
      </div>
    </footer>
  );
}
