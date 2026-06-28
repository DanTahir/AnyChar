# This code is based on the following example:
# https://discordpy.readthedocs.io/en/stable/quickstart.html#a-minimal-bot
from __future__ import annotations

import io

import discord
from discord import app_commands
from openai import APIError

from config import SITE_URL, THREAD_MESSAGE_LIMIT, TOKEN
from guild_nickname import build_combined_nickname, sync_guild_nickname
from discord_images import fetch_images_from_messages, fetch_message_image_data_urls
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
    build_thread_prompt,
    fetch_message,
    fetch_reply_chain,
    last_bot_message_text,
    send_chained_replies,
    single_message_prompt,
    texts_too_similar,
)
from openrouter_client import chat_completion
from prompt_builder import (
    area_context_line,
    build_multimodal_user_content,
    build_system_prompt,
)
from runtime import (
    RuntimeConfig,
    create_short_term_memory,
    get_thread_root,
    load_memories_for_prompt,
    resolve_runtime_configs,
    thread_storage_key,
)
from s3_images import fetch_image_bytes, fetch_image_data_url
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
    thread_root: discord.Message,
    all_configs: list[RuntimeConfig] | None = None,
    index: int = 0,
) -> str:
    if is_over_budget(config.owner_user):
        return budget_exceeded_message()

    all_configs = all_configs or [config]
    other_configs = [c for j, c in enumerate(all_configs) if j != index]
    names = [_char_display(c) for c in all_configs]

    chain = await fetch_reply_chain(message) if message.reference else []
    lt, st = load_memories_for_prompt(
        config.owner_discord_id,
        config.character_slug,
        config.server_id,
        thread_root,
        message,
    )

    owner_age18plus = bool(config.owner_user.get("age18plus"))
    other_characters = [
        {"name": _char_display(c), "description": c.character.get("description") or ""}
        for c in other_configs
    ]
    area_context = area_context_line(names, index) if len(all_configs) > 1 else None
    system = build_system_prompt(
        config.character,
        config.known_users,
        lt,
        st,
        owner_age18plus,
        has_live_conversation=bool(chain),
        other_characters=other_characters or None,
        area_context=area_context,
    )
    char_name = _char_display(config)

    if chain:
        text = build_thread_prompt(chain, message, client.user, char_name)
    else:
        text = single_message_prompt(message, client.user)

    char_img = fetch_image_data_url(
        config.character.get("imageS3Key", ""),
        config.character.get("imageContentType"),
    )

    # The speaker is either a human (look up their Known User image) or another
    # character that just spoke (handled via other_character_images below).
    speaker_img = None
    speaker_id = str(message.author.id)
    if message.author != client.user:
        for ku in config.known_users:
            ku_id = ku.get("knownUserId") or ku["sk"].split("#KNOWN#")[-1]
            if ku_id == speaker_id and ku.get("imageS3Key"):
                speaker_img = fetch_image_data_url(
                    ku["imageS3Key"], ku.get("imageContentType")
                )
                break

    other_character_images: list[dict] = []
    for c in other_configs:
        url = fetch_image_data_url(
            c.character.get("imageS3Key", ""),
            c.character.get("imageContentType"),
        )
        if url:
            other_character_images.append({"name": _char_display(c), "url": url})

    message_imgs = await fetch_message_image_data_urls(message)
    # Images posted in the messages being replied to (closest reply first) so the
    # character can actually see an image when asked about it in a reply.
    context_imgs = (
        await fetch_images_from_messages(list(reversed(chain))) if chain else []
    )

    user_content = build_multimodal_user_content(
        text,
        config.character,
        config.known_users,
        speaker_id,
        char_img,
        speaker_img,
        message_imgs,
        context_imgs,
        other_character_images=other_character_images,
    )

    reply = await chat_completion(
        api_key=config.api_key,
        owner_discord_id=config.owner_discord_id,
        system=system,
        user_content=user_content,
        use_vision=True,
    )

    # Self-repetition guard: if the model echoed its previous reply in this thread
    # almost verbatim, regenerate once with an explicit do-not-repeat instruction.
    prev_bot_text = last_bot_message_text(chain, client.user, character_name=char_name)
    if prev_bot_text and texts_too_similar(prev_bot_text, reply):
        nudge_text = (
            "Your reply was almost identical to your previous message in this conversation. "
            "Do not repeat yourself or restate the same request. Respond to what was just "
            "said, take a clearly different action, and move the scene forward."
        )
        if isinstance(user_content, list):
            retry_content: str | list[dict] = user_content + [
                {"type": "text", "text": nudge_text}
            ]
        else:
            retry_content = f"{user_content}\n\n{nudge_text}"
        reply = await chat_completion(
            api_key=config.api_key,
            owner_discord_id=config.owner_discord_id,
            system=system,
            user_content=retry_content,
            use_vision=True,
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
        root = await get_thread_root(message)
        storage_key = thread_storage_key(message, configs[0].owner_discord_id)

        # Each character replies in order: the first to the user, each next one to
        # the character that just spoke, forming a single linear reply chain.
        target = message
        for index, config in enumerate(configs):
            display = _char_display(config)

            if not config.api_key:
                await message.channel.send(
                    f"Character owner for {display} has no API key configured."
                )
                continue

            count = increment_thread_count(storage_key, root.id)
            if count > THREAD_MESSAGE_LIMIT:
                await message.channel.send("Maximum length reached.")
                break

            async with message.channel.typing():
                reply = await generate_reply(target, config, root, configs, index)

            if reply == budget_exceeded_message():
                await message.channel.send(reply)
                continue

            out = f"**{display}** {reply}" if multi else reply
            sent = await send_chained_replies(target, out, mention_author=False)

            try:
                chain = await fetch_reply_chain(target) if target.reference else []
                await create_short_term_memory(config, root, chain, target, reply)
            except Exception as e:
                import traceback

                print(
                    f"Memory creation error (owner={config.owner_discord_id} "
                    f"slug={config.character_slug} server={config.server_id} "
                    f"has_api_key={bool(config.api_key)}): {e!r}"
                )
                traceback.print_exc()

            target = sent
    except APIError as e:
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
