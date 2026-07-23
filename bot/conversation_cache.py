"""S3-backed conversation tree cache.

Each Discord reply-chain ("thread") the bot has responded to is persisted as
a single JSON tree file in S3, scoped by guild (or DM'ing user) and root
message id — not per character, since a single guild reply chain can involve
up to 3 differently-owned characters replying in sequence.

A short-lived in-memory index (message id -> (context_id, root_id), plus a
set of bot-authored message ids and per-tree last-activity timestamps) lets
the bot recognize a cache hit for an incoming reply without touching S3 on
every message. Index entries age out after CONVERSATION_TTL_SECONDS of
inactivity; the S3 file itself is never deleted on expiry, only forgotten
from memory. If a message later replies into an expired/unknown tree, the
caller falls back to the existing live Discord walk-back and this module's
`record_turn` overwrites the S3 file fresh (see main.py).

Concurrency: this bot runs as a single pm2 process on one EC2 host, so a
per-(context, root) `asyncio.Lock` is sufficient to serialize read-modify-
write of a tree's S3 object. This does not generalize to horizontal scaling.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any

import boto3
from botocore.exceptions import ClientError

from config import (
    AWS_REGION,
    CONVERSATION_S3_PREFIX,
    CONVERSATION_TTL_SECONDS,
    S3_BUCKET,
)
from messages import HistItem

# message_id -> (context_id, root_id)
_index: dict[int, tuple[str, int]] = {}
# Subset of _index keys known to be authored by the bot.
_bot_message_ids: set[int] = set()
# (context_id, root_id) -> last activity time in ms, used for TTL eviction.
_last_activity_ms: dict[tuple[str, int], int] = {}
# (context_id, root_id) -> set of message ids currently indexed for that tree,
# so cleanup can purge every id belonging to an expired tree.
_tree_message_ids: dict[tuple[str, int], set[int]] = {}
# Per-tree locks guarding S3 read-modify-write.
_locks: dict[tuple[str, int], asyncio.Lock] = {}
# Held for the duration of a cleanup sweep.
_cleanup_lock = asyncio.Lock()


def _now_ms() -> int:
    return int(time.time() * 1000)


def context_key_for_guild(guild_id: int) -> str:
    return f"guild:{guild_id}"


def context_key_for_dm(user_id: int | str) -> str:
    return f"dm:{user_id}"


def s3_key_for(context_id: str, root_id: int) -> str:
    kind, _, ident = context_id.partition(":")
    if kind == "dm":
        return f"{CONVERSATION_S3_PREFIX}/dms/{ident}/{root_id}.json"
    return f"{CONVERSATION_S3_PREFIX}/guilds/{ident}/{root_id}.json"


def _get_lock(context_id: str, root_id: int) -> asyncio.Lock:
    key = (context_id, root_id)
    lock = _locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _locks[key] = lock
    return lock


def _get_client():
    return boto3.client("s3", region_name=AWS_REGION)


def _get_object_sync(key: str) -> dict[str, Any] | None:
    if not S3_BUCKET:
        return None
    client = _get_client()
    try:
        resp = client.get_object(Bucket=S3_BUCKET, Key=key)
        body = resp["Body"].read()
        return json.loads(body)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ("NoSuchKey", "404"):
            return None
        print(f"Conversation cache: S3 get_object error for {key}: {e!r}")
        return None
    except Exception as e:
        print(f"Conversation cache: failed to parse tree at {key}: {e!r}")
        return None


def _put_object_sync(key: str, tree: dict[str, Any]) -> None:
    if not S3_BUCKET:
        return
    client = _get_client()
    client.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=json.dumps(tree).encode("utf-8"),
        ContentType="application/json",
    )


async def load_tree(context_id: str, root_id: int) -> dict[str, Any] | None:
    key = s3_key_for(context_id, root_id)
    return await asyncio.to_thread(_get_object_sync, key)


async def save_tree(context_id: str, root_id: int, tree: dict[str, Any]) -> None:
    key = s3_key_for(context_id, root_id)
    await asyncio.to_thread(_put_object_sync, key, tree)


def _index_tree(context_id: str, root_id: int, tree: dict[str, Any]) -> None:
    """Register every node id in ``tree`` in the in-memory index."""
    tree_key = (context_id, root_id)
    ids = _tree_message_ids.setdefault(tree_key, set())
    for id_str, node in (tree.get("nodes") or {}).items():
        try:
            msg_id = int(id_str)
        except (TypeError, ValueError):
            continue
        _index[msg_id] = (context_id, root_id)
        ids.add(msg_id)
        if node.get("is_bot"):
            _bot_message_ids.add(msg_id)
    _last_activity_ms[tree_key] = _now_ms()


def lookup(reference_message_id: int) -> tuple[str, int] | None:
    """Return (context_id, root_id) if this message id is a known cached node."""
    return _index.get(reference_message_id)


def is_known_bot_message(message_id: int) -> bool:
    return message_id in _bot_message_ids


def build_chain_from_tree(
    tree: dict[str, Any], from_message_id: int
) -> list[HistItem] | None:
    """Build the oldest-first ancestry chain ending at ``from_message_id``.

    ``from_message_id`` is normally ``message.reference.message_id`` — the
    message being replied to. The returned chain INCLUDES that node (it's
    part of the conversation history) plus all of its ancestors, exactly
    matching what ``fetch_reply_chain(message)`` would return for the new
    message that references it. Returns ``None`` if ``from_message_id``
    isn't present in the tree (caller should fall back to a live walk).
    """
    nodes = tree.get("nodes") or {}
    start_key = str(from_message_id)
    if start_key not in nodes:
        return None

    chain: list[HistItem] = []
    parent_id = nodes[start_key].get("parent_id")
    while parent_id is not None:
        node = nodes.get(str(parent_id))
        if node is None:
            break
        chain.insert(0, HistItem.from_node_dict(int(parent_id), node))
        parent_id = node.get("parent_id")
    chain.append(HistItem.from_node_dict(from_message_id, nodes[start_key]))
    return chain


async def record_turn(
    context_id: str,
    root_id: int,
    new_items: list[HistItem],
    *,
    is_fresh_tree: bool,
) -> None:
    """Persist ``new_items`` into the tree for (context_id, root_id).

    When ``is_fresh_tree`` is True (cache-miss/expired fallback), ``new_items``
    must be the FULL reconstructed chain (all ancestors) plus the new turn —
    this overwrites any stale S3 file for the tree, per the accepted product
    behavior (see plan risks: sibling branches in the old file are dropped).

    When ``is_fresh_tree`` is False (continuing an already-cached tree),
    ``new_items`` should just be the newly created nodes for this turn; the
    current S3 content is re-read fresh under the lock and merged in, so a
    concurrent reply into the same still-active tree can't clobber this one.
    """
    if not new_items:
        return

    lock = _get_lock(context_id, root_id)
    async with lock:
        if is_fresh_tree:
            tree: dict[str, Any] = {
                "context_id": context_id,
                "root_id": str(root_id),
                "nodes": {},
            }
        else:
            tree = await load_tree(context_id, root_id) or {
                "context_id": context_id,
                "root_id": str(root_id),
                "nodes": {},
            }

        for item in new_items:
            tree["nodes"][str(item.message_id)] = item.to_node_dict()

        await save_tree(context_id, root_id, tree)
        _index_tree(context_id, root_id, tree)


async def cleanup_loop() -> None:
    from config import CONVERSATION_CLEANUP_INTERVAL_SECONDS

    while True:
        await asyncio.sleep(CONVERSATION_CLEANUP_INTERVAL_SECONDS)
        try:
            await _run_cleanup_pass()
        except Exception as e:
            print(f"Conversation cache cleanup error: {e!r}")


async def _run_cleanup_pass() -> None:
    async with _cleanup_lock:
        now_ms = _now_ms()
        expired: list[tuple[str, int]] = []
        for tree_key, last_ms in list(_last_activity_ms.items()):
            if (now_ms - last_ms) > (CONVERSATION_TTL_SECONDS * 1000):
                expired.append(tree_key)

        purged_trees = 0
        purged_ids = 0
        for tree_key in expired:
            lock = _locks.get(tree_key)
            if lock is not None and lock.locked():
                # Being actively written right now — skip, try again next pass.
                continue
            ids = _tree_message_ids.pop(tree_key, set())
            for msg_id in ids:
                _index.pop(msg_id, None)
                _bot_message_ids.discard(msg_id)
                purged_ids += 1
            _last_activity_ms.pop(tree_key, None)
            _locks.pop(tree_key, None)
            purged_trees += 1

        if purged_trees:
            print(
                f"Conversation cache cleanup: purged {purged_trees} idle tree(s), "
                f"{purged_ids} message id(s) from memory (S3 files left in place)"
            )
