from __future__ import annotations

import difflib
import re
from dataclasses import dataclass
from typing import Any

import discord

from discord_images import attachment_note
from thread_images import format_image_descriptions

_CHARACTER_PREFIX_RE = re.compile(r"^\*\*(?P<name>.+?)\*\*\s*", re.DOTALL)


def parse_character_prefix(content: str) -> tuple[str | None, str]:
    """Split a leading ``**Name**`` prefix off a bot message.

    Returns ``(name, body)`` when the message starts with a bold character name,
    otherwise ``(None, original_content)``.
    """
    text = content or ""
    match = _CHARACTER_PREFIX_RE.match(text)
    if not match:
        return None, text.strip()
    name = match.group("name").strip()
    body = text[match.end():].strip()
    return (name or None), body


def texts_too_similar(a: str, b: str, threshold: float = 0.9) -> bool:
    """True when two texts are near-identical (used to detect repetition loops)."""
    a = (a or "").strip()
    b = (b or "").strip()
    if not a or not b:
        return False
    return difflib.SequenceMatcher(None, a, b).ratio() >= threshold


@dataclass
class HistItem:
    """A lightweight, cacheable snapshot of one historical message.

    Unlike a live ``discord.Message``, a ``HistItem``'s ``body`` and base
    ``label`` are pre-rendered at creation time (mentions resolved, image
    descriptions already baked in), so replaying history from the S3 cache
    never needs another Discord or vision API call. Per-character context
    (the known-user appearance annotation) is resolved at render time via
    the helpers below, since the same cached item may be rendered for
    different characters/configs.
    """

    message_id: int
    author_id: int
    is_bot: bool
    character_name: str | None
    nick: str | None
    label: str
    body: str
    created_at_ms: int
    parent_id: int | None = None

    @classmethod
    def from_message(
        cls,
        message: discord.Message,
        bot_user: discord.ClientUser,
        image_descriptions: dict[int, list[str]] | None = None,
        *,
        parent_id: int | None = None,
        character_name_override: str | None = None,
    ) -> "HistItem":
        is_bot = message.author == bot_user
        if is_bot:
            name, _ = parse_character_prefix(message.content)
            character_name = character_name_override or name
            nick = None
            label = f"{character_name} (a character, not a user)" if character_name else "Character"
        else:
            character_name = None
            nick = getattr(message.author, "display_name", str(message.author))
            label = f"{nick} (user:{message.author.id})"

        body = message_body(message, bot_user, image_descriptions)

        if parent_id is None:
            ref = message.reference
            parent_id = ref.message_id if ref and ref.message_id else None

        return cls(
            message_id=message.id,
            author_id=message.author.id,
            is_bot=is_bot,
            character_name=character_name,
            nick=nick,
            label=label,
            body=body,
            created_at_ms=int(message.created_at.timestamp() * 1000),
            parent_id=parent_id,
        )

    def to_node_dict(self) -> dict[str, Any]:
        return {
            "parent_id": str(self.parent_id) if self.parent_id is not None else None,
            "author_id": str(self.author_id),
            "is_bot": self.is_bot,
            "character_name": self.character_name,
            "nick": self.nick,
            "label": self.label,
            "body": self.body,
            "created_at_ms": self.created_at_ms,
        }

    @classmethod
    def from_node_dict(cls, message_id: int, node: dict[str, Any]) -> "HistItem":
        parent_id = node.get("parent_id")
        return cls(
            message_id=message_id,
            author_id=int(node.get("author_id") or 0),
            is_bot=bool(node.get("is_bot")),
            character_name=node.get("character_name"),
            nick=node.get("nick"),
            label=node.get("label") or "",
            body=node.get("body") or "",
            created_at_ms=int(node.get("created_at_ms") or 0),
            parent_id=int(parent_id) if parent_id is not None else None,
        )


def _known_user_by_id(
    author_id: int,
    known_users: list[dict[str, Any]] | None,
) -> dict[str, Any] | None:
    if not known_users:
        return None
    speaker_id = str(author_id)
    for ku in known_users:
        ku_id = ku.get("knownUserId") or ku["sk"].split("#KNOWN#")[-1]
        if ku_id == speaker_id:
            return ku
    return None


def hist_author_with_id(
    item: HistItem,
    known_users: list[dict[str, Any]] | None = None,
) -> str:
    if item.is_bot:
        return item.label
    ku = _known_user_by_id(item.author_id, known_users)
    if ku and ku.get("appearance"):
        return f"{item.label} {ku['appearance']}"
    return item.label


def hist_known_user(
    item: HistItem,
    known_users: list[dict[str, Any]] | None,
) -> dict[str, Any] | None:
    if item.is_bot:
        return None
    return _known_user_by_id(item.author_id, known_users)


def last_bot_message_text(
    chain: list[HistItem],
    character_name: str | None = None,
) -> str | None:
    """The text of the most recent message authored by the bot in this reply chain.

    When ``character_name`` is given, only consider bot messages whose recorded
    character matches that name.
    """
    target = (character_name or "").strip().lower()
    for item in reversed(chain):
        if not item.is_bot:
            continue
        if target:
            if (item.character_name or "").strip().lower() != target:
                continue
            return item.body or None
        return item.body or None
    return None


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


def hist_chain_from_messages(
    chain: list[discord.Message],
    bot_user: discord.ClientUser,
    image_descriptions: dict[int, list[str]] | None = None,
) -> list[HistItem]:
    """Convert a live Discord reply-chain walk into cacheable ``HistItem``s.

    Used on a cache-miss/fallback to build the nodes that will be persisted
    fresh to S3, and also to feed the prompt builder without changing the
    live-walk behavior.
    """
    return [
        HistItem.from_message(msg, bot_user, image_descriptions)
        for msg in chain
    ]


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
        name, _ = parse_character_prefix(message.content)
        return name or "Character"
    return getattr(message.author, "display_name", str(message.author))


def _known_user_for_speaker(
    message: discord.Message,
    bot_user: discord.ClientUser,
    known_users: list[dict[str, Any]] | None,
) -> dict[str, Any] | None:
    if not known_users or message.author == bot_user:
        return None
    return _known_user_by_id(message.author.id, known_users)


def author_with_id(
    message: discord.Message,
    bot_user: discord.ClientUser,
    known_users: list[dict[str, Any]] | None = None,
) -> str:
    if message.author == bot_user:
        name, _ = parse_character_prefix(message.content)
        if name:
            return f"{name} (a character, not a user)"
        return "Character"
    nick = getattr(message.author, "display_name", str(message.author))
    base = f"{nick} (user:{message.author.id})"
    ku = _known_user_for_speaker(message, bot_user, known_users)
    if ku and ku.get("appearance"):
        return f"{base} {ku['appearance']}"
    return base


def message_body(
    message: discord.Message,
    bot_user: discord.ClientUser,
    image_descriptions: dict[int, list[str]] | None = None,
) -> str:
    if message.author == bot_user:
        _, text = parse_character_prefix(message.content)
    else:
        text = format_message_content(message, bot_user)
    base = text if text else "[no text content]"

    descs = (image_descriptions or {}).get(message.id)
    if descs:
        base += format_image_descriptions(descs)
    else:
        note = attachment_note(message)
        if note:
            base += note
    return base


def build_thread_prompt(
    chain: list[HistItem],
    current: discord.Message,
    bot_user: discord.ClientUser,
    character_name: str,
    known_users: list[dict[str, Any]] | None = None,
    image_descriptions: dict[int, list[str]] | None = None,
) -> str:
    parts: list[str] = []
    ku = _known_user_for_speaker(current, bot_user, known_users)
    if ku and ku.get("appearance") and ku.get("content"):
        parts.append(
            "If the speaking user's appearance below contradicts their Known User profile, "
            "their profile takes precedence."
        )
    if chain:
        parts.append("Earlier messages in this reply thread (oldest first, for context only):")
        for index, item in enumerate(chain, start=1):
            parts.append(
                f"{index}. {hist_author_with_id(item, known_users)}: {item.body}"
            )
        parts.append("")
    parts.append(
        f"Message to respond to ({author_with_id(current, bot_user, known_users)}): "
        f"{message_body(current, bot_user, image_descriptions)}"
    )
    parts.append("")
    parts.append(
        f"Reply to the message above. Use the earlier thread messages only for context. "
        f"Stay in character as {character_name} and do not break character."
    )
    return "\n".join(parts)


def single_message_prompt(
    message: discord.Message,
    bot_user: discord.ClientUser,
    known_users: list[dict[str, Any]] | None = None,
    image_descriptions: dict[int, list[str]] | None = None,
) -> str:
    body = message_body(message, bot_user, image_descriptions)
    nick = getattr(message.author, "display_name", str(message.author))
    text_only = (
        message.content.strip()
        if message.author == bot_user
        else format_message_content(message, bot_user)
    )
    has_images = bool(
        (image_descriptions or {}).get(message.id)
        or attachment_note(message)
    )
    author = author_with_id(message, bot_user, known_users)
    ku = _known_user_for_speaker(message, bot_user, known_users)
    precedence = ""
    if ku and ku.get("appearance") and ku.get("content"):
        precedence = (
            "If their appearance contradicts their Known User profile, their profile "
            "takes precedence. "
        )

    if not text_only and has_images:
        return (
            f"{author} sent an image. {precedence}"
            f"{message_body(message, bot_user, image_descriptions)} "
            "Respond in character to what they sent."
        )
    if not text_only:
        return (
            f"{nick} (user:{message.author.id}) @ mentioned you with no other message. "
            "Greet them in character."
        )
    if precedence:
        return f"{precedence}{author}: {body}"
    return f"{author}: {body}"


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
) -> list[discord.Message]:
    """Send ``text`` as one or more Discord messages, each replying to the last.

    Returns every chunk sent, in order, so callers can record each chunk as
    its own history node with correct parent chaining (mirrors exactly what
    a live Discord reply-chain walk would see).
    """
    prior = origin
    sent: list[discord.Message] = []
    for part in split_for_discord(text):
        prior = await prior.reply(part, mention_author=mention_author)
        sent.append(prior)
    return sent
