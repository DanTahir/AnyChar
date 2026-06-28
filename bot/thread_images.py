from __future__ import annotations

import discord

from appearance import describe_discord_message_images
from discord_images import fetch_message_image_data_urls, message_has_images
from dynamo import get_message_image_index, put_message_image_index


def _walk_chain(
    current: discord.Message, chain: list[discord.Message]
) -> list[discord.Message]:
    return [current] + list(reversed(chain))


def find_messages_to_index(
    current: discord.Message,
    chain: list[discord.Message],
    guild_or_dm_key: str,
) -> list[discord.Message]:
    """Return up to two messages needing vision indexing (current + backfill)."""
    to_index: list[discord.Message] = []
    backfill: discord.Message | None = None

    for msg in _walk_chain(current, chain):
        if get_message_image_index(guild_or_dm_key, msg.id):
            break
        if not message_has_images(msg):
            continue
        if msg.id == current.id:
            to_index.append(msg)
        elif backfill is None:
            backfill = msg

    if backfill and (not to_index or backfill.id != to_index[0].id):
        to_index.append(backfill)
    return to_index


async def index_message_images(
    message: discord.Message,
    *,
    guild_or_dm_key: str,
    api_key: str,
    owner_discord_id: str,
) -> None:
    if get_message_image_index(guild_or_dm_key, message.id):
        return
    data_urls = await fetch_message_image_data_urls(message)
    if not data_urls:
        return
    descriptions = await describe_discord_message_images(
        api_key=api_key,
        owner_discord_id=owner_discord_id,
        data_urls=data_urls,
    )
    put_message_image_index(
        guild_or_dm_key,
        message.id,
        descriptions=descriptions,
        channel_id=str(message.channel.id),
        image_count=len(data_urls),
        indexed_by_owner_id=owner_discord_id,
    )


async def index_thread_images(
    current: discord.Message,
    chain: list[discord.Message],
    *,
    guild_or_dm_key: str,
    api_key: str,
    owner_discord_id: str,
) -> None:
    for msg in find_messages_to_index(current, chain, guild_or_dm_key):
        await index_message_images(
            msg,
            guild_or_dm_key=guild_or_dm_key,
            api_key=api_key,
            owner_discord_id=owner_discord_id,
        )


def load_image_descriptions(
    guild_or_dm_key: str,
    messages: list[discord.Message],
) -> dict[int, list[str]]:
    result: dict[int, list[str]] = {}
    for msg in messages:
        item = get_message_image_index(guild_or_dm_key, msg.id)
        if item and item.get("descriptions"):
            result[msg.id] = list(item["descriptions"])
    return result


def format_image_descriptions(descriptions: list[str]) -> str:
    if not descriptions:
        return ""
    if len(descriptions) == 1:
        return f" [Image: {descriptions[0]}]"
    parts = [f"[Image {i}: {d}]" for i, d in enumerate(descriptions, start=1) if d]
    return " " + " ".join(parts) if parts else ""
