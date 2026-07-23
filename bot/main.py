# This code is based on the following example:
# https://discordpy.readthedocs.io/en/stable/quickstart.html#a-minimal-bot
from __future__ import annotations

import asyncio
import io

import discord
from discord import app_commands

import conversation_cache
from config import SITE_URL, THREAD_MESSAGE_LIMIT, TOKEN
from guild_nickname import build_combined_nickname, sync_guild_nickname
from appearance import ensure_character_appearance, ensure_known_user_appearance
from dynamo import (
    find_character_by_display_name,
    get_character,
    get_guild_active_characters,
    get_guild_config,
    get_user,
    increment_thread_count,
    link_guild_to_user,
    list_server_characters,
    set_guild_active_characters,
)
from messages import (
    HistItem,
    build_thread_prompt,
    fetch_message,
    fetch_reply_chain,
    get_thread_root,
    hist_chain_from_messages,
    last_bot_message_text,
    send_chained_replies,
    single_message_prompt,
    texts_too_similar,
)
from openrouter_client import OpenRouterAPIError, RateLimitError, chat_completion
from prompt_builder import (
    area_context_line,
    build_system_prompt,
)
from runtime import (
    RuntimeConfig,
    create_short_term_memory,
    load_memories_for_prompt,
    resolve_runtime_configs,
    snowflake_time_ms,
    thread_storage_key,
)
from s3_images import fetch_image_bytes
from thread_images import index_thread_images, load_image_descriptions
from usage import budget_exceeded_message, is_over_budget

intents = discord.Intents.default()
intents.message_content = True


class AnyCharClient(discord.Client):
    def __init__(self) -> None:
        super().__init__(intents=intents)
        self.tree = app_commands.CommandTree(self)

    async def setup_hook(self) -> None:
        synced = await self.tree.sync()
        print(f"Synced {len(synced)} global command(s)")
        asyncio.create_task(conversation_cache.cleanup_loop())


client = AnyCharClient()


def can_manage_guild(interaction: discord.Interaction) -> bool:
    if not interaction.guild or not isinstance(interaction.user, discord.Member):
        return False
    return interaction.user.guild_permissions.manage_guild or interaction.user.id == interaction.guild.owner_id


async def ensure_user_approved(interaction: discord.Interaction) -> bool:
    user = get_user(interaction.user.id)
    if not user or not user.get("approved"):
        await interaction.response.send_message(
            f"You must be an approved user. Sign in at {SITE_URL}",
            ephemeral=True,
        )
        return False
    return True


@client.tree.command(name="help", description="Link to the AnyChar dashboard")
async def help_cmd(interaction: discord.Interaction):
    await interaction.response.send_message(
        f"Manage characters and servers at {SITE_URL}",
        ephemeral=True,
    )


@client.tree.command(name="character", description="Show the active character(s) for this server")
async def character_cmd(interaction: discord.Interaction):
    if not interaction.guild:
        await interaction.response.send_message("Use this in a server.", ephemeral=True)
        return
    cfg = get_guild_config(interaction.guild.id)
    actives = get_guild_active_characters(cfg)
    if not actives:
        await interaction.response.send_message(
            f"No character configured. Use /setcharacter or visit {SITE_URL}",
            ephemeral=True,
        )
        return
    if len(actives) == 1:
        a = actives[0]
        await interaction.response.send_message(
            f"Active character: **{a['displayName']}** (owner user ID: {a['ownerDiscordId']})",
            ephemeral=True,
        )
        return
    ordinals = ["First", "Second", "Third"]
    lines = [
        f"{ordinals[i] if i < len(ordinals) else f'#{i + 1}'}: "
        f"**{a['displayName']}** (owner user ID: {a['ownerDiscordId']})"
        for i, a in enumerate(actives)
    ]
    await interaction.response.send_message(
        "Active characters (reply in order):\n" + "\n".join(lines),
        ephemeral=True,
    )


@client.tree.command(name="listcharacters", description="List valid characters for this server")
async def listcharacters_cmd(interaction: discord.Interaction):
    if not interaction.guild:
        await interaction.response.send_message("Use this in a server.", ephemeral=True)
        return
    chars = list_server_characters(interaction.guild.id)
    if not chars:
        await interaction.response.send_message(
            f"No characters linked yet. Visit {SITE_URL} to link this server.",
            ephemeral=True,
        )
        return
    names = sorted({c.get("displayName") or c.get("slug", "?") for c in chars})
    await interaction.response.send_message(
        "Valid characters:\n" + "\n".join(f"- {n}" for n in names),
        ephemeral=True,
    )


def parse_character_names(raw: str, *, max_names: int = 3) -> list[str]:
    """Split a "/setcharacter" argument on unescaped ``&`` separators.

    ``\\&`` is treated as a literal ``&`` inside a name. Empty segments are
    dropped and the result is capped at ``max_names`` entries.

    Example: ``Julie \\& Annie & Jenny`` -> ``["Julie & Annie", "Jenny"]``.
    """
    names: list[str] = []
    current: list[str] = []
    i = 0
    while i < len(raw):
        ch = raw[i]
        if ch == "\\" and i + 1 < len(raw) and raw[i + 1] == "&":
            current.append("&")
            i += 2
            continue
        if ch == "&":
            names.append("".join(current))
            current = []
            i += 1
            continue
        current.append(ch)
        i += 1
    names.append("".join(current))
    cleaned = [n.strip() for n in names if n.strip()]
    return cleaned[:max_names]


@client.tree.command(name="setcharacter", description="Set the active character(s) for this server")
@app_commands.describe(name="Character name, or up to 3 joined with & (escape a literal & as \\&)")
async def setcharacter_cmd(interaction: discord.Interaction, name: str):
    if not interaction.guild:
        await interaction.response.send_message("Use this in a server.", ephemeral=True)
        return
    if not await ensure_user_approved(interaction):
        return
    if not can_manage_guild(interaction):
        await interaction.response.send_message(
            "You need Manage Server permission.", ephemeral=True
        )
        return

    requested = parse_character_names(name)
    if not requested:
        await interaction.response.send_message(
            "Provide at least one character name.", ephemeral=True
        )
        return

    resolved: list[dict] = []
    missing: list[str] = []
    for req in requested:
        char = find_character_by_display_name(interaction.guild.id, req)
        if not char:
            missing.append(req)
            continue
        owner_id = char.get("ownerDiscordId") or char["sk"].split("#CHAR#")[0].replace(
            "USERID#", ""
        )
        slug = char.get("slug") or char["sk"].split("#CHAR#")[-1]
        display = char.get("displayName") or slug
        resolved.append(
            {"ownerDiscordId": str(owner_id), "slug": slug, "displayName": display}
        )

    if missing:
        joined = ", ".join(f"'{m}'" for m in missing)
        await interaction.response.send_message(
            f"Character(s) not found: {joined}. Use /listcharacters.",
            ephemeral=True,
        )
        return

    link_guild_to_user(interaction.user.id, interaction.guild.id)
    set_guild_active_characters(interaction.guild.id, resolved, interaction.user.id)

    displays = [c["displayName"] for c in resolved]
    await sync_guild_nickname(
        interaction.guild, build_combined_nickname(displays), bot_id=client.user.id
    )
    if len(displays) == 1:
        await interaction.response.send_message(
            f"Active character set to **{displays[0]}**.", ephemeral=True
        )
    else:
        joined = " & ".join(f"**{d}**" for d in displays)
        await interaction.response.send_message(
            f"Active characters set (reply in order): {joined}.", ephemeral=True
        )


@client.tree.command(name="describecharacter", description="Show a character's description and image")
@app_commands.describe(name="Character display name")
async def describecharacter_cmd(interaction: discord.Interaction, name: str):
    if not interaction.guild:
        await interaction.response.send_message("Use this in a server.", ephemeral=True)
        return

    char = find_character_by_display_name(interaction.guild.id, name)
    if not char:
        await interaction.response.send_message(
            f"Character '{name}' not found.", ephemeral=True
        )
        return

    description = char.get("description") or "(no description)"
    display = char.get("displayName") or char.get("slug", name)
    s3_key = char.get("imageS3Key")

    if s3_key:
        img = fetch_image_bytes(s3_key)
        if img:
            body, _ = img
            file = discord.File(io.BytesIO(body), filename="character.png")
            await interaction.response.send_message(
                f"**{display}**\n\n{description}",
                file=file,
            )
            return

    await interaction.response.send_message(f"**{display}**\n\n{description}")


@client.event
async def on_ready():
    print(f"Logged in as {client.user}")


@client.event
async def on_guild_join(guild: discord.Guild):
    print(f"Joined guild {guild.id} ({guild.name})")
    cfg = get_guild_config(guild.id)
    actives = get_guild_active_characters(cfg)
    if actives:
        displays: list[str] = []
        for a in actives:
            char = get_character(a["ownerDiscordId"], a["slug"])
            displays.append((char.get("displayName") if char else None) or a["displayName"])
        combined = build_combined_nickname(displays)
        if combined:
            await sync_guild_nickname(guild, combined, bot_id=client.user.id)
    channel = guild.system_channel
    if channel:
        try:
            await channel.send(
                f"Thanks for adding AnyChar! Link your account and set a character at {SITE_URL} "
                "or use `/setcharacter`."
            )
        except discord.Forbidden:
            pass


async def is_reply_to_bot(message: discord.Message) -> bool:
    if not message.reference or not message.reference.message_id:
        return False
    if conversation_cache.is_known_bot_message(message.reference.message_id):
        return True
    parent = await fetch_message(message.channel, message.reference.message_id, message.reference)
    return parent is not None and parent.author == client.user


def _char_display(config: RuntimeConfig) -> str:
    return (
        config.character.get("displayName")
        or config.character.get("slug")
        or "Character"
    )


async def generate_reply(
    message: discord.Message,
    config: RuntimeConfig,
    root_id: int,
    root_created_at_ms: int,
    all_configs: list[RuntimeConfig] | None = None,
    index: int = 0,
    *,
    chain: list[HistItem] | None = None,
    image_descriptions: dict[int, list[str]] | None = None,
) -> str:
    if is_over_budget(config.owner_user):
        return budget_exceeded_message()

    all_configs = all_configs or [config]
    other_configs = [c for j, c in enumerate(all_configs) if j != index]
    names = [_char_display(c) for c in all_configs]

    chain = chain if chain is not None else (
        hist_chain_from_messages(await fetch_reply_chain(message), client.user)
        if message.reference
        else []
    )
    lt, st = load_memories_for_prompt(
        config.owner_discord_id,
        config.character_slug,
        config.server_id,
        root_id,
        root_created_at_ms,
        message.id,
    )

    character = await ensure_character_appearance(
        config.character, config.owner_discord_id, config.api_key
    )
    known_users = list(config.known_users)
    for i, ku in enumerate(known_users):
        known_users[i] = await ensure_known_user_appearance(
            ku, config.owner_discord_id, config.character_slug, config.api_key
        )

    owner_age18plus = bool(config.owner_user.get("age18plus"))
    other_characters = []
    for c in other_configs:
        oc = await ensure_character_appearance(
            c.character, c.owner_discord_id, c.api_key
        )
        other_characters.append(
            {
                "name": _char_display(c),
                "description": oc.get("description") or "",
                "appearance": oc.get("appearance") or "",
            }
        )
    area_context = area_context_line(names, index) if len(all_configs) > 1 else None
    system = build_system_prompt(
        character,
        known_users,
        lt,
        st,
        owner_age18plus,
        has_live_conversation=bool(chain),
        other_characters=other_characters or None,
        area_context=area_context,
    )
    char_name = _char_display(config)

    img_desc = image_descriptions or {}
    if chain:
        text = build_thread_prompt(
            chain,
            message,
            client.user,
            char_name,
            known_users,
            img_desc,
        )
    else:
        text = single_message_prompt(message, client.user, known_users, img_desc)

    # Pin this Discord thread/character to a single OpenRouter provider so
    # prompt caches stay warm across turns (see OpenRouter's provider sticky
    # routing docs). Deterministic — no DB write needed.
    session_id = (
        f"anychar:{config.owner_discord_id}:{config.character_slug}:{root_id}"
    )

    reply = await chat_completion(
        api_key=config.api_key,
        owner_discord_id=config.owner_discord_id,
        system=system,
        user_content=text,
        use_vision=False,
        session_id=session_id,
    )

    # Self-repetition guard: if the model echoed its previous reply in this thread
    # almost verbatim, regenerate once with an explicit do-not-repeat instruction.
    prev_bot_text = last_bot_message_text(chain, character_name=char_name)
    if prev_bot_text and texts_too_similar(prev_bot_text, reply):
        nudge_text = (
            "Your reply was almost identical to your previous message in this conversation. "
            "Do not repeat yourself or restate the same request. Respond to what was just "
            "said, take a clearly different action, and move the scene forward."
        )
        retry_content = f"{text}\n\n{nudge_text}"
        reply = await chat_completion(
            api_key=config.api_key,
            owner_discord_id=config.owner_discord_id,
            system=system,
            user_content=retry_content,
            use_vision=False,
            session_id=session_id,
        )

    return reply


@client.event
async def on_message(message: discord.Message):
    if message.author == client.user:
        return

    mentioned = client.user in message.mentions
    reply_to_bot = await is_reply_to_bot(message)

    if not mentioned and not reply_to_bot:
        return

    configs = resolve_runtime_configs(message)
    if not configs:
        await message.channel.send(
            f"This server or DM is not configured yet. Visit {SITE_URL} to set up."
        )
        return

    multi = len(configs) > 1

    if message.guild:
        combined = build_combined_nickname([_char_display(c) for c in configs])
        if combined:
            await sync_guild_nickname(message.guild, combined, bot_id=client.user.id)

    try:
        storage_key = thread_storage_key(message, configs[0].owner_discord_id)
        is_dm = isinstance(message.channel, discord.DMChannel)
        context_id = (
            conversation_cache.context_key_for_dm(configs[0].owner_discord_id)
            if is_dm
            else conversation_cache.context_key_for_guild(message.guild.id)
        )

        first = configs[0]
        chain: list[HistItem] | None = None
        root_id: int
        is_fresh_tree: bool

        # Try the cache first: if the message being replied to is a known node
        # in an S3-backed tree we've already recorded, skip the live Discord
        # walk-back entirely.
        if message.reference and message.reference.message_id:
            cache_hit = conversation_cache.lookup(message.reference.message_id)
            # Defensive check: only trust the cache hit if it's scoped to THIS
            # guild/DM context. Discord message ids are globally unique so
            # this should never actually mismatch, but a mismatch would mean
            # an indexing bug elsewhere — safer to fall back to a live walk
            # than to render another guild/DM's conversation into this one.
            if cache_hit and cache_hit[0] == context_id:
                hit_context_id, hit_root_id = cache_hit
                tree = await conversation_cache.load_tree(hit_context_id, hit_root_id)
                built = (
                    conversation_cache.build_chain_from_tree(
                        tree, message.reference.message_id
                    )
                    if tree
                    else None
                )
                if built is not None:
                    chain = built
                    root_id = hit_root_id
                    is_fresh_tree = False

        if chain is None:
            # Cache miss, expired tree, or a brand-new @mention with no reply
            # reference at all — fall back to the live Discord walk-back and
            # (re)build this tree fresh (overwrites any stale S3 file).
            if message.reference and message.reference.message_id:
                root_msg = await get_thread_root(message)
                root_id = root_msg.id
                legacy_chain = await fetch_reply_chain(message)
            else:
                root_id = message.id
                legacy_chain = []
            is_fresh_tree = True

            if first.api_key:
                try:
                    await index_thread_images(
                        message,
                        legacy_chain,
                        guild_or_dm_key=storage_key,
                        api_key=first.api_key,
                        owner_discord_id=first.owner_discord_id,
                    )
                except Exception as e:
                    import traceback

                    print(f"Thread image indexing error: {e!r}")
                    traceback.print_exc()

            legacy_img_desc = load_image_descriptions(
                storage_key, legacy_chain + [message]
            )
            chain = hist_chain_from_messages(legacy_chain, client.user, legacy_img_desc)
            current_img_desc = legacy_img_desc
        else:
            # Cache hit — ancestors already have their bodies/descriptions
            # baked in from when they were first cached; only the just-arrived
            # message might have new, not-yet-indexed images.
            if first.api_key:
                try:
                    await index_thread_images(
                        message,
                        [],
                        guild_or_dm_key=storage_key,
                        api_key=first.api_key,
                        owner_discord_id=first.owner_discord_id,
                    )
                except Exception as e:
                    import traceback

                    print(f"Thread image indexing error: {e!r}")
                    traceback.print_exc()
            current_img_desc = load_image_descriptions(storage_key, [message])

        root_created_at_ms = snowflake_time_ms(root_id)

        user_item = HistItem.from_message(message, client.user, current_img_desc)
        chain_so_far = list(chain)
        pending_target_item = user_item
        turn_items: list[HistItem] = list(chain) if is_fresh_tree else []
        replied_any = False

        # Each character replies in order: the first to the user, each next one to
        # the character that just spoke, forming a single linear reply chain.
        target = message
        for index, config in enumerate(configs):
            if index > 0:
                # Space out same-owner multi-character calls to reduce upstream 429s.
                await asyncio.sleep(2)

            display = _char_display(config)

            if not config.api_key:
                await message.channel.send(
                    f"Character owner for {display} has no API key configured."
                )
                continue

            count = increment_thread_count(storage_key, root_id)
            if count > THREAD_MESSAGE_LIMIT:
                await message.channel.send("Maximum length reached.")
                break

            target_chain = list(chain_so_far)
            target_img_desc = current_img_desc if index == 0 else {}

            async with message.channel.typing():
                reply = await generate_reply(
                    target,
                    config,
                    root_id,
                    root_created_at_ms,
                    configs,
                    index,
                    chain=target_chain,
                    image_descriptions=target_img_desc,
                )

            if reply == budget_exceeded_message():
                await message.channel.send(reply)
                continue

            out = f"**{display}** {reply}" if multi else reply
            sent = await send_chained_replies(target, out, mention_author=False)

            try:
                await create_short_term_memory(
                    config,
                    root_id,
                    root_created_at_ms,
                    target_chain,
                    target,
                    reply,
                    image_descriptions=target_img_desc,
                )
            except Exception as e:
                import traceback

                print(
                    f"Memory creation error (owner={config.owner_discord_id} "
                    f"slug={config.character_slug} server={config.server_id} "
                    f"has_api_key={bool(config.api_key)}): {e!r}"
                )
                traceback.print_exc()

            # Build a HistItem per Discord chunk sent, chained by parent_id
            # exactly as Discord's own reply chain links them. Deliberately NOT
            # overriding the character name here: a live walk-back would parse
            # it straight off the raw content's leading "**Name**" prefix (only
            # present on the first chunk, and only when multiple characters are
            # active), so leaving it unset keeps cached rendering identical to
            # the old live-walk behavior, quirks included.
            chunk_items: list[HistItem] = []
            parent_id = target.id
            for sent_msg in sent:
                chunk_items.append(
                    HistItem.from_message(sent_msg, client.user, None, parent_id=parent_id)
                )
                parent_id = sent_msg.id

            chain_so_far.append(pending_target_item)
            chain_so_far.extend(chunk_items[:-1])
            turn_items.append(pending_target_item)
            turn_items.extend(chunk_items[:-1])
            pending_target_item = chunk_items[-1]
            replied_any = True

            target = sent[-1]

        if replied_any:
            turn_items.append(pending_target_item)
            try:
                await conversation_cache.record_turn(
                    context_id, root_id, turn_items, is_fresh_tree=is_fresh_tree
                )
            except Exception as e:
                import traceback

                print(f"Conversation cache write error: {e!r}")
                traceback.print_exc()
    except RateLimitError as e:
        print(f"OpenRouter rate limit: {e}")
        await message.channel.send(
            "The language model is temporarily rate-limited. Please try again in a few seconds."
        )
    except OpenRouterAPIError as e:
        print(f"OpenRouter API error: {e}")
        await message.channel.send("Something went wrong calling the language model.")
    except Exception as e:
        print(f"Character reply error: {e}")
        await message.channel.send("Something went wrong generating a reply.")


def main() -> None:
    if not TOKEN:
        raise SystemExit("Please set TOKEN in bot/.env")
    client.run(TOKEN)


if __name__ == "__main__":
    main()
