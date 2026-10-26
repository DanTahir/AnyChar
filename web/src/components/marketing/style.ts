import type { CSSProperties } from "react";

/** Sets the `--d` custom property used by mk-rise / mk-msg / mk-float / data-reveal delays. */
export function delay(ms: number): CSSProperties {
  return { "--d": `${ms}ms` } as CSSProperties;
}

export const h2Class =
  "mt-5 font-display text-[clamp(2rem,3.8vw,3.1rem)] font-bold leading-[1.08] tracking-[-0.03em] text-white";

/** Serif-italic gradient phrase used inside display headings. */
export const serifAccent =
  "mk-gradient-text font-serif text-[1.12em] font-normal italic tracking-normal";
