from __future__ import annotations

import discord

DISCORD_NICK_MAX = 32


def truncate_nickname(name: str) -> str:
    trimmed = name.strip()
    if len(trimmed) <= DISCORD_NICK_MAX:
        return trimmed
    return trimmed[:DISCORD_NICK_MAX]


def build_combined_nickname(names: list[str], *, separator: str = " & ") -> str:
    """Join character names with ``separator``; if too long for a Discord nickname,
    repeatedly trim the longest name by one char (min 1 each) until it fits."""
    parts = [n.strip() for n in names if n and n.strip()]
    if not parts:
        return ""
    if len(parts) == 1:
        return truncate_nickname(parts[0])

    sep_total = len(separator) * (len(parts) - 1)
    budget = DISCORD_NICK_MAX - sep_total
    # Each name must keep at least 1 char; if even that can't fit, hard truncate.
    if budget < len(parts):
        return truncate_nickname(separator.join(parts))

    while sum(len(p) for p in parts) > budget:
        longest_idx = max(range(len(parts)), key=lambda i: len(parts[i]))
        if len(parts[longest_idx]) <= 1:
            break
        parts[longest_idx] = parts[longest_idx][:-1]
    return separator.join(parts)


def current_nick(member: discord.Member) -> str:
    return member.nick or member.display_name


async def sync_guild_nickname(
    guild: discord.Guild,
    display_name: str,
    *,
    bot_id: int | None = None,
) -> None:
    me = guild.me
    if me is None and bot_id is not None:
        try:
            me = await guild.fetch_member(bot_id)
        except discord.HTTPException as exc:
            print(f"Could not fetch bot member in guild {guild.id}: {exc}")
            return
    if me is None:
        return

    nick = truncate_nickname(display_name)
    if current_nick(me) == nick:
        return

    try:
        await me.edit(nick=nick)
    except discord.Forbidden:
        print(
            f"No permission to change nickname in guild {guild.id} "
            "(re-invite bot with Change Nickname permission)"
        )
    except discord.HTTPException as exc:
        print(f"Failed to set nickname in guild {guild.id}: {exc}")
