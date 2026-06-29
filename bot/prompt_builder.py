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
    "that you are roleplaying. "
    "When the prompt includes appearance or image descriptions, treat them as what you and "
    "others genuinely look like or what is genuinely present in the scene. React in character "
    "as if you truly perceive those details. Descriptions of charts, graphs, diagrams, "
    "infographics, multi-panel comics with dialogue, or memes with text overlays represent "
    "media someone is sharing, not physical reality. "
    "Your own appearance description shows your fixed look, not the current situation around "
    "you. When the conversation or your memories say the situation has changed, the conversation "
    "and your memories override anything implied by a static description."
)

REPLY_STYLE_WORDS = {
    "one-liner": 50,
    "semi-lit": 150,
    "literate": 250,
    "novella": 500,
}

ANTI_REPETITION_RULE = (
    "Move the scene forward with every reply. Never repeat the same request, command, "
    "demand, or line that you — or your memories — already used; if you notice yourself "
    "about to ask for or say the same thing again, do something different and progress the "
    "interaction instead. Always respond to what the other person just said and did."
)

CREATIVITY_RULE = (
    "Write with variety and inventiveness. Vary sentence rhythm, word choice, and emotional "
    "texture from reply to reply. Use specific sensory details, unexpected beats, and fresh "
    "angles — not generic filler or stock phrases. Let your character's personality show through "
    "how they speak and act, not just what they say. Avoid formulaic patterns and predictable "
    "responses; each reply should feel distinct and alive."
)

USER_RP_STYLE_RULE = (
    "Adapt your roleplay formatting and point of view to match the human user you are responding "
    "to. In multi-character reply chains, take your cues from the most recent human user in the "
    "thread — not from another character's last bot reply. "
    "If they refer to themselves in third person, refer to them in third person; if they use "
    "first person for themselves, refer to them in second person (you/your). "
    "If their messages do not distinguish action from speech, do the same. "
    "If they put dialogue in quotes and actions outside quotes, follow that pattern. "
    "If they use plain text for dialogue and italics (or similar markup) for actions, do that. "
    "Mirror whatever variation of roleplay style they use — tense, punctuation, line breaks, "
    "and action/dialogue conventions included. "
    "Only diverge from the user's style when the character description or that user's Known User "
    "profile explicitly overrides it."
)


def _natural_join(names: list[str]) -> str:
    names = [n for n in names if n]
    if not names:
        return ""
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return f"{', '.join(names[:-1])}, and {names[-1]}"


def area_context_line(names: list[str], index: int) -> str:
    """Build the per-turn "you are in the area with..." line for character at
    position ``index`` within the ordered ``names`` list."""
    if len(names) <= 1:
        return ""
    others = [n for i, n in enumerate(names) if i != index]
    before = names[:index]
    after = names[index + 1:]

    sentences = [f"You are in the area with {_natural_join(others)}."]
    if before:
        if len(before) == 1:
            sentences.append(f"{before[0]} responded first.")
        else:
            sentences.append(f"{_natural_join(before)} responded before you.")
    sentences.append("Now you are responding.")
    if after:
        sentences.append(f"Then {_natural_join(after)} will respond.")
    return " ".join(sentences)


def build_system_prompt(
    character: dict[str, Any],
    known_users: list[dict[str, Any]],
    long_term_memories: list[dict[str, Any]],
    short_term_memories: list[dict[str, Any]],
    age18plus: bool = False,
    has_live_conversation: bool = False,
    other_characters: list[dict[str, Any]] | None = None,
    area_context: str | None = None,
) -> str:
    parts: list[str] = []

    if long_term_memories or short_term_memories:
        if has_live_conversation:
            parts.append(
                "Your memories of what has already happened with these people, oldest first. "
                "Treat these as real events you personally remember and lived through; they "
                "are true and authoritative for recall. They are BACKGROUND ONLY. The "
                "conversation shown in the message you are replying to below is what is "
                "happening right now — respond to that. Use these memories only for continuity "
                "and to answer questions about the past. Do not restart, replay, or repeat an "
                "older memory as if it were the current moment."
            )
        else:
            parts.append(
                "Your memories of what has already happened with these people, oldest first. "
                "Treat these as real events you personally remember and lived through. They "
                "are true and authoritative. If someone refers back to something that "
                "happened, or asks what they just did or said, use these memories to answer "
                "specifically. The most recent memory is where things last left off — continue "
                "naturally from it, but move the scene forward instead of repeating it."
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
    if character.get("appearance"):
        parts.append(f"Appearance: {character['appearance']}")
        if character.get("description"):
            parts.append(
                "If your appearance contradicts your description, your description takes precedence."
            )

    if other_characters:
        parts.append("")
        parts.append(
            "Other characters are present with you. Treat each of them as a real person "
            "you know who is physically here in the scene — you can see their appearance "
            "and you know who they are. They are not Discord users and have no user ID. "
            "Each of their messages begins with their name in bold, like \"**Name**\", "
            "which tells you who is speaking; treat that bold name as the speaker's name and "
            "do not repeat it back as part of your own reply. Do not prefix your own reply "
            "with your name or a bold name tag — just write what you say and do."
        )
        for oc in other_characters:
            oc_name = oc.get("name") or "Someone"
            desc = (oc.get("description") or "").strip()
            app = (oc.get("appearance") or "").strip()
            if desc and app:
                parts.append(f"- {oc_name}: {desc}")
                parts.append(f"  Appearance: {app}")
            elif app:
                parts.append(f"- {oc_name}: {app}")
            elif desc:
                parts.append(f"- {oc_name}: {desc}")
            else:
                parts.append(f"- {oc_name}")

    if area_context:
        parts.append("")
        parts.append(area_context)

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
    parts.append(f"\nKeep the scene moving: {ANTI_REPETITION_RULE}")
    parts.append(f"\nCreativity: {CREATIVITY_RULE}")
    parts.append(f"\nMatch the user's roleplay style: {USER_RP_STYLE_RULE}")

    style = character.get("replyStyle") or "semi-lit"
    words = REPLY_STYLE_WORDS.get(style, 150)
    parts.append(f"\nReply length: approximately {words} words ({style}).")

    parts.append(
        "\nRefer to users by their nickname in dialogue, but remember their Discord user IDs "
        "internally. Use thread context only for context."
    )
    return "\n".join(parts)
