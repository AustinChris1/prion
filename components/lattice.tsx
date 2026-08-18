"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "motion/react";

// Deterministic lattice geometry.

const W = 1440;
const H = 900;
const COLS = 11;
const ROWS = 7;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Node = { x: number; y: number; depth: number };
type Edge = { a: number; b: number; depth: number };

function buildLattice() {
  const rand = mulberry32(0x9e3779b9);
  const nodes: { x: number; y: number }[] = [];

  const padX = W / (COLS + 1);
  const padY = H / (ROWS + 1);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      nodes.push({
        x: padX * (c + 1) + (rand() - 0.5) * padX * 0.75,
        y: padY * (r + 1) + (rand() - 0.5) * padY * 0.75,
      });
    }
  }

  // Connect each node to its two nearest neighbours; dedupe undirected pairs.
  const seen = new Set<string>();
  const pairs: [number, number][] = [];

  nodes.forEach((n, i) => {
    const near = nodes
      .map((m, j) => ({ j, d: (m.x - n.x) ** 2 + (m.y - n.y) ** 2 }))
      .filter((e) => e.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2);

    for (const { j } of near) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([i, j]);
    }
  });

  // Breadth-first distance from the retracted seed paper.
  const adj: number[][] = nodes.map(() => []);
  for (const [a, b] of pairs) {
    adj[a].push(b);
    adj[b].push(a);
  }

  const SEED = Math.floor(ROWS / 2) * COLS + 1; // left-of-centre
  const depth = new Array(nodes.length).fill(Infinity);
  depth[SEED] = 0;
  const queue = [SEED];

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const nxt of adj[cur]) {
      if (depth[nxt] === Infinity) {
        depth[nxt] = depth[cur] + 1;
        queue.push(nxt);
      }
    }
  }

  const reachable = depth.filter((d) => d !== Infinity);
  const maxDepth = Math.max(...reachable);

  const outNodes: Node[] = nodes.map((n, i) => ({
    ...n,
    depth: depth[i] === Infinity ? maxDepth + 3 : depth[i],
  }));

  const outEdges: Edge[] = pairs.map(([a, b]) => ({
    a,
    b,
    // An edge is contaminated once its later endpoint is.
    depth: Math.max(outNodes[a].depth, outNodes[b].depth),
  }));

  return { nodes: outNodes, edges: outEdges, maxDepth, seed: SEED };
}

const LATTICE = buildLattice();
const SPAN = LATTICE.maxDepth + 3;

// Progress window during which a given depth flips from clean to contaminated.
function window_(depth: number): [number, number] {
  const start = Math.min(depth / SPAN, 0.999);
  const end = Math.min((depth + 1.4) / SPAN, 1);
  return [start, end < start + 0.001 ? start + 0.001 : end];
}


function LatticeEdge({ edge, p }: { edge: Edge; p: MotionValue<number> }) {
  const a = LATTICE.nodes[edge.a];
  const b = LATTICE.nodes[edge.b];
  const [s, e] = window_(edge.depth);

  const stroke = useTransform(p, [s, e], ["#23262c", "#e5484d"]);
  const opacity = useTransform(p, [s, e], [0.5, 0.85]);

  return (
    <motion.line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      strokeWidth={1}
      style={{ stroke, opacity }}
    />
  );
}

function LatticeNode({
  node,
  isSeed,
  p,
}: {
  node: Node;
  isSeed: boolean;
  p: MotionValue<number>;
}) {
  const [s, e] = window_(node.depth);

  const fill = useTransform(p, [s, e], ["#2f333b", "#e5484d"]);
  const halo = useTransform(p, [s, e], [0, 0.28]);
  const r = useTransform(p, [s, e], [2.2, 3.6]);

  if (isSeed) {
    return (
      <g>
        <circle cx={node.x} cy={node.y} r={16} fill="#e5484d" opacity={0.14} />
        <motion.circle
          cx={node.x}
          cy={node.y}
          r={9}
          fill="#e5484d"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          animate={{ scale: [1, 1.85, 1], opacity: [0.32, 0.02, 0.32] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeOut" }}
        />
        <circle cx={node.x} cy={node.y} r={5} fill="#e5484d" />
      </g>
    );
  }

  return (
    <g>
      <motion.circle cx={node.x} cy={node.y} r={11} fill="#e5484d" style={{ opacity: halo }} />
      <motion.circle cx={node.x} cy={node.y} style={{ fill, r }} />
    </g>
  );
}


const BEATS = [
  {
    kicker: "T+0",
    line: "One paper is retracted.",
    note: "Data fabrication. The journal issues a notice.",
  },
  {
    kicker: "The problem",
    line: "It had already been cited 340 times.",
    note: "The notice reaches the paper. It does not reach the papers built on top of it.",
  },
  {
    kicker: "Propagation",
    line: "Those 340 were cited in turn.",
    note: "A meta-analysis pools the fabricated trial. A guideline cites the meta-analysis.",
  },
  {
    kicker: "Today",
    line: "None of it has been corrected.",
    note: "Nobody traces this, because tracing it is a multi-hop graph problem.",
  },
];

export function ContaminationLattice() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });

  return (
    <section ref={ref} className="relative h-[380vh]" aria-label="How contamination spreads">
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        {/* the lattice */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <g>
            {LATTICE.edges.map((edge, i) => (
              <LatticeEdge key={i} edge={edge} p={scrollYProgress} />
            ))}
          </g>
          <g>
            {LATTICE.nodes.map((node, i) => (
              <LatticeNode
                key={i}
                node={node}
                isSeed={i === LATTICE.seed}
                p={scrollYProgress}
              />
            ))}
          </g>
        </svg>

        {/* vignette so type stays readable over the graph */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_10%,var(--color-void)_78%)]" />

        {/* beats */}
        {/* Vertically centred on mobile — pinning to the bottom left a screen
            of dead space above the copy. Left-aligned from md up. */}
        <div className="relative z-10 flex h-full items-center justify-center px-5 pb-16 md:justify-start md:px-[8vw] md:pb-0">
          <div className="relative min-h-64 w-full max-w-xl sm:min-h-56 md:h-52">
            {BEATS.map((beat, i) => (
              <Beat
                key={i}
                beat={beat}
                index={i}
                total={BEATS.length}
                p={scrollYProgress}
                reduce={!!reduce}
              />
            ))}
          </div>
        </div>

        <ScrollHint p={scrollYProgress} />
      </div>
    </section>
  );
}

function Beat({
  beat,
  index,
  total,
  p,
  reduce,
}: {
  beat: (typeof BEATS)[number];
  index: number;
  total: number;
  p: MotionValue<number>;
  reduce: boolean;
}) {
  // Index-derived so every stop stays inside [0,1]; WAAPI rejects anything else.
  const seg = 1 / total;
  const base = index * seg;
  const stops: [number, number, number, number] = [
    base,
    base + seg * 0.18,
    base + seg * 0.72,
    base + seg * 0.98,
  ];

  const opacity = useTransform(p, stops, [0, 1, 1, 0]);
  const y = useTransform(
    p,
    [stops[0], stops[3]],
    reduce ? [0, 0] : [28, -28],
  );

  return (
    <motion.div style={{ opacity, y }} className="absolute inset-x-0 top-0">
      <p className="label text-hydra mb-3 md:mb-4">{beat.kicker}</p>
      <p className="font-display text-[1.75rem] leading-[1.12] font-medium tracking-tight text-chalk sm:text-3xl md:text-5xl">
        {beat.line}
      </p>
      <p className="lit mt-4 max-w-md text-[0.95rem] leading-relaxed text-mist sm:text-base md:mt-5 md:text-lg">
        {beat.note}
      </p>
    </motion.div>
  );
}

function ScrollHint({ p }: { p: MotionValue<number> }) {
  const opacity = useTransform(p, [0, 0.06], [1, 0]);
  return (
    <motion.div
      style={{ opacity }}
      className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2"
    >
      <div className="flex flex-col items-center gap-3">
        <span className="label text-mist">Scroll</span>
        <motion.span
          className="block h-8 w-px bg-linear-to-b from-hydra to-transparent"
          style={{ transformOrigin: "top" }}
          animate={{ scaleY: [0.3, 1, 0.3] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </motion.div>
  );
}
