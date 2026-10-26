import Image from "next/image";

import { CAST } from "./cast";

/** An endlessly drifting row of arch-framed character portraits. Pauses on hover. */
export function CastMarquee() {
  const items = [...CAST, ...CAST];
  return (
    <div className="mk-marquee relative">
      <div className="mk-marquee-track pb-10 pt-4">
        {items.map((c, i) => {
          const duplicate = i >= CAST.length;
          return (
            <figure
              key={`${c.id}-${i}`}
              aria-hidden={duplicate || undefined}
              className={`group mr-6 w-48 shrink-0 sm:mr-10 sm:w-56 ${
                i % 2 ? "translate-y-8" : ""
              }`}
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-t-full rounded-b-[1.75rem] shadow-[0_30px_60px_-25px_rgba(0,0,0,0.9)] ring-1 ring-white/10 transition duration-500 group-hover:ring-pink-300/40">
                <Image
                  src={c.img}
                  alt={duplicate ? "" : `${c.name}, ${c.tagline}`}
                  fill
                  sizes="224px"
                  className="object-cover transition duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-[#0a0612]/80 to-transparent" />
              </div>
              <figcaption className="mt-4 text-center">
                <p className="font-serif text-2xl italic text-white">{c.name}</p>
                <p className="mt-0.5 text-sm text-purple-200/55">{c.tagline}</p>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
