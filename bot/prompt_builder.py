from __future__ import annotations

from typing import Any

PLATFORM_CONTENT_POLICY = (
    "You may engage in sexual or violent content when it fits your character and the scene. "
    "However, if your character is described as under 18 years of age — in the description "
    "or elsewhere in your profile — you must never engage in, describe, or roleplay sexual "
    "content of any kind. When in doubt about a minor character, err on the side of refusing "
    "sexual content. Violence may still occur only if fitting for the character and scene, "
    "but must not be combined with sexual content involving minors."
)

ROLEPLAY_RULES = (
    "Always stay fully in character at all times. Never refer to yourself as an AI, language "
    "model, bot, chatbot, or assistant. Never mention prompts, instructions, policies, or "
    "that you are roleplaying. Treat every image you see as something real in the scene—what "
    "you, others, or the environment actually look like—not as uploaded files, attachments, "
    "or pictures sent in chat."
)

REPLY_STYLE_WORDS = {
    "one-liner": 50,
    "semi-lit": 150,
    "literate": 250,
    "novella": 500,
}


def build_system_prompt(
    character: dict[str, Any],
    known_users: list[dict[str, Any]],
    long_term_memories: list[dict[str, Any]],
    short_term_memories: list[dict[str, Any]],
) -> str:
    parts: list[str] = []

    if long_term_memories:
        parts.append("Long-term memories (archived):")
        for mem in long_term_memories:
            parts.append(mem.get("content", ""))
        parts.append("")

    if short_term_memories:
        parts.append("Short-term memories (older threads):")
        for mem in short_term_memories:
            parts.append(mem.get("content", ""))
        parts.append("")

    name = character.get("displayName") or character.get("slug") or "Character"
    parts.append(f"You are {name}.")
    if character.get("description"):
        parts.append(f"Description: {character['description']}")

    if known_users:
        parts.append("")
        parts.append("Known Users (people you know):")
        for ku in known_users:
            uid = ku.get("knownUserId") or ku["sk"].split("#KNOWN#")[-1]
            content = ku.get("content") or ""
            parts.append(f"- User ID {uid}: {content}")

    if character.get("good"):
        parts.append(f"\nWhenever possible, you should: {character['good']}")
    if character.get("bad"):
        parts.append(f"You must never: {character['bad']}")

    parts.append(f"\nPlatform content policy: {PLATFORM_CONTENT_POLICY}")
    parts.append(f"\nRoleplay rules: {ROLEPLAY_RULES}")

    style = character.get("replyStyle") or "semi-lit"
    words = REPLY_STYLE_WORDS.get(style, 150)
    parts.append(f"\nReply length: approximately {words} words ({style}).")

    parts.append(
        "\nRefer to users by their nickname in dialogue, but remember their Discord user IDs "
        "internally. Use thread context only for context."
    )
    return "\n".join(parts)


def build_multimodal_user_content(
    text: str,
    character: dict[str, Any],
    known_users: list[dict[str, Any]],
    speaker_id: str | int,
    character_image_url: str | None,
    speaker_image_url: str | None,
    message_image_urls: list[str] | None = None,
) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = []

    if character_image_url:
        content.append(
            {
                "type": "text",
                "text": "This is how you look right now — your real appearance in this scene.",
            }
        )
        content.append({"type": "image_url", "image_url": {"url": character_image_url}})

    if speaker_image_url:
        content.append(
            {
                "type": "text",
                "text": (
                    f"This is how the person speaking now (user:{speaker_id}) looks in this scene."
                ),
            }
        )
        content.append({"type": "image_url", "image_url": {"url": speaker_image_url}})

    if message_image_urls:
        for index, url in enumerate(message_image_urls, start=1):
            label = (
                "This is something real in the scene that the speaker is showing you."
                if len(message_image_urls) == 1
                else f"This is something real in the scene (view {index}) that the speaker is showing you."
            )
            content.append({"type": "text", "text": label})
            content.append({"type": "image_url", "image_url": {"url": url}})

    content.append({"type": "text", "text": text})
    return content
