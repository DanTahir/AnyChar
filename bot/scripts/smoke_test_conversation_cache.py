"""Standalone smoke test for the pure-logic pieces of the conversation cache.

Doesn't touch Discord or AWS — just exercises HistItem serialization,
build_chain_from_tree, last_bot_message_text, and S3 key derivation with
synthetic data. Run with: python scripts/smoke_test_conversation_cache.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from messages import HistItem, hist_author_with_id, last_bot_message_text  # noqa: E402
import conversation_cache as cc  # noqa: E402


def check(label: str, cond: bool) -> None:
    status = "OK" if cond else "FAIL"
    print(f"[{status}] {label}")
    if not cond:
        raise SystemExit(1)


def main() -> None:
    # --- HistItem round-trip ---
    root = HistItem(
        message_id=1,
        author_id=100,
        is_bot=False,
        character_name=None,
        nick="Alice",
        label="Alice (user:100)",
        body="hey are you around?",
        created_at_ms=1000,
        parent_id=None,
    )
    reply = HistItem(
        message_id=2,
        author_id=999,
        is_bot=True,
        character_name="Nova",
        nick=None,
        label="Nova (a character, not a user)",
        body="Always for you.",
        created_at_ms=2000,
        parent_id=1,
    )
    node = reply.to_node_dict()
    check("to_node_dict has expected keys", set(node.keys()) == {
        "parent_id", "author_id", "is_bot", "character_name", "nick", "label",
        "body", "created_at_ms",
    })
    restored = HistItem.from_node_dict(2, node)
    check("round-trip preserves body", restored.body == reply.body)
    check("round-trip preserves is_bot", restored.is_bot == reply.is_bot)
    check("round-trip preserves parent_id", restored.parent_id == 1)
    check("round-trip preserves character_name", restored.character_name == "Nova")

    # --- hist_author_with_id ---
    known_users = [{"knownUserId": "100", "appearance": "(has red hair)"}]
    label = hist_author_with_id(root, known_users)
    check("known-user appearance appended", label == "Alice (user:100) (has red hair)")
    bot_label = hist_author_with_id(reply, known_users)
    check("bot label unaffected by known_users", bot_label == reply.label)

    # --- last_bot_message_text ---
    chain = [root, reply]
    check(
        "last_bot_message_text finds Nova's reply",
        last_bot_message_text(chain, character_name="Nova") == "Always for you.",
    )
    check(
        "last_bot_message_text returns None for unmatched character",
        last_bot_message_text(chain, character_name="Zeta") is None,
    )

    # --- build_chain_from_tree ---
    tree = {
        "context_id": "guild:123",
        "root_id": "1",
        "nodes": {
            "1": root.to_node_dict(),
            "2": reply.to_node_dict(),
        },
    }
    built = cc.build_chain_from_tree(tree, 2)
    check("build_chain_from_tree returns 2 nodes ending at msg 2", built is not None and len(built) == 2)
    check("build_chain_from_tree oldest-first order", built[0].message_id == 1 and built[1].message_id == 2)
    missing = cc.build_chain_from_tree(tree, 999)
    check("build_chain_from_tree returns None for unknown id", missing is None)

    # --- S3 key derivation ---
    guild_ctx = cc.context_key_for_guild(555)
    dm_ctx = cc.context_key_for_dm(777)
    check("guild context key format", guild_ctx == "guild:555")
    check("dm context key format", dm_ctx == "dm:777")
    check(
        "guild S3 key path",
        cc.s3_key_for(guild_ctx, 42) == "conversations/guilds/555/42.json",
    )
    check(
        "dm S3 key path",
        cc.s3_key_for(dm_ctx, 42) == "conversations/dms/777/42.json",
    )

    # --- in-memory index behavior ---
    cc._index_tree("guild:555", 1, tree)
    check("lookup resolves cached root node", cc.lookup(1) == ("guild:555", 1))
    check("lookup resolves cached reply node", cc.lookup(2) == ("guild:555", 1))
    check("is_known_bot_message true for bot node", cc.is_known_bot_message(2) is True)
    check("is_known_bot_message false for user node", cc.is_known_bot_message(1) is False)

    print("\nAll smoke checks passed.")


if __name__ == "__main__":
    main()
