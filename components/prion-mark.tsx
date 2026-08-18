"use client";

import { motion, useReducedMotion } from "motion/react";

// PRION's mark.
export function PrionMark({
  size = 40,
  animate = false,
  className,
}: {
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const live = animate && !reduce;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="PRION"
    >
      <title>PRION</title>
      <defs>
        <linearGradient id="prion-misfold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-hydra)" />
          <stop offset="100%" stopColor="var(--color-toxic)" />
        </linearGradient>
      </defs>

      {/* The healthy fold */}
      <motion.path
        d="M47.3 44.9 A20 20 0 1 1 50.1 23.6"
        stroke="var(--color-chalk)"
        strokeWidth={4}
        strokeLinecap="round"
        initial={live ? { pathLength: 0, opacity: 0 } : false}
        animate={live ? { pathLength: 1, opacity: 1 } : undefined}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* The misfold */}
      <motion.path
        d="M50.1 23.6 L43 29 L53 34 L43 39.5 L47.3 44.9"
        stroke="url(#prion-misfold)"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={live ? { pathLength: 0, opacity: 0 } : false}
        animate={live ? { pathLength: 1, opacity: 1 } : undefined}
        transition={{ duration: 0.5, delay: 0.85, ease: "easeOut" }}
      />

      {/* Propagation */}
      <motion.g
        stroke="var(--color-toxic)"
        strokeWidth={3}
        strokeLinecap="round"
        initial={live ? { opacity: 0, x: -4 } : false}
        animate={live ? { opacity: 1, x: 0 } : undefined}
        transition={{ duration: 0.45, delay: 1.3, ease: "easeOut" }}
      >
        <path d="M56 27.5 L61 24.5" />
        <path d="M56.5 34 L62.5 34" />
        <path d="M56 40.5 L61 43.5" />
      </motion.g>
    </svg>
  );
}
