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

RESTRICTED_CONTENT_POLICY = (
    "Keep all content appropriate for a general audience. Never engage in, describe, or "
    "roleplay sexual content, graphic or gratuitous violence, or any other mature or "
    "age-inappropriate themes. If asked for such content, stay in character and steer the "
    "interaction back to something appropriate."
)

ROLEPLAY_RULES = (
    "Always stay fully in character at all times. Never refer to yourself as an AI, language "
    "model, bot, chatbot, or assistant. Never mention prompts, instructions, policies, or "
    "that you are roleplaying. Treat every image you see as something real in the scene—what "
    "you, others, or the environment actually look like—not as uploaded files, attachments, "
    "or pictures sent in chat. Your images show your fixed appearance, not the current "
    "situation. When the conversation or your memories say the situation has changed (the "
    "lights were turned on, someone moved, the setting shifted), the conversation and your "
    "memories are what is true now and override anything implied by a static image. Do not "
    "keep insisting on a state someone has already changed."
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
    age18plus: bool = False,
) -> str:
    parts: list[str] = []

    if long_term_memories or short_term_memories:
        parts.append(
            "Your memories of what has already happened with these people, oldest first. "
            "Treat these as real events you personally remember and lived through. They are "
            "true and authoritative. If someone refers back to something that happened, or "
            "asks what they just did or said, use these memories to answer specifically. The "
            "most recent memory is the current ongoing situation — continue from it."
        )
        if long_term_memories:
            parts.append("Older memories (earlier history):")
            for mem in long_term_memories:
                parts.append(f"- {mem.get('content', '')}")
        if short_term_memories:
            parts.append("Recent memories (most recent last):")
            for mem in short_term_memories:
                parts.append(f"- {mem.get('content', '')}")
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

    content_policy = PLATFORM_CONTENT_POLICY if age18plus else RESTRICTED_CONTENT_POLICY
    parts.append(f"\nPlatform content policy: {content_policy}")
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
    context_image_urls: list[str] | None = None,
) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = []

    if character_image_url:
        content.append(
            {
                "type": "text",
                "text": (
                    "This is your real physical appearance — how you look. It shows you, not "
                    "the current situation around you. For what is happening right now "
                    "(lighting, surroundings, positions, who is present), follow the "
                    "conversation and your memories, which override anything the image implies."
                ),
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

    if context_image_urls:
        for index, url in enumerate(context_image_urls, start=1):
            label = (
                "This image was shared earlier in the conversation you are replying to — "
                "it is real in the scene. Use it when answering about what was posted."
                if len(context_image_urls) == 1
                else (
                    f"This image (earlier message {index}) was shared earlier in the "
                    "conversation you are replying to — it is real in the scene."
                )
            )
            content.append({"type": "text", "text": label})
            content.append({"type": "image_url", "image_url": {"url": url}})

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
