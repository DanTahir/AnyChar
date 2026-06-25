from __future__ import annotations

import discord

DISCORD_NICK_MAX = 32


def truncate_nickname(name: str) -> str:
    trimmed = name.strip()
    if len(trimmed) <= DISCORD_NICK_MAX:
        return trimmed
    return trimmed[:DISCORD_NICK_MAX]


def current_nick(member: discord.Member) -> str:
    return member.nick or member.display_name


async def sync_guild_nickname(guild: discord.Guild, display_name: str) -> None:
    me = guild.me
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
