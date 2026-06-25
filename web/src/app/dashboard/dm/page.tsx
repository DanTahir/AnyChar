"use client";

import { useEffect, useState } from "react";

export default function DmPage() {
  const [characters, setCharacters] = useState<{ slug: string; displayName: string }[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((d) => setCharacters(d.characters ?? []));
  }, []);

  async function setDm(slug: string) {
    const res = await fetch("/api/dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    setMsg(res.ok ? "DM character set" : (await res.json()).error);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">DM character</h1>
      <p className="text-zinc-400">Choose which character the bot uses when you DM it.</p>
      {msg && <p className="text-sm text-zinc-400">{msg}</p>}
      <ul className="space-y-2">
        {characters.map((c) => (
          <li key={c.slug as string}>
            <button
              onClick={() => setDm(c.slug as string)}
              className="rounded border border-zinc-700 px-4 py-2 hover:border-indigo-500"
            >
              {c.displayName as string}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
