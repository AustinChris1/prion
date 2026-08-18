"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useReducedMotion,
} from "motion/react";
import { ArrowRight, Search } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

// Letters rise out of a mask, staggered.
function Wordmark({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className} aria-label={text}>
      {text.split("").map((ch, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom" aria-hidden>
          <motion.span
            className="inline-block"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            transition={{ duration: 1, ease: EASE, delay: 0.18 + i * 0.055 }}
          >
            {ch}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

// Pulls gently toward the cursor.
function MagneticCTA({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 260, damping: 18 });
  const y = useSpring(my, { stiffness: 260, damping: 18 });

  return (
    <motion.a
      ref={ref}
      href={href}
      style={reduce ? undefined : { x, y }}
      onMouseMove={(e) => {
        if (reduce || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        mx.set((e.clientX - (r.left + r.width / 2)) * 0.28);
        my.set((e.clientY - (r.top + r.height / 2)) * 0.28);
      }}
      onMouseLeave={() => {
        mx.set(0);
        my.set(0);
      }}
      className="label group inline-flex items-center gap-3 border border-hydra bg-hydra px-7 py-4 text-void transition-colors duration-300 hover:bg-transparent hover:text-hydra"
    >
      {children}
      <ArrowRight size={14} className="transition-transform duration-300 group-hover:translate-x-1" />
    </motion.a>
  );
}

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [0, 140]);
  const opacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <section
      id="top"
      ref={ref}
      className="grain relative flex min-h-screen items-center overflow-hidden"
    >
      {/* ambient orange bloom — the HydraDB family tell */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[38rem] w-[38rem] rounded-full bg-hydra/12 blur-[140px]" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-[30rem] w-[30rem] rounded-full bg-toxic/8 blur-[140px]" />

      <motion.div
        style={{ y, opacity }}
        className="relative z-10 mx-auto w-full max-w-7xl px-5 pt-28 md:px-8"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="mb-9 flex items-center gap-3"
        >
          <span className="h-1.5 w-1.5 bg-toxic" />
          <span className="label text-mist">
            Built on HydraDB · Hack Hydra 2026 · Track 1
          </span>
        </motion.div>

        <h1 className="font-display text-[clamp(4rem,15vw,13rem)] leading-[0.82] font-bold tracking-[-0.045em]">
          <Wordmark text="PRION" className="block text-chalk" />
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.7 }}
          className="lit mt-8 max-w-2xl text-2xl leading-snug text-chalk italic md:text-[2.1rem]"
        >
          Retractions don&rsquo;t stop at the paper.
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.85 }}
          className="mt-6 max-w-xl text-base leading-relaxed text-mist md:text-lg"
        >
          OpenAlex flags 134,147 works as retracted. The notice stops the paper —
          it never reaches the work built on top of it. PRION walks the citation
          graph and tells you what is still standing on retracted ground.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 1 }}
          className="mt-12 flex flex-wrap items-center gap-4"
        >
          <MagneticCTA href="#check">Trace a paper</MagneticCTA>
          <a
            href="#how"
            className="label group inline-flex items-center gap-3 border border-line px-7 py-4 text-mist transition-colors hover:border-chalk hover:text-chalk"
          >
            <Search size={14} />
            See how it works
          </a>
        </motion.div>
      </motion.div>
    </section>
  );
}
