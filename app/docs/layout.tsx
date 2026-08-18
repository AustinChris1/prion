import Link from "next/link";
import type { ReactNode } from "react";
import { DocsSidebar } from "@/components/docs-sidebar";
import { PrionMark } from "@/components/prion-mark";

export const metadata = {
  title: "Docs — PRION",
  description:
    "How PRION traces retraction contamination through the citation graph, and how to run it.",
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-void">
      {/* Docs get their own slim header — the marketing nav doesn't belong here */}
      <header className="sticky top-0 z-50 border-b border-line bg-void/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <PrionMark size={24} />
            <span className="font-mono text-sm font-bold tracking-[0.28em] text-chalk">
              PRION
            </span>
            <span className="label ml-1 border-l border-line pl-3 text-mist">
              Docs
            </span>
          </Link>

          <Link
            href="/"
            className="label text-mist transition-colors hover:text-chalk"
          >
            ← Back to site
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-0 px-5 md:gap-12 md:px-8">
        <DocsSidebar />

        {/* pb clears the floating Contents trigger on mobile */}
        <main className="min-w-0 flex-1 py-12 pb-28 md:py-16 md:pb-16">
          <article className="max-w-3xl">{children}</article>

          <footer className="mt-24 max-w-3xl border-t border-line pt-8">
            <p className="text-sm text-mist">
              PRION is an open-source submission to{" "}
              <a
                href="https://hackhydra.hydradb.com/"
                target="_blank"
                rel="noreferrer"
                className="text-hydra underline-offset-4 hover:underline"
              >
                Hack Hydra
              </a>
              , Track 1 — Enterprise Context &amp; Ontology. MIT licensed.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
