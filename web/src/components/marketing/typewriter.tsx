"use client";

import { useEffect, useState } from "react";

type Props = {
  phrases: readonly string[];
  className?: string;
};

/**
 * Types and deletes phrases in a loop. Server-renders (and, under reduced
 * motion, stays on) the first phrase in full. An invisible sizer reserves the
 * longest phrase so the surrounding layout never jumps.
 */
export function Typewriter({ phrases, className }: Props) {
  const [state, setState] = useState({ i: 0, n: phrases[0]?.length ?? 0, deleting: false });

  useEffect(() => {
    if (phrases.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const phrase = phrases[state.i] ?? "";
    let wait: number;
    let next: typeof state;
    if (!state.deleting && state.n >= phrase.length) {
      wait = 2200;
      next = { ...state, deleting: true };
    } else if (state.deleting && state.n > 0) {
      wait = 24;
      next = { ...state, n: state.n - 1 };
    } else if (state.deleting) {
      wait = 320;
      next = { i: (state.i + 1) % phrases.length, n: 0, deleting: false };
    } else {
      wait = 45 + Math.random() * 55;
      next = { ...state, n: state.n + 1 };
    }
    const timer = window.setTimeout(() => setState(next), wait);
    return () => window.clearTimeout(timer);
  }, [state, phrases]);

  const longest = phrases.reduce((a, b) => (b.length > a.length ? b : a), "");
  const text = (phrases[state.i] ?? "").slice(0, state.n);

  return (
    <span className={`relative inline-grid align-bottom ${className ?? ""}`}>
      <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre">
        {longest}
        <span className="mk-caret" />
      </span>
      <span aria-hidden className="col-start-1 row-start-1 whitespace-pre">
        {text}
        <span className="mk-caret" />
      </span>
      <span className="sr-only">{phrases.join(", ")}</span>
    </span>
  );
}
