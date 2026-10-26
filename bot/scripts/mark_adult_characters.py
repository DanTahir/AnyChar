#!/usr/bin/env python3
"""One-time migration: mark every existing character owned by an adult user
(``age18plus == True``) as an adult character (``adultCharacter = True``).

Since the per-character flag was introduced, the permissive content policy
requires both the owner's ``age18plus`` and the character's ``adultCharacter``.
This preserves the previous behaviour for characters that already existed.

Uses only Query/GetItem/UpdateItem (the EC2 role has no Scan permission).

    python scripts/mark_adult_characters.py --dry-run
    python scripts/mark_adult_characters.py
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from boto3.dynamodb.conditions import Key

import dynamo
from dynamo import get_user, list_characters_for_user, update_character_fields


def _query_users_by_approval(status: str) -> list[dict]:
    items: list[dict] = []
    kwargs = {
        "IndexName": "GSI1",
        "KeyConditionExpression": Key("gsi1pk").eq(f"APPROVAL#{status}"),
    }
    while True:
        resp = dynamo._table.query(**kwargs)
        items.extend(resp.get("Items", []))
        last = resp.get("LastEvaluatedKey")
        if not last:
            return items
        kwargs["ExclusiveStartKey"] = last


def _user_id(item: dict) -> str:
    return str(item.get("discordId") or item["sk"].replace("USERID#", "", 1))


def main() -> None:
    parser = argparse.ArgumentParser(description="Mark adult users' characters as adult")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    user_ids: list[str] = []
    seen: set[str] = set()
    for status in ("approved", "pending"):
        for item in _query_users_by_approval(status):
            uid = _user_id(item)
            if uid not in seen:
                seen.add(uid)
                user_ids.append(uid)

    adult_users = 0
    marked = 0
    already = 0
    for uid in user_ids:
        user = get_user(uid)
        if not user or user.get("age18plus") is not True:
            continue
        adult_users += 1
        for char in list_characters_for_user(uid):
            slug = char.get("slug") or char["sk"].split("#CHAR#", 1)[-1]
            name = char.get("displayName") or slug
            if char.get("adultCharacter") is True:
                already += 1
                print(f"already adult {uid}/{slug} ({name})")
                continue
            if args.dry_run:
                print(f"[dry-run] would mark {uid}/{slug} ({name})")
            else:
                update_character_fields(uid, slug, {"adultCharacter": True})
                print(f"marked {uid}/{slug} ({name})")
            marked += 1

    verb = "Would mark" if args.dry_run else "Marked"
    print(
        f"Done. Users scanned: {len(user_ids)}, adult users: {adult_users}. "
        f"{verb} {marked} character(s); {already} already adult."
    )


if __name__ == "__main__":
    main()
