"use client";

import { useEffect, useState } from "react";

import { botInviteUrl } from "@/lib/config";

type Guild = { id: string; name: string; owner: boolean; permissions: string };

type PoolChar = {
  slug: string;
  displayName: string;
  ownerDiscordId?: string;
  sk?: string;
};

export default function ServersClient({
  guilds,
  linkedGuilds,
}: {
  guilds: Guild[];
  linkedGuilds: string[];
}) {
  const [pool, setPool] = useState<Record<string, PoolChar[]>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    guilds.forEach(async (g) => {
      const res = await fetch(`/api/guilds/${g.id}/characters`);
      if (res.ok) {
        const d = await res.json();
        setPool((p) => ({ ...p, [g.id]: d.characters ?? [] }));
      }
    });
  }, [guilds]);

  async function linkGuild(guildId: string) {
    await fetch("/api/guilds/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guildId }),
    });
    setMsg("Guild linked");
  }

  async function setActive(guildId: string, ownerId: string, slug: string) {
    const res = await fetch("/api/guilds/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guildId, ownerId, slug }),
    });
    setMsg(res.ok ? "Active character updated" : (await res.json()).error);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Servers</h1>
      <p className="text-sm text-zinc-400">
        <a href={botInviteUrl()} className="text-indigo-400 underline">
          Invite bot to Discord
        </a>
      </p>
      {msg && <p className="text-sm text-zinc-400">{msg}</p>}
      <ul className="space-y-4">
        {guilds.map((g) => (
          <li key={g.id} className="rounded border border-zinc-800 p-4">
            <div className="flex items-center justify-between">
              <span>{g.name}</span>
              <button onClick={() => linkGuild(g.id)} className="text-sm text-indigo-400">
                {linkedGuilds.includes(g.id) ? "Linked" : "Link to account"}
              </button>
            </div>
            {(pool[g.id] ?? []).length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {(pool[g.id] ?? []).map((c) => {
                  const ownerId =
                    c.ownerDiscordId ?? c.sk?.split("#CHAR#")[0]?.replace("USERID#", "") ?? "";
                  return (
                    <li key={`${ownerId}-${c.slug}`} className="flex justify-between">
                      <span>{c.displayName}</span>
                      <button
                        onClick={() => setActive(g.id, ownerId, c.slug as string)}
                        className="text-indigo-400"
                      >
                        Set active
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
