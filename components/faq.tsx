"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Minus, Plus } from "lucide-react";

// Written for someone who has never heard the word "retraction".
const FAQ = [
  {
    q: "What is a retracted paper?",
    a: "A published study that the journal has since withdrawn, because the data was fabricated, the analysis was wrong, or the work could not be trusted. The paper stays online, usually with a notice attached. Around 134,000 papers have been retracted.",
  },
  {
    q: "If it is withdrawn, why does it still matter?",
    a: "Because other researchers already built on it. The notice reaches the retracted paper. It does not reach the hundreds of papers that cited it, or the papers that cited those. The bad result keeps travelling outward long after the original is pulled.",
  },
  {
    q: "So what does PRION actually do?",
    a: "You give it a paper. It walks backwards through everything that paper cites, and everything those cite, looking for retracted work upstream. Then it tells you whether those connections actually matter.",
  },
  {
    q: "What does “load-bearing” mean?",
    a: "Whether the citation holds weight. “See Smith for background” is a passing mention. “We pooled Smith’s effect estimate” means the conclusion literally rests on Smith’s numbers. If Smith was retracted, only the second one is a problem.",
  },
  {
    q: "Does a finding mean the paper is wrong?",
    a: "No, and PRION never says that. It says a paper has a dependency on retracted research and shows you the citation sentence so you can judge for yourself. Citing a retracted paper in order to dispute it scores zero, because criticising bad work is not contamination.",
  },
  {
    q: "What does a clean result mean?",
    a: "That nothing retracted was found in the part of the ancestry that was checked. Every clean result states how many references were examined and how many were not. A paper’s own bibliography is always checked in full; levels beyond that are sampled, and PRION says so rather than implying certainty.",
  },
  {
    q: "Can I check my whole reference list?",
    a: "Yes. Paste it raw, straight out of your document. IEEE numbering, arXiv IDs, DOIs buried in publisher links, DOIs split across lines by PDF copy-paste — all of it is parsed automatically.",
  },
  {
    q: "Does this only work for medicine?",
    a: "It works anywhere, but retractions cluster heavily in biomedicine, so a computer science or engineering bibliography will usually come back clean. That is a real answer, not a failure. The more universal use is the opposite direction: nothing in publishing tells you when a paper you cited years ago is retracted afterwards.",
  },
  {
    q: "What is HydraDB doing here?",
    a: "It stores the citation graph and answers the multi-hop questions. Citations are written into each document’s text and HydraDB builds the graph from them, inferring relations like “cites”, “published in” and “retracted on” — including the retraction date, which is what makes the timing analysis possible.",
  },
];

const AUDIENCE = [
  { who: "Researchers", use: "Check a paper before you trust it" },
  { who: "Students", use: "Audit a thesis bibliography before submitting" },
  { who: "Reviewers & editors", use: "Screen a manuscript’s evidence base" },
  { who: "Systematic reviewers", use: "Catch retracted trials before pooling them" },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="border-t border-line bg-ink">
      <div className="mx-auto max-w-5xl px-5 py-28 md:px-8 md:py-36">
        <p className="label mb-5 text-hydra">Plainly</p>
        <h2 className="font-display max-w-2xl text-4xl leading-[1.05] font-semibold tracking-tight text-chalk md:text-5xl">
          Google Scholar tells you what a paper cites.
          <br />
          <span className="text-mist">
            PRION asks whether what it cites still holds up.
          </span>
        </h2>

        {/* Who it is for */}
        <dl className="mt-14 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCE.map((a) => (
            <div key={a.who} className="bg-ink p-5">
              <dt className="label text-hydra">{a.who}</dt>
              <dd className="mt-2.5 text-sm leading-relaxed text-mist">
                {a.use}
              </dd>
            </div>
          ))}
        </dl>

        {/* Questions */}
        <div className="mt-16 border-t border-line">
          {FAQ.map((item, i) => {
            const isOpen = open === i;

            return (
              <div key={item.q} className="border-b border-line">
                <h3>
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-start justify-between gap-6 py-6 text-left transition-colors hover:text-chalk"
                  >
                    <span
                      className={`font-display text-lg leading-snug font-medium md:text-xl ${
                        isOpen ? "text-chalk" : "text-mist"
                      }`}
                    >
                      {item.q}
                    </span>
                    <span className="mt-1 shrink-0 text-hydra">
                      {isOpen ? <Minus size={16} /> : <Plus size={16} />}
                    </span>
                  </button>
                </h3>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="lit max-w-2xl pb-7 text-base leading-relaxed text-mist md:text-lg">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
