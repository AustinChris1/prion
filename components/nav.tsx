"use client";

import { motion, useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { PrionMark } from "./prion-mark";

// Absolute so they still resolve from /docs, not just the landing page.
// Docs gets its own button so it is reachable on mobile, where these links are hidden.
// too, since these section links are desktop-only.
const LINKS = [
  { label: "How it works", href: "/#how" },
  { label: "Evidence", href: "/#evidence" },
  { label: "Results", href: "/#results" },
  { label: "FAQ", href: "/#faq" },
];

export function Nav() {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);

  useMotionValueEvent(scrollY, "change", (v) => setSolid(v > 40));

  return (
    <motion.header
      initial={{ y: -70, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        solid ? "border-b border-line bg-void/80 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-8">
        <Link href="/#top" className="group flex items-center gap-3">
          <PrionMark size={26} animate />
          <span className="font-mono text-sm font-bold tracking-[0.28em] text-chalk">
            PRION
          </span>
        </Link>

        <nav className="hidden items-center gap-9 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="label group relative text-mist transition-colors hover:text-chalk"
            >
              {l.label}
              <span className="absolute -bottom-1.5 left-0 h-px w-0 bg-hydra transition-all duration-300 group-hover:w-full" />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/docs"
            className="label border border-line px-3 py-2.5 text-mist transition-colors hover:border-mist hover:text-chalk sm:px-4"
          >
            Docs
          </Link>
          <Link
            href="/#check"
            className="label border border-hydra bg-hydra px-3 py-2.5 text-void transition-colors hover:bg-transparent hover:text-hydra sm:px-4"
          >
            <span className="sm:hidden">Check</span>
            <span className="hidden sm:inline">Check a paper</span>
          </Link>
        </div>
      </div>
    </motion.header>
  );
}
