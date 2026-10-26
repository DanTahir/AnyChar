import Image from "next/image";

/** Layered hero background: drifting aurora art, cursor spotlight, grain, fade-out. */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <Image
        src="/brand/aurora.webp"
        alt=""
        fill
        preload
        sizes="100vw"
        className="mk-aurora object-cover opacity-60"
      />
      <div className="absolute inset-0 bg-linear-to-b from-[#0a0612]/40 via-transparent to-[#0a0612]" />
      <div className="mk-spotlight absolute inset-0" />
      <div className="mk-grain absolute inset-0" />
    </div>
  );
}
