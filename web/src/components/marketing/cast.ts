export type CastMember = {
  id: string;
  name: string;
  tagline: string;
  img: string;
};

/** Example characters (generated art in public/brand) used across the marketing pages. */
export const CAST: readonly CastMember[] = [
  {
    id: "vela",
    name: "Captain Vela",
    tagline: "Smuggler captain of the Wraith",
    img: "/brand/cast-vela.webp",
  },
  {
    id: "barnaby",
    name: "Sir Barnaby",
    tagline: "Knight of the realm. Also a cat.",
    img: "/brand/cast-barnaby.webp",
  },
  {
    id: "juniper",
    name: "Juniper",
    tagline: "Fox spirit, professional menace",
    img: "/brand/cast-juniper.webp",
  },
  {
    id: "bolt",
    name: "BOLT-7",
    tagline: "Barista, therapist, toaster",
    img: "/brand/cast-bolt.webp",
  },
  {
    id: "marr",
    name: "Ilse Marr",
    tagline: "Private eye, rain or shine",
    img: "/brand/cast-marr.webp",
  },
  {
    id: "moth",
    name: "Professor Moth",
    tagline: "Keeper of forgotten spells",
    img: "/brand/cast-moth.webp",
  },
];

export function castMember(id: string): CastMember {
  const member = CAST.find((c) => c.id === id);
  if (!member) throw new Error(`Unknown cast member: ${id}`);
  return member;
}
