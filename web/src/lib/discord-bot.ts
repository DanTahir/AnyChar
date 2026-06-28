import { config } from "./config";

const DISCORD_NICK_MAX = 32;

export function truncateNickname(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= DISCORD_NICK_MAX) return trimmed;
  return trimmed.slice(0, DISCORD_NICK_MAX);
}

/** Join character names with " & "; if too long for a Discord nickname, trim the
 * longest name by one char (min 1 each) until it fits. */
export function buildCombinedNickname(names: string[], separator = " & "): string {
  const parts = names.map((n) => n.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return truncateNickname(parts[0]);

  const sepTotal = separator.length * (parts.length - 1);
  const budget = DISCORD_NICK_MAX - sepTotal;
  if (budget < parts.length) return truncateNickname(parts.join(separator));

  const total = () => parts.reduce((sum, p) => sum + p.length, 0);
  while (total() > budget) {
    let longestIdx = 0;
    for (let i = 1; i < parts.length; i++) {
      if (parts[i].length > parts[longestIdx].length) longestIdx = i;
    }
    if (parts[longestIdx].length <= 1) break;
    parts[longestIdx] = parts[longestIdx].slice(0, -1);
  }
  return parts.join(separator);
}

/** Set the bot's nickname in a guild via Discord REST API. */
export async function syncBotGuildNickname(
  guildId: string,
  displayName: string,
): Promise<void> {
  const token = config.discordBotToken;
  if (!token) return;

  const nick = truncateNickname(displayName);
  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/@me`, {
    method: "PATCH",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ nick }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Discord nickname sync failed for guild ${guildId}: ${text}`);
  }
}

type UsernameCacheEntry = { name: string | null; expires: number };
const usernameCache = new Map<string, UsernameCacheEntry>();
const guildNameCache = new Map<string, UsernameCacheEntry>();
const USERNAME_TTL_MS = 60 * 60 * 1000;

/**
 * Resolve a Discord user's display name (global name, falling back to username)
 * via the bot token. The `GET /users/{id}` endpoint works for ANY user ID — the
 * user does not need to have logged into the site or share a guild with the bot.
 * Returns null on failure (missing token, invalid id, unknown user, rate limit).
 */
export async function fetchDiscordDisplayName(userId: string): Promise<string | null> {
  const token = config.discordBotToken;
  if (!token || !/^\d+$/.test(userId)) return null;

  const cached = usernameCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.name;

  let name: string | null = null;
  try {
    const res = await fetch(`https://discord.com/api/v10/users/${userId}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      const u = (await res.json()) as { username?: string; global_name?: string | null };
      name = u.global_name || u.username || null;
    } else {
      console.error(`Discord user lookup failed for ${userId}: ${res.status}`);
    }
  } catch (e) {
    console.error(`Discord user lookup error for ${userId}:`, e);
  }

  usernameCache.set(userId, { name, expires: Date.now() + USERNAME_TTL_MS });
  return name;
}

/** Resolve a Discord guild name via the bot token. Returns null on failure. */
export async function fetchGuildName(guildId: string): Promise<string | null> {
  const token = config.discordBotToken;
  if (!token || !/^\d+$/.test(guildId)) return null;

  const cached = guildNameCache.get(guildId);
  if (cached && cached.expires > Date.now()) return cached.name;

  let name: string | null = null;
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok) {
      const g = (await res.json()) as { name?: string };
      name = g.name ?? null;
    } else {
      console.error(`Discord guild lookup failed for ${guildId}: ${res.status}`);
    }
  } catch (e) {
    console.error(`Discord guild lookup error for ${guildId}:`, e);
  }

  guildNameCache.set(guildId, { name, expires: Date.now() + USERNAME_TTL_MS });
  return name;
}

/** Resolve display names for several user IDs at once → { [id]: name }. */
export async function fetchDiscordDisplayNames(
  userIds: string[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const out: Record<string, string> = {};
  await Promise.all(
    unique.map(async (id) => {
      const name = await fetchDiscordDisplayName(id);
      if (name) out[id] = name;
    }),
  );
  return out;
}
