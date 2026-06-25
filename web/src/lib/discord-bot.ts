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
