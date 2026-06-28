from __future__ import annotations

import re
from typing import Any

from openrouter_client import chat_completion

CHARACTER_SYSTEM = (
    "You write extremely detailed physical appearance descriptions for roleplay characters. "
    "Describe the person in the image in second person, beginning with the words 'You are'. "
    "Be exhaustive: face shape and features, eyes, eyebrows, nose, lips, skin tone and texture, "
    "hair color/style/length, body type and build, height impression, posture, clothing and fabrics, "
    "colors, accessories, jewelry, expression, mood, art style if illustrated, lighting, and any "
    "distinguishing marks. Aim for roughly 1000–1500 tokens. Write only the description, no preamble."
)

KNOWN_USER_SYSTEM = (
    "You write extremely detailed physical appearance descriptions for roleplay. "
    "Describe the person in the image in third person. Your output must begin with the lowercase "
    "word 'is ' (as it will follow a name like 'Alice (user:123) is ...'). "
    "Be exhaustive: face, hair, body, clothing, colors, expression, art style, and distinguishing "
    "details. Aim for roughly 1000–1500 tokens. Write only the description starting with 'is ', "
    "no preamble."
)

DISCORD_BATCH_SYSTEM = (
    "You write extremely detailed descriptions of images for roleplay context. "
    "For each image, describe everything visible in exhaustive detail: people, objects, places, "
    "colors, composition, mood, text if any, and art style. Aim for roughly 1000–1500 tokens "
    "per image. Output using exactly this format for each image:\n"
    "---IMAGE N---\n"
    "(description)\n"
    "Use N = 1, 2, 3, or 4 matching the image order given."
)


def _image_part(data_url: str) -> dict[str, Any]:
    return {"type": "image_url", "image_url": {"url": data_url}}


async def describe_character_portrait(
    *,
    api_key: str,
    owner_discord_id: str,
    data_url: str,
) -> str:
    content: list[dict[str, Any]] = [
        {"type": "text", "text": "Describe this character portrait."},
        _image_part(data_url),
    ]
    return await chat_completion(
        api_key=api_key,
        owner_discord_id=owner_discord_id,
        system=CHARACTER_SYSTEM,
        user_content=content,
        use_vision=True,
        max_tokens=2000,
    )


async def describe_known_user_portrait(
    *,
    api_key: str,
    owner_discord_id: str,
    data_url: str,
) -> str:
    content: list[dict[str, Any]] = [
        {"type": "text", "text": "Describe this person's appearance."},
        _image_part(data_url),
    ]
    text = await chat_completion(
        api_key=api_key,
        owner_discord_id=owner_discord_id,
        system=KNOWN_USER_SYSTEM,
        user_content=content,
        use_vision=True,
        max_tokens=2000,
    )
    if text and not text.lower().startswith("is "):
        text = f"is {text.lstrip()}"
    return text


def parse_discord_batch_descriptions(raw: str, expected: int) -> list[str]:
    parts = re.split(r"---IMAGE\s+(\d+)---", raw, flags=re.IGNORECASE)
    by_index: dict[int, str] = {}
    i = 1
    while i + 1 < len(parts):
        try:
            idx = int(parts[i])
        except ValueError:
            i += 2
            continue
        body = parts[i + 1].strip()
        if body:
            by_index[idx] = body
        i += 2
    if by_index:
        return [by_index[n] for n in sorted(by_index) if n in by_index][:expected]

    chunks = [c.strip() for c in raw.split("\n\n") if c.strip()]
    if len(chunks) >= expected:
        return chunks[:expected]
    if chunks:
        return chunks
    return [raw.strip()] if raw.strip() else []


async def describe_discord_message_images(
    *,
    api_key: str,
    owner_discord_id: str,
    data_urls: list[str],
) -> list[str]:
    if not data_urls:
        return []
    urls = data_urls[:4]
    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                f"Describe each of the following {len(urls)} image(s) in order. "
                "Use ---IMAGE N--- headers as instructed."
            ),
        }
    ]
    for index, url in enumerate(urls, start=1):
        content.append({"type": "text", "text": f"Image {index}:"})
        content.append(_image_part(url))

    raw = await chat_completion(
        api_key=api_key,
        owner_discord_id=owner_discord_id,
        system=DISCORD_BATCH_SYSTEM,
        user_content=content,
        use_vision=True,
        max_tokens=min(8000, 2000 * len(urls)),
    )
    parsed = parse_discord_batch_descriptions(raw, len(urls))
    while len(parsed) < len(urls):
        parsed.append("")
    return parsed[: len(urls)]


async def ensure_character_appearance(
    character: dict,
    owner_discord_id: str,
    api_key: str,
) -> dict:
    if not character.get("imageS3Key") or character.get("appearance"):
        return character
    from dynamo import update_character_fields
    from s3_images import fetch_image_data_url

    data_url = fetch_image_data_url(
        character.get("imageS3Key", ""),
        character.get("imageContentType"),
    )
    if not data_url:
        return character
    slug = character.get("slug") or character["sk"].split("#CHAR#")[-1].split("#")[0]
    appearance = await describe_character_portrait(
        api_key=api_key,
        owner_discord_id=owner_discord_id,
        data_url=data_url,
    )
    if appearance:
        update_character_fields(owner_discord_id, slug, {"appearance": appearance})
        character = dict(character)
        character["appearance"] = appearance
    return character


async def ensure_known_user_appearance(
    known_user: dict,
    owner_discord_id: str,
    slug: str,
    api_key: str,
) -> dict:
    if not known_user.get("imageS3Key") or known_user.get("appearance"):
        return known_user
    from dynamo import update_item_fields
    from s3_images import fetch_image_data_url

    data_url = fetch_image_data_url(
        known_user.get("imageS3Key", ""),
        known_user.get("imageContentType"),
    )
    if not data_url:
        return known_user
    appearance = await describe_known_user_portrait(
        api_key=api_key,
        owner_discord_id=owner_discord_id,
        data_url=data_url,
    )
    if appearance:
        ku_id = known_user.get("knownUserId") or known_user["sk"].split("#KNOWN#")[-1]
        sk = f"USERID#{owner_discord_id}#CHAR#{slug}#KNOWN#{ku_id}"
        update_item_fields("USERS", sk, {"appearance": appearance})
        known_user = dict(known_user)
        known_user["appearance"] = appearance
    return known_user

