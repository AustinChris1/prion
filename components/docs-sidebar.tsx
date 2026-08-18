"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { List, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

const NAV = [
  {
    section: "Start here",
    items: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/usage", label: "Install & run" },
    ],
  },
  {
    section: "Reference",
    items: [
      { href: "/docs/how-it-works", label: "How it works" },
      { href: "/docs/status", label: "Build status" },
    ],
  },
];

const EASE = [0.16, 1, 0.3, 1] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      {NAV.map((group) => (
        <div key={group.section} className="mb-8 last:mb-0">
          <p className="label mb-4 text-mist/60">{group.section}</p>

          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = pathname === item.href;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={`block border-l py-2 pl-4 text-sm transition-colors ${
                      active
                        ? "border-hydra text-chalk"
                        : "border-line text-mist hover:border-mist hover:text-chalk"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

export function DocsSidebar() {
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Links dismiss the drawer via onNavigate; setting state from an effect is wrong here.
  // pathname effect here — setting state from an effect is the wrong tool.

  // Escape closes it — the drawer traps attention, so it needs a keyboard out.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <>
      {/* ── Desktop: collapsible column ─────────────────── */}

      <aside
        className={`hidden shrink-0 transition-[width] duration-300 md:block ${
          collapsed ? "w-9" : "w-52"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)" }}
      >
        <div className="sticky top-28 py-16">
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand contents" : "Collapse contents"}
            className="mb-8 flex items-center gap-2 text-mist transition-colors hover:text-chalk"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span className="label">Contents</span>
              </>
            )}
          </button>

          {!collapsed && <NavList />}
        </div>
      </aside>

      {/* ── Mobile: floating trigger + drawer ───────────── */}

      <button
        onClick={() => setDrawer(true)}
        className="label fixed bottom-6 left-5 z-40 flex items-center gap-2 border border-line bg-ink/95 px-4 py-3 text-chalk shadow-lg backdrop-blur md:hidden"
        aria-label="Open contents"
      >
        <List className="h-4 w-4 text-hydra" />
        Contents
      </button>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawer(false)}
              className="fixed inset-0 z-40 bg-void/80 backdrop-blur-sm md:hidden"
            />

            <motion.nav
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.35, ease: EASE }}
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] overflow-y-auto border-r border-line bg-ink px-6 py-7 md:hidden"
              aria-label="Documentation contents"
            >
              <div className="mb-8 flex items-center justify-between">
                <span className="label text-mist">Contents</span>
                <button
                  onClick={() => setDrawer(false)}
                  aria-label="Close contents"
                  className="text-mist transition-colors hover:text-chalk"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <NavList onNavigate={() => setDrawer(false)} />
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
