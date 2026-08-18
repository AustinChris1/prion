"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy, Info, TriangleAlert, Wrench } from "lucide-react";

export function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="lit mb-12 text-xl leading-relaxed text-mist md:text-2xl">
      {children}
    </p>
  );
}

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="font-display mt-16 mb-5 scroll-mt-24 text-2xl font-medium tracking-tight text-chalk first:mt-0 md:text-3xl"
    >
      {children}
    </h2>
  );
}

export function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-display mt-10 mb-3 text-lg font-medium text-chalk">
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mb-5 leading-relaxed text-mist">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="mb-5 space-y-2.5 text-mist [&>li]:relative [&>li]:pl-5 [&>li]:leading-relaxed [&>li:before]:absolute [&>li:before]:left-0 [&>li:before]:top-[0.62em] [&>li:before]:h-1 [&>li:before]:w-1 [&>li:before]:bg-hydra [&>li:before]:content-['']">
      {children}
    </ul>
  );
}

export function Code({
  children,
  filename,
}: {
  children: string;
  filename?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked — the text is selectable anyway
    }
  };

  return (
    <div className="mb-6 border border-line bg-ink">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="label text-mist">{filename ?? "shell"}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 text-mist transition-colors hover:text-chalk"
          aria-label="Copy to clipboard"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-clean" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span className="label">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4">
        <code className="font-mono text-[0.8125rem] leading-relaxed text-chalk">
          {children.trim()}
        </code>
      </pre>
    </div>
  );
}

export function Inline({ children }: { children: ReactNode }) {
  return (
    <code className="border border-line bg-ink px-1.5 py-0.5 font-mono text-[0.85em] text-hydra">
      {children}
    </code>
  );
}

const CALLOUT = {
  note: { icon: Info, color: "text-hydra", border: "border-l-hydra" },
  warn: { icon: TriangleAlert, color: "text-amber", border: "border-l-amber" },
  todo: { icon: Wrench, color: "text-mist", border: "border-l-line" },
} as const;

export function Callout({
  kind = "note",
  title,
  children,
}: {
  kind?: keyof typeof CALLOUT;
  title: string;
  children: ReactNode;
}) {
  const { icon: Icon, color, border } = CALLOUT[kind];

  return (
    <div className={`mb-6 border border-line border-l-2 ${border} bg-ink/60 p-5`}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className={`label ${color}`}>{title}</span>
      </div>
      <div className="text-sm leading-relaxed text-mist [&_p:last-child]:mb-0">
        {children}
      </div>
    </div>
  );
}

export type State = "done" | "wip" | "todo";

const STATE = {
  done: { dot: "bg-clean", label: "Working" },
  wip: { dot: "bg-amber", label: "Stubbed" },
  todo: { dot: "bg-line", label: "Not built" },
} as const;

export function StatusRow({
  state,
  name,
  children,
}: {
  state: State;
  name: string;
  children: ReactNode;
}) {
  const s = STATE[state];

  return (
    <div className="flex gap-4 border-b border-line py-4 last:border-0">
      <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-sm text-chalk">{name}</span>
          <span className="label text-mist">{s.label}</span>
        </div>
        <p className="text-sm leading-relaxed text-mist">{children}</p>
      </div>
    </div>
  );
}

export function Table({
  head,
  rows,
}: {
  head: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="mb-6 overflow-x-auto border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-ink">
            {head.map((h) => (
              <th key={h} className="label px-4 py-3 text-left text-mist">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-4 py-3 align-top leading-relaxed text-mist"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
