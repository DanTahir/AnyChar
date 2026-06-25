from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import discord

from dynamo import (
    delete_memory_item,
    get_character,
    get_guild_config,
    get_user,
    get_user_api_key,
    list_known_users,
    put_memory_item,
    query_memories,
    token_estimate,
)
from messages import get_thread_root
from openrouter_client import chat_completion


@dataclass
class RuntimeConfig:
    owner_discord_id: str
    character_slug: str
    character: dict[str, Any]
    known_users: list[dict[str, Any]]
    api_key: str
    server_id: str
    owner_user: dict[str, Any]


def resolve_runtime_config(message: discord.Message) -> RuntimeConfig | None:
    is_dm = isinstance(message.channel, discord.DMChannel)
    author_id = str(message.author.id)

    if is_dm:
        user = get_user(author_id)
        if not user or not user.get("approved"):
            return None
        slug = user.get("dmCharacterSlug") or user.get("dmCharacterName")
        if not slug:
            return None
        char = get_character(author_id, slug)
        if not char:
            return None
        return RuntimeConfig(
            owner_discord_id=author_id,
            character_slug=slug,
            character=char,
            known_users=list_known_users(author_id, slug),
            api_key=get_user_api_key(author_id),
            server_id="DM",
            owner_user=user,
        )

    if not message.guild:
        return None

    guild_cfg = get_guild_config(message.guild.id)
    if not guild_cfg:
        return None

    owner_id = guild_cfg.get("activeOwnerDiscordId")
    slug = guild_cfg.get("activeCharacterSlug")
    if not owner_id or not slug:
        return None

    owner = get_user(owner_id)
    if not owner or not owner.get("approved"):
        return None

    char = get_character(owner_id, slug)
    if not char:
        return None

    return RuntimeConfig(
        owner_discord_id=str(owner_id),
        character_slug=slug,
        character=char,
        known_users=list_known_users(owner_id, slug),
        api_key=get_user_api_key(owner_id),
        server_id=str(message.guild.id),
        owner_user=owner,
    )


def thread_storage_key(message: discord.Message, owner_id: str) -> str:
    is_dm = isinstance(message.channel, discord.DMChannel)
    if is_dm:
        return f"GUILDID#DM#{owner_id}"
    return f"GUILDID#{message.guild.id}"


def message_snowflake_time(message: discord.Message) -> int:
    return int(message.created_at.timestamp() * 1000)


def load_memories_for_prompt(
    owner_id: str,
    slug: str,
    server_id: str,
    chain_first: discord.Message,
) -> tuple[list[dict], list[dict]]:
    first_ts = message_snowflake_time(chain_first)
    lt_all = query_memories(owner_id, slug, server_id, "MEMORYLT#")
    st_all = query_memories(owner_id, slug, server_id, "MEMORY#")

    def before_chain(items: list[dict]) -> list[dict]:
        eligible = []
        for item in items:
            sk = item.get("sk", "")
            if "#MEMORYLT#" in sk:
                tail = sk.split("#MEMORYLT#")[1]
            elif "#MEMORY#" in sk:
                tail = sk.split("#MEMORY#")[1]
            else:
                continue
            mem_ts = int(tail.split("#")[0]) if tail else 0
            if mem_ts < first_ts:
                eligible.append(item)
        return eligible

    return before_chain(lt_all), before_chain(st_all)


async def create_short_term_memory(
    config: RuntimeConfig,
    thread_root: discord.Message,
    chain: list[discord.Message],
    current: discord.Message,
    bot_reply: str,
) -> None:
    owner_id = config.owner_discord_id
    slug = config.character_slug
    server_id = config.server_id

    lines = []
    for msg in chain + [current]:
        if msg.author.bot:
            continue
        nick = getattr(msg.author, "display_name", str(msg.author))
        lines.append(f"{nick} (user:{msg.author.id}): {msg.content or '[no text]'}")
    lines.append(f"Character reply: {bot_reply}")
    thread_text = "\n".join(lines)

    count = len(chain) + 2
    if count <= 3:
        instr = "Summarize this brief exchange in one or two sentences."
    elif count <= 20:
        instr = "Summarize this conversation in a short paragraph."
    else:
        instr = "Summarize this long conversation in a few paragraphs."

    summary = await chat_completion(
        api_key=config.api_key,
        owner_discord_id=owner_id,
        system="You write concise roleplay memory summaries.",
        user_content=f"{instr}\n\n{thread_text}",
        use_vision=False,
    )

    last_human = current.author
    for msg in reversed(chain + [current]):
        if not msg.author.bot:
            last_human = msg.author
            break

    participants = []
    seen: set[str] = set()
    for msg in chain + [current]:
        if msg.author.bot:
            continue
        uid = str(msg.author.id)
        if uid in seen:
            continue
        seen.add(uid)
        nick = getattr(msg.author, "display_name", str(msg.author))
        participants.append({"discordUserId": uid, "nickname": nick})

    root_ts = message_snowflake_time(thread_root)
    sk = (
        f"USERID#{owner_id}#CHAR#{slug}#SERVER#{server_id}"
        f"#MEMORY#{root_ts}#{thread_root.id}#{last_human.id}"
    )
    put_memory_item(
        {
            "pk": "USERS",
            "sk": sk,
            "content": summary,
            "tokenEstimate": token_estimate(summary),
            "participants": participants,
            "threadRootMessageId": str(thread_root.id),
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
    )
    await maybe_compact_short_term(config)
    await maybe_compact_long_term(config)


async def maybe_compact_short_term(config: RuntimeConfig) -> None:
    owner_id = config.owner_discord_id
    slug = config.character_slug
    server_id = config.server_id
    items = query_memories(owner_id, slug, server_id, "MEMORY#")
    total = sum(int(i.get("tokenEstimate") or 0) for i in items)
    if total <= 20000:
        return

    keep_tokens = 10000
    kept_count = 0
    to_summarize: list[dict] = []
    for item in reversed(items):
        est = int(item.get("tokenEstimate") or 0)
        if kept_count + est <= keep_tokens:
            kept_count += est
        else:
            to_summarize.insert(0, item)
    if not to_summarize:
        return

    combined = "\n\n".join(i.get("content", "") for i in to_summarize)
    summary = await chat_completion(
        api_key=config.api_key,
        owner_discord_id=owner_id,
        system="Summarize these roleplay memories into 2-3 paragraphs.",
        user_content=combined,
        use_vision=False,
    )
    earliest_ts = to_summarize[0]["sk"].split("#MEMORY#")[1].split("#")[0]
    sk = f"USERID#{owner_id}#CHAR#{slug}#SERVER#{server_id}#MEMORYLT#{earliest_ts}"
    put_memory_item(
        {
            "pk": "USERS",
            "sk": sk,
            "content": summary,
            "tokenEstimate": token_estimate(summary),
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
    )
    for item in to_summarize:
        delete_memory_item(item["pk"], item["sk"])
    await maybe_compact_long_term(config)


async def maybe_compact_long_term(config: RuntimeConfig) -> None:
    owner_id = config.owner_discord_id
    slug = config.character_slug
    server_id = config.server_id
    items = query_memories(owner_id, slug, server_id, "MEMORYLT#")
    total = sum(int(i.get("tokenEstimate") or 0) for i in items)
    if total <= 20000:
        return

    keep_tokens = 10000
    kept_count = 0
    to_summarize: list[dict] = []
    for item in reversed(items):
        est = int(item.get("tokenEstimate") or 0)
        if kept_count + est <= keep_tokens:
            kept_count += est
        else:
            to_summarize.insert(0, item)
    if not to_summarize:
        return

    combined = "\n\n".join(i.get("content", "") for i in to_summarize)
    summary = await chat_completion(
        api_key=config.api_key,
        owner_discord_id=owner_id,
        system="Summarize these archived memories into 2-3 paragraphs.",
        user_content=combined,
        use_vision=False,
    )
    earliest_ts = to_summarize[0]["sk"].split("#MEMORYLT#")[1].split("#")[0]
    sk = f"USERID#{owner_id}#CHAR#{slug}#SERVER#{server_id}#MEMORYLT#{earliest_ts}"
    put_memory_item(
        {
            "pk": "USERS",
            "sk": sk,
            "content": summary,
            "tokenEstimate": token_estimate(summary),
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
    )
    for item in to_summarize:
        delete_memory_item(item["pk"], item["sk"])
