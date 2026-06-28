"use client";

import { useEffect, useState } from "react";

type Guild = { id: string; name: string; owner: boolean; permissions: string };

type PoolChar = {
  slug: string;
  displayName: string;
  ownerDiscordId?: string;
  sk?: string;
};

type ActiveChar = { ownerDiscordId: string; slug: string; displayName: string };

const SLOT_LABELS = ["Main (replies first)", "Second", "Third"];
const NICK_MAX = 32;

function charKey(ownerId: string, slug: string) {
  return `${ownerId}:${slug}`;
}

function poolOwnerId(c: PoolChar) {
  return c.ownerDiscordId ?? c.sk?.split("#CHAR#")[0]?.replace("USERID#", "") ?? "";
}

/** Mirror of the bot/web combined-nickname rule for a live preview. */
function combinedNickname(names: string[]): string {
  const parts = names.map((n) => n.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, NICK_MAX);
  const sep = " & ";
  const budget = NICK_MAX - sep.length * (parts.length - 1);
  if (budget < parts.length) return parts.join(sep).slice(0, NICK_MAX);
  const total = () => parts.reduce((s, p) => s + p.length, 0);
  while (total() > budget) {
    let li = 0;
    for (let i = 1; i < parts.length; i++) {
      if (parts[i].length > parts[li].length) li = i;
    }
    if (parts[li].length <= 1) break;
    parts[li] = parts[li].slice(0, -1);
  }
  return parts.join(sep);
}

export default function ServersClient({
  guilds,
  linkedGuilds,
  botInviteUrl,
}: {
  guilds: Guild[];
  linkedGuilds: string[];
  botInviteUrl: string;
}) {
  const [pool, setPool] = useState<Record<string, PoolChar[]>>({});
  const [slots, setSlots] = useState<Record<string, [string, string, string]>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    guilds.forEach(async (g) => {
      const res = await fetch(`/api/guilds/${g.id}/characters`);
      if (!res.ok) return;
      const d = (await res.json()) as { characters?: PoolChar[]; active?: ActiveChar[] };
      setPool((p) => ({ ...p, [g.id]: d.characters ?? [] }));
      const active = d.active ?? [];
      setSlots((s) => ({
        ...s,
        [g.id]: [0, 1, 2].map((i) =>
          active[i] ? charKey(active[i].ownerDiscordId, active[i].slug) : "",
        ) as [string, string, string],
      }));
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

  async function saveSlots(guildId: string, next: [string, string, string]) {
    setSlots((s) => ({ ...s, [guildId]: next }));

    // Gather non-empty selections in order, de-duped.
    const seen = new Set<string>();
    const characters = next
      .filter(Boolean)
      .filter((key) => {
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((key) => {
        const [ownerId, ...rest] = key.split(":");
        return { ownerId, slug: rest.join(":") };
      });

    const res = await fetch("/api/guilds/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guildId, characters }),
    });
    setMsg(res.ok ? "Active characters updated" : (await res.json()).error);
  }

  function nicknamePreview(guildId: string): string {
    const chars = pool[guildId] ?? [];
    const byKey = new Map(chars.map((c) => [charKey(poolOwnerId(c), c.slug), c.displayName]));
    const seen = new Set<string>();
    const names = (slots[guildId] ?? ["", "", ""])
      .filter(Boolean)
      .filter((k) => (seen.has(k) ? false : (seen.add(k), true)))
      .map((k) => byKey.get(k) ?? "")
      .filter(Boolean);
    return combinedNickname(names);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Servers</h1>
      <p className="text-sm text-purple-300/70">
        <a href={botInviteUrl} className="link-accent">
          Invite bot to Discord
        </a>
      </p>
      {msg && <p className="text-sm text-purple-300/70">{msg}</p>}
      <ul className="space-y-4">
        {guilds.map((g) => {
          const chars = pool[g.id] ?? [];
          const slot = slots[g.id] ?? ["", "", ""];
          const preview = nicknamePreview(g.id);
          return (
            <li key={g.id} className="card p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{g.name}</span>
                <button onClick={() => linkGuild(g.id)} className="link-accent text-sm">
                  {linkedGuilds.includes(g.id) ? "Linked" : "Link to account"}
                </button>
              </div>

              {chars.length === 0 ? (
                <p className="mt-3 text-sm text-purple-300/60">
                  No characters available yet. Link this server, then create characters.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  <p className="text-xs uppercase tracking-wide text-purple-300/50">
                    Active characters (reply in order)
                  </p>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <label className="w-40 shrink-0 text-sm text-purple-300/70">
                        {SLOT_LABELS[i]}
                      </label>
                      <select
                        className="flex-1 rounded-md border border-purple-500/30 bg-purple-950/40 px-2 py-1 text-sm"
                        value={slot[i]}
                        onChange={(e) => {
                          const next = [...slot] as [string, string, string];
                          next[i] = e.target.value;
                          saveSlots(g.id, next);
                        }}
                      >
                        <option value="">— None —</option>
                        {chars.map((c) => {
                          const key = charKey(poolOwnerId(c), c.slug);
                          return (
                            <option key={key} value={key}>
                              {c.displayName}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  ))}
                  {preview && (
                    <p className="text-xs text-purple-300/50">
                      Bot nickname: <span className="text-purple-200">{preview}</span>
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
