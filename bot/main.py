# This code is based on the following example:
# https://discordpy.readthedocs.io/en/stable/quickstart.html#a-minimal-bot
from __future__ import annotations

import io

import discord
from discord import app_commands
from openai import APIError

from config import SITE_URL, THREAD_MESSAGE_LIMIT, TOKEN
from guild_nickname import sync_guild_nickname
from discord_images import fetch_message_image_data_urls
from dynamo import (
    find_character_by_display_name,
    get_character,
    get_guild_config,
    get_user,
    increment_thread_count,
    link_guild_to_user,
    list_server_characters,
    set_guild_active_character,
)
from messages import (
    build_thread_prompt,
    fetch_message,
    fetch_reply_chain,
    send_chained_replies,
    single_message_prompt,
)
from openrouter_client import chat_completion
from prompt_builder import build_multimodal_user_content, build_system_prompt
from runtime import (
    RuntimeConfig,
    create_short_term_memory,
    get_thread_root,
    load_memories_for_prompt,
    resolve_runtime_config,
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


@client.tree.command(name="character", description="Show the active character for this server")
async def character_cmd(interaction: discord.Interaction):
    if not interaction.guild:
        await interaction.response.send_message("Use this in a server.", ephemeral=True)
        return
    cfg = get_guild_config(interaction.guild.id)
    if not cfg:
        await interaction.response.send_message(
            f"No character configured. Use /setcharacter or visit {SITE_URL}",
            ephemeral=True,
        )
        return
    name = cfg.get("activeCharacterSlug", "?")
    owner = cfg.get("activeOwnerDiscordId", "?")
    await interaction.response.send_message(
        f"Active character: **{name}** (owner user ID: {owner})",
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


@client.tree.command(name="setcharacter", description="Set the active character for this server")
@app_commands.describe(name="Character display name")
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

    char = find_character_by_display_name(interaction.guild.id, name)
    if not char:
        await interaction.response.send_message(
            f"Character '{name}' not found. Use /listcharacters.",
            ephemeral=True,
        )
        return

    link_guild_to_user(interaction.user.id, interaction.guild.id)
    owner_id = char.get("ownerDiscordId") or char["sk"].split("#CHAR#")[0].replace("USERID#", "")
    slug = char.get("slug") or char["sk"].split("#CHAR#")[-1]
    set_guild_active_character(interaction.guild.id, owner_id, slug, interaction.user.id)

    display = char.get("displayName") or slug
    await sync_guild_nickname(interaction.guild, display)
    await interaction.response.send_message(
        f"Active character set to **{display}**.", ephemeral=True
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
    if cfg:
        owner_id = cfg.get("activeOwnerDiscordId")
        slug = cfg.get("activeCharacterSlug")
        if owner_id and slug:
            char = get_character(owner_id, slug)
            if char:
                display = char.get("displayName") or slug
                await sync_guild_nickname(guild, display)
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


async def generate_reply(message: discord.Message, config: RuntimeConfig) -> str:
    if is_over_budget(config.owner_user):
        return budget_exceeded_message()

    chain = await fetch_reply_chain(message) if message.reference else []
    chain_first = chain[0] if chain else message
    lt, st = load_memories_for_prompt(
        config.owner_discord_id,
        config.character_slug,
        config.server_id,
        chain_first,
    )

    system = build_system_prompt(config.character, config.known_users, lt, st)
    char_name = config.character.get("displayName") or config.character.get("slug", "Character")

    if chain:
        text = build_thread_prompt(chain, message, client.user, char_name)
    else:
        text = single_message_prompt(message, client.user)

    char_img = fetch_image_data_url(
        config.character.get("imageS3Key", ""),
        config.character.get("imageContentType"),
    )

    speaker_img = None
    speaker_id = str(message.author.id)
    for ku in config.known_users:
        ku_id = ku.get("knownUserId") or ku["sk"].split("#KNOWN#")[-1]
        if ku_id == speaker_id and ku.get("imageS3Key"):
            speaker_img = fetch_image_data_url(ku["imageS3Key"], ku.get("imageContentType"))
            break

    message_imgs = await fetch_message_image_data_urls(message)

    user_content = build_multimodal_user_content(
        text,
        config.character,
        config.known_users,
        speaker_id,
        char_img,
        speaker_img,
        message_imgs,
    )

    return await chat_completion(
        api_key=config.api_key,
        owner_discord_id=config.owner_discord_id,
        system=system,
        user_content=user_content,
        use_vision=True,
    )


@client.event
async def on_message(message: discord.Message):
    if message.author == client.user:
        return

    mentioned = client.user in message.mentions
    reply_to_bot = await is_reply_to_bot(message)

    if not mentioned and not reply_to_bot:
        return

    config = resolve_runtime_config(message)
    if not config:
        await message.channel.send(
            f"This server or DM is not configured yet. Visit {SITE_URL} to set up."
        )
        return

    if not config.api_key:
        await message.channel.send("Character owner has no API key configured.")
        return

    if message.guild:
        char_display = (
            config.character.get("displayName")
            or config.character.get("slug")
            or "Character"
        )
        await sync_guild_nickname(message.guild, char_display)

    try:
        root = await get_thread_root(message)
        storage_key = thread_storage_key(message, config.owner_discord_id)
        count = increment_thread_count(storage_key, root.id)
        if count > THREAD_MESSAGE_LIMIT:
            await message.channel.send("Maximum length reached.")
            return

        async with message.channel.typing():
            reply = await generate_reply(message, config)

        if reply == budget_exceeded_message():
            await message.channel.send(reply)
            return

        await send_chained_replies(message, reply, mention_author=False)
        increment_thread_count(storage_key, root.id)

        chain = await fetch_reply_chain(message) if message.reference else []
        await create_short_term_memory(config, root, chain, message, reply)
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
