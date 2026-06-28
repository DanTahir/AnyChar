from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import discord

from dynamo import (
    delete_memory_item,
    get_character,
    get_guild_active_characters,
    get_guild_config,
    get_user,
    get_user_api_key,
    list_known_users,
    put_memory_item,
    query_memories,
    token_estimate,
)
from messages import get_thread_root, parse_character_prefix, texts_too_similar
from thread_images import format_image_descriptions
from openrouter_client import chat_completion


_MEMORY_LIMITS = {
    "short":  {"st_max": 5_000,  "st_keep": 2_500,  "lt_max": 5_000,  "lt_keep": 2_500},
    "medium": {"st_max": 10_000, "st_keep": 5_000,  "lt_max": 10_000, "lt_keep": 5_000},
    "long":   {"st_max": 20_000, "st_keep": 10_000, "lt_max": 20_000, "lt_keep": 10_000},
}


def get_memory_limits(config: "RuntimeConfig") -> dict:
    level = (config.character.get("memoryLevel") or "medium").lower()
    return _MEMORY_LIMITS.get(level, _MEMORY_LIMITS["medium"])


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

    configs = resolve_runtime_configs(message)
    return configs[0] if configs else None


def _build_guild_config(
    owner_id: str, slug: str, server_id: str
) -> RuntimeConfig | None:
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
        server_id=server_id,
        owner_user=owner,
    )


def resolve_runtime_configs(message: discord.Message) -> list[RuntimeConfig]:
    """Resolve the ordered list of active character configs for this message.

    DMs always resolve to a single character. Guilds may have up to 3 ordered
    active characters that respond in sequence.
    """
    is_dm = isinstance(message.channel, discord.DMChannel)
    if is_dm:
        single = resolve_runtime_config(message)
        return [single] if single else []

    if not message.guild:
        return []

    guild_cfg = get_guild_config(message.guild.id)
    if not guild_cfg:
        return []

    server_id = str(message.guild.id)
    configs: list[RuntimeConfig] = []
    seen: set[str] = set()
    for entry in get_guild_active_characters(guild_cfg):
        owner_id = entry.get("ownerDiscordId")
        slug = entry.get("slug")
        if not owner_id or not slug:
            continue
        key = f"{owner_id}:{slug}"
        if key in seen:
            continue
        seen.add(key)
        cfg = _build_guild_config(str(owner_id), str(slug), server_id)
        if cfg:
            configs.append(cfg)
    return configs


def thread_storage_key(message: discord.Message, owner_id: str) -> str:
    is_dm = isinstance(message.channel, discord.DMChannel)
    if is_dm:
        return f"GUILDID#DM#{owner_id}"
    return f"GUILDID#{message.guild.id}"


def message_snowflake_time(message: discord.Message) -> int:
    return int(message.created_at.timestamp() * 1000)


def _memory_thread_root_id(item: dict[str, Any]) -> str | None:
    mem_root = item.get("threadRootMessageId")
    if mem_root is not None:
        return str(mem_root)
    sk = item.get("sk", "")
    if "#MEMORY#" not in sk:
        return None
    parts = sk.split("#MEMORY#", 1)[1].split("#")
    return parts[1] if len(parts) >= 2 else None


def _memory_timestamp(item: dict[str, Any]) -> int | None:
    sk = item.get("sk", "")
    if "#MEMORYLT#" in sk:
        tail = sk.split("#MEMORYLT#", 1)[1]
        return int(tail.split("#")[0]) if tail else None
    if "#MEMORY#" in sk:
        tail = sk.split("#MEMORY#", 1)[1]
        return int(tail.split("#")[0]) if tail else None
    return None


def load_memories_for_prompt(
    owner_id: str,
    slug: str,
    server_id: str,
    thread_root: discord.Message,
    current_message: discord.Message,
) -> tuple[list[dict], list[dict]]:
    # Include every memory created before the conversation we're answering in.
    # The reference point is the chain root (thread_root); for a brand-new @mention
    # that root is the message itself, so all prior memories qualify.
    # All timestamps use the same created_at-based basis as stored memories
    # (see root_ts = message_snowflake_time(thread_root) in create_short_term_memory).
    first_ts = message_snowflake_time(thread_root)
    current_root_id = str(thread_root.id)
    lt_all = query_memories(owner_id, slug, server_id, "MEMORYLT#")
    st_all = query_memories(owner_id, slug, server_id, "MEMORY#")

    def for_prompt(items: list[dict]) -> list[dict]:
        result = []
        for item in items:
            # Skip the memory for the conversation currently in progress; its
            # content is already provided live via the reply chain.
            if _memory_thread_root_id(item) == current_root_id:
                continue
            mem_ts = _memory_timestamp(item)
            if mem_ts is None or mem_ts >= first_ts:
                continue
            result.append(item)
        return result

    lt = for_prompt(lt_all)
    st = for_prompt(st_all)
    print(
        f"[MEM] owner={owner_id} slug={slug} server={server_id} "
        f"msg={current_message.id} included lt={len(lt)} st={len(st)} "
        f"(queried lt={len(lt_all)} st={len(st_all)})"
    )
    return lt, st


async def create_short_term_memory(
    config: RuntimeConfig,
    thread_root: discord.Message,
    chain: list[discord.Message],
    current: discord.Message,
    bot_reply: str,
    image_descriptions: dict[int, list[str]] | None = None,
) -> None:
    owner_id = config.owner_discord_id
    slug = config.character_slug
    server_id = config.server_id

    char_name = (
        config.character.get("displayName")
        or config.character.get("slug")
        or "the character"
    )

    lines = []
    for msg in chain + [current]:
        if msg.author.bot:
            other_name, body = parse_character_prefix(msg.content)
            if other_name:
                lines.append(
                    f"{other_name} (a character, not a user): {body or '[no text]'}"
                )
            continue
        nick = getattr(msg.author, "display_name", str(msg.author))
        text = msg.content or "[no text]"
        descs = (image_descriptions or {}).get(msg.id)
        if descs:
            text += format_image_descriptions(descs)
        lines.append(f"{nick} (user:{msg.author.id}): {text}")
    lines.append(f"{char_name} (the character, not a user): {bot_reply}")
    thread_text = "\n".join(lines)

    count = len(chain) + 2
    if count <= 3:
        length = "one or two sentences"
    elif count <= 20:
        length = "a short paragraph"
    else:
        length = "a few paragraphs"
    instr = (
        f"Summarize this roleplay exchange in {length}. The character is named {char_name}; "
        f"refer to {char_name} by name and never assign {char_name} a user ID. Only the human "
        "participants have user IDs (shown as 'user:<id>'); keep each person's name and ID "
        "matched correctly and never merge two different people into one. Preserve concrete "
        "facts so they can be recalled later: who said and did what, by name; specific "
        "actions, positions, and states (e.g. someone kneeling, lights turned on, an item "
        "given); and any requests, promises, or decisions. Write it factually in the past "
        "tense. Do not invent details."
    )

    summary = await chat_completion(
        api_key=config.api_key,
        owner_discord_id=owner_id,
        system=(
            "You write factual roleplay memory summaries that preserve concrete details. "
            f"The character being roleplayed is {char_name} and is never a Discord user."
        ),
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

    print(
        f"[MEM create] owner={owner_id} slug={slug} server={server_id} "
        f"thread_root={thread_root.id} last_human={last_human.id} "
        f"summary_len={len(summary or '')}"
    )
    root_ts = message_snowflake_time(thread_root)
    sk = (
        f"USERID#{owner_id}#CHAR#{slug}#SERVER#{server_id}"
        f"#MEMORY#{root_ts}#{thread_root.id}#{last_human.id}"
    )

    # De-dupe: don't pile on a memory that is near-identical to the most recent
    # *other* memory. Re-summarizing the same stuck scene into 20+ near-duplicate
    # memories is what let the old loop snowball. Updating this thread's own
    # memory (same sk) as the conversation grows is always allowed.
    existing = query_memories(owner_id, slug, server_id, "MEMORY#")
    prior_distinct = [m for m in existing if m.get("sk") != sk]
    if summary and prior_distinct and texts_too_similar(
        prior_distinct[-1].get("content", ""), summary
    ):
        print(
            f"[MEM skip dup] owner={owner_id} slug={slug} server={server_id} "
            f"thread_root={thread_root.id} (near-identical to previous memory)"
        )
        return

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
    limits = get_memory_limits(config)
    items = query_memories(owner_id, slug, server_id, "MEMORY#")
    total = sum(int(i.get("tokenEstimate") or 0) for i in items)
    if total <= limits["st_max"]:
        return

    keep_tokens = limits["st_keep"]
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
    limits = get_memory_limits(config)
    items = query_memories(owner_id, slug, server_id, "MEMORYLT#")
    total = sum(int(i.get("tokenEstimate") or 0) for i in items)
    if total <= limits["lt_max"]:
        return

    keep_tokens = limits["lt_keep"]
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
