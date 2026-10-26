import Image from "next/image";

import { castMember } from "./cast";

const label = "mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-purple-300/50";

/** A mock of the dashboard's character editor, filled in for Juniper. */
export function CharacterSheet() {
  const juniper = castMember("juniper");
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div
        aria-hidden
        className="absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(168,85,247,0.28),transparent)] blur-2xl"
      />
      <div className="rotate-[-1.5deg] rounded-[1.75rem] border border-white/10 bg-[#120d1f]/90 p-6 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <Image
            src={juniper.img}
            alt="Juniper's portrait"
            width={64}
            height={64}
            className="h-16 w-16 rounded-2xl object-cover ring-1 ring-white/15"
          />
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold text-white">{juniper.name}</p>
            <p className="font-mono text-xs text-purple-300/50">/setcharacter Juniper</p>
          </div>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300 ring-1 ring-emerald-400/20">
            <span className="mk-ping h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Active
          </span>
        </div>

        <dl className="mt-6 space-y-5 text-sm">
          <div>
            <dt className={label}>Description</dt>
            <dd className="leading-relaxed text-purple-100/80">
              A centuries-old fox spirit who runs a tea stall at the edge of the woods. Speaks in
              riddles when bored, which is often. Fiercely loyal to anyone who brings her
              something shiny.
            </dd>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt className={label}>Loves</dt>
              <dd className="flex flex-wrap gap-1.5">
                {["warm tea", "riddles", "shiny things"].map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-pink-400/10 px-2.5 py-0.5 text-xs text-pink-200 ring-1 ring-pink-400/20"
                  >
                    {t}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt className={label}>Hates</dt>
              <dd className="flex flex-wrap gap-1.5">
                {["iron bells", "being ignored"].map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-purple-200/70 ring-1 ring-white/10"
                  >
                    {t}
                  </span>
                ))}
              </dd>
            </div>
          </div>
          <div>
            <dt className={label}>Reply style</dt>
            <dd className="grid grid-cols-4 gap-1 rounded-full bg-white/[0.04] p-1 text-center text-xs">
              {["one-liner", "semi-lit", "literate", "novella"].map((s) => (
                <span
                  key={s}
                  className={`rounded-full py-1.5 ${
                    s === "literate"
                      ? "bg-linear-to-r from-purple-500/80 to-pink-500/80 font-semibold text-white"
                      : "text-purple-200/50"
                  }`}
                >
                  {s}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className={label}>Known users</dt>
            <dd className="flex items-center gap-3">
              <span className="flex -space-x-2">
                {[
                  ["M", "#f472b6"],
                  ["S", "#60a5fa"],
                  ["O", "#34d399"],
                ].map(([letter, color]) => (
                  <span
                    key={letter}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-[#0b0716] ring-2 ring-[#120d1f]"
                    style={{ background: color }}
                  >
                    {letter}
                  </span>
                ))}
              </span>
              <span className="text-xs text-purple-200/50">3 of 5 · each with their own notes</span>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
