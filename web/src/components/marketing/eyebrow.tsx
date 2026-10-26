import type { ReactNode } from "react";

/** Small numbered section label, e.g. "01 — The cast". */
export function Eyebrow({ n, children }: { n?: string; children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-pink-200/75">
      {n && <span className="font-mono text-[0.7rem] text-purple-300/50">{n}</span>}
      <span aria-hidden className="h-px w-8 bg-linear-to-r from-pink-300/60 to-transparent" />
      {children}
    </p>
  );
}
