from __future__ import annotations

import discord

from discord_images import attachment_note


async def fetch_message(
    channel: discord.abc.Messageable,
    message_id: int,
    reference: discord.MessageReference | None,
) -> discord.Message | None:
    if (
        reference
        and reference.resolved
        and isinstance(reference.resolved, discord.Message)
        and reference.resolved.id == message_id
    ):
        return reference.resolved
    try:
        return await channel.fetch_message(message_id)
    except (discord.NotFound, discord.Forbidden):
        return None


async def fetch_reply_chain(message: discord.Message) -> list[discord.Message]:
    chain: list[discord.Message] = []
    reference = message.reference
    if not reference or not reference.message_id:
        return chain

    message_id = reference.message_id
    while message_id:
        parent = await fetch_message(message.channel, message_id, reference)
        if parent is None:
            break
        chain.insert(0, parent)
        reference = parent.reference
        message_id = reference.message_id if reference and reference.message_id else None

    return chain


async def get_thread_root(message: discord.Message) -> discord.Message:
    current = message
    while current.reference and current.reference.message_id:
        parent = await fetch_message(
            message.channel, current.reference.message_id, current.reference
        )
        if parent is None:
            break
        current = parent
    return current


def format_message_content(message: discord.Message, bot_user: discord.ClientUser) -> str:
    text = message.content
    for user in message.mentions:
        if user.id == bot_user.id:
            replacement = ""
        else:
            replacement = f"@{user.display_name}"
        text = text.replace(f"<@{user.id}>", replacement).replace(
            f"<@!{user.id}>", replacement
        )
    return " ".join(text.split()).strip()


def author_label(message: discord.Message, bot_user: discord.ClientUser) -> str:
    if message.author == bot_user:
        return "Character"
    return getattr(message.author, "display_name", str(message.author))


def author_with_id(message: discord.Message, bot_user: discord.ClientUser) -> str:
    if message.author == bot_user:
        return "Character"
    nick = getattr(message.author, "display_name", str(message.author))
    return f"{nick} (user:{message.author.id})"


def message_body(message: discord.Message, bot_user: discord.ClientUser) -> str:
    if message.author == bot_user:
        text = message.content.strip()
    else:
        text = format_message_content(message, bot_user)
    base = text if text else "[no text content]"
    note = attachment_note(message)
    return base + note if note else base


def build_thread_prompt(
    chain: list[discord.Message],
    current: discord.Message,
    bot_user: discord.ClientUser,
    character_name: str,
) -> str:
    parts: list[str] = []
    if chain:
        parts.append("Earlier messages in this reply thread (oldest first, for context only):")
        for index, msg in enumerate(chain, start=1):
            parts.append(f"{index}. {author_with_id(msg, bot_user)}: {message_body(msg, bot_user)}")
        parts.append("")
    parts.append(
        f"Message to respond to ({author_with_id(current, bot_user)}): "
        f"{message_body(current, bot_user)}"
    )
    parts.append("")
    parts.append(
        f"Reply to the message above. Use the earlier thread messages only for context. "
        f"Stay in character as {character_name} and do not break character."
    )
    return "\n".join(parts)


def single_message_prompt(message: discord.Message, bot_user: discord.ClientUser) -> str:
    body = message_body(message, bot_user)
    nick = getattr(message.author, "display_name", str(message.author))
    text_only = (
        message.content.strip()
        if message.author == bot_user
        else format_message_content(message, bot_user)
    )
    has_images = bool(attachment_note(message))

    if not text_only and has_images:
        return (
            f"{nick} (user:{message.author.id}) sent an image. "
            "Respond in character to what they sent."
        )
    if not text_only:
        return (
            f"{nick} (user:{message.author.id}) @ mentioned you with no other message. "
            "Greet them in character."
        )
    return f"{author_with_id(message, bot_user)}: {body}"


def split_for_discord(text: str, limit: int = 2000) -> list[str]:
    if len(text) <= limit:
        return [text]
    chunks: list[str] = []
    remaining = text
    while remaining:
        if len(remaining) <= limit:
            chunks.append(remaining)
            break
        split_at = remaining.rfind("\n", 0, limit)
        if split_at <= 0:
            split_at = remaining.rfind(" ", 0, limit)
        if split_at <= 0:
            split_at = limit
        chunks.append(remaining[:split_at].rstrip())
        remaining = remaining[split_at:].lstrip("\n ")
    return chunks


async def send_chained_replies(
    origin: discord.Message,
    text: str,
    *,
    mention_author: bool = False,
) -> None:
    prior = origin
    for part in split_for_discord(text):
        prior = await prior.reply(part, mention_author=mention_author)
