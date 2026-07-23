"""Smoke test for HistItem.from_message using mock discord.Message objects,
and a simulation of the multi-chunk / multi-character chaining algorithm from
on_message, without needing a live Discord connection.

Run with: python scripts/smoke_test_histitem_from_message.py
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from messages import HistItem  # noqa: E402


def check(label: str, cond: bool) -> None:
    status = "OK" if cond else "FAIL"
    print(f"[{status}] {label}")
    if not cond:
        raise SystemExit(1)


def make_message(
    *,
    msg_id: int,
    author,
    content: str,
    reference_id: int | None = None,
    mentions=None,
    attachments=None,
):
    msg = MagicMock()
    msg.id = msg_id
    msg.author = author
    msg.content = content
    msg.created_at = datetime.now(timezone.utc)
    msg.mentions = mentions or []
    msg.attachments = attachments or []
    if reference_id is not None:
        ref = MagicMock()
        ref.message_id = reference_id
        msg.reference = ref
    else:
        msg.reference = None
    return msg


def main() -> None:
    bot_user = MagicMock()
    bot_user.id = 999

    user_author = MagicMock()
    user_author.id = 100
    user_author.display_name = "Alice"

    # user_author != bot_user because MagicMock() instances are distinct.
    user_msg = make_message(msg_id=1, author=user_author, content="hey are you around?")
    item = HistItem.from_message(user_msg, bot_user)
    check("user HistItem is_bot False", item.is_bot is False)
    check("user HistItem label", item.label == "Alice (user:100)")
    check("user HistItem body", item.body == "hey are you around?")
    check("user HistItem parent_id None (no reference)", item.parent_id is None)

    bot_msg = make_message(
        msg_id=2, author=bot_user, content="**Nova** Always for you.", reference_id=1
    )
    bot_item = HistItem.from_message(bot_msg, bot_user)
    check("bot HistItem is_bot True", bot_item.is_bot is True)
    check("bot HistItem character_name parsed", bot_item.character_name == "Nova")
    check("bot HistItem body strips prefix", bot_item.body == "Always for you.")
    check("bot HistItem parent_id auto-derived", bot_item.parent_id == 1)

    # Explicit parent_id override (used for chunk chaining in on_message).
    chunk2 = make_message(msg_id=3, author=bot_user, content="continued...")
    chunk2_item = HistItem.from_message(chunk2, bot_user, parent_id=2)
    check("explicit parent_id override wins over reference", chunk2_item.parent_id == 2)
    check(
        "chunk with no bold prefix has no character_name (matches live-walk quirk)",
        chunk2_item.character_name is None,
    )

    node = bot_item.to_node_dict()
    check("to_node_dict parent_id stringified", node["parent_id"] == "1")
    restored = HistItem.from_node_dict(2, node)
    check("from_node_dict parent_id int", restored.parent_id == 1)

    # --- Simulate the on_message multi-character chunk-chaining algorithm ---
    # Two characters, first sends 2 chunks, second sends 1 chunk.
    char1_chunks = [
        make_message(msg_id=10, author=bot_user, content="**Nova** part one"),
        make_message(msg_id=11, author=bot_user, content="part two"),
    ]
    char2_chunks = [
        make_message(msg_id=12, author=bot_user, content="**Zeta** hello!"),
    ]

    chain_so_far: list[HistItem] = []
    pending_target_item = item  # the user's message HistItem
    turn_items: list[HistItem] = []
    target_id = 1  # user_msg.id

    for chunks in (char1_chunks, char2_chunks):
        chunk_items = []
        parent_id = target_id
        for sent_msg in chunks:
            chunk_items.append(HistItem.from_message(sent_msg, bot_user, parent_id=parent_id))
            parent_id = sent_msg.id

        chain_so_far.append(pending_target_item)
        chain_so_far.extend(chunk_items[:-1])
        turn_items.append(pending_target_item)
        turn_items.extend(chunk_items[:-1])
        pending_target_item = chunk_items[-1]
        target_id = chunks[-1].id

    turn_items.append(pending_target_item)

    check("turn_items has 4 nodes (user + 2 char1 chunks + 1 char2 chunk)", len(turn_items) == 4)
    ids = [ti.message_id for ti in turn_items]
    check("turn_items order is [1, 10, 11, 12]", ids == [1, 10, 11, 12])
    parents = {ti.message_id: ti.parent_id for ti in turn_items}
    check("chunk 10's parent is user msg 1", parents[10] == 1)
    check("chunk 11's parent is chunk 10", parents[11] == 10)
    check("chunk 12's parent is chunk 11 (last of char1)", parents[12] == 11)

    print("\nAll HistItem/chaining smoke checks passed.")


if __name__ == "__main__":
    main()
