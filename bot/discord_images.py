from __future__ import annotations

import base64

import discord

MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024
MAX_ATTACHMENTS = 4

IMAGE_CONTENT_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    }
)


def _is_image_attachment(attachment: discord.Attachment) -> bool:
    if attachment.content_type and attachment.content_type in IMAGE_CONTENT_TYPES:
        return True
    name = (attachment.filename or "").lower()
    return name.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif"))


async def attachment_to_data_url(attachment: discord.Attachment) -> str | None:
    if not _is_image_attachment(attachment):
        return None
    if attachment.size and attachment.size > MAX_ATTACHMENT_BYTES:
        return None
    try:
        data = await attachment.read()
    except (discord.HTTPException, OSError):
        return None
    if len(data) > MAX_ATTACHMENT_BYTES:
        return None

    content_type = attachment.content_type or "image/jpeg"
    if content_type not in IMAGE_CONTENT_TYPES:
        content_type = "image/jpeg"
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{content_type};base64,{b64}"


async def fetch_message_image_data_urls(message: discord.Message) -> list[str]:
    urls: list[str] = []
    for attachment in message.attachments[:MAX_ATTACHMENTS]:
        data_url = await attachment_to_data_url(attachment)
        if data_url:
            urls.append(data_url)
    return urls


async def fetch_images_from_messages(
    messages: list[discord.Message], cap: int = MAX_ATTACHMENTS
) -> list[str]:
    urls: list[str] = []
    for message in messages:
        for attachment in message.attachments:
            if len(urls) >= cap:
                return urls
            data_url = await attachment_to_data_url(attachment)
            if data_url:
                urls.append(data_url)
    return urls


def attachment_note(message: discord.Message) -> str:
    count = sum(1 for a in message.attachments if _is_image_attachment(a))
    if count == 0:
        return ""
    if count == 1:
        return " [attached 1 image]"
    return f" [attached {count} images]"


def message_has_images(message: discord.Message) -> bool:
    return any(_is_image_attachment(a) for a in message.attachments)
