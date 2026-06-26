import { config } from "./config";

const DISCORD_NICK_MAX = 32;

export function truncateNickname(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= DISCORD_NICK_MAX) return trimmed;
  return trimmed.slice(0, DISCORD_NICK_MAX);
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
