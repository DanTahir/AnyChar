#!/usr/bin/env python3
"""One-time backfill of appearance text for characters and known users with images."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from appearance import describe_character_portrait, describe_known_user_portrait
from dynamo import (
    get_user,
    get_user_api_key,
    list_characters_for_user,
    list_known_users,
    query_approved_users,
    update_character_fields,
    update_item_fields,
)
from s3_images import fetch_image_data_url
from usage import is_over_budget


async def backfill_character(char: dict, owner_id: str, *, dry_run: bool) -> bool:
    if not char.get("imageS3Key") or char.get("appearance"):
        return False
    slug = char.get("slug") or char["sk"].split("#CHAR#")[-1].split("#")[0]
    if dry_run:
        print(f"[dry-run] would backfill character {owner_id}/{slug}")
        return True
    api_key = get_user_api_key(owner_id)
    if not api_key:
        print(f"skip {owner_id}/{slug}: no API key")
        return False
    user = get_user(owner_id)
    if is_over_budget(user):
        print(f"skip {owner_id}/{slug}: over budget")
        return False
    data_url = fetch_image_data_url(
        char.get("imageS3Key", ""), char.get("imageContentType")
    )
    if not data_url:
        print(f"skip {owner_id}/{slug}: S3 fetch failed")
        return False
    appearance = await describe_character_portrait(
        api_key=api_key,
        owner_discord_id=owner_id,
        data_url=data_url,
    )
    if not appearance:
        print(f"skip {owner_id}/{slug}: empty appearance")
        return False
    update_character_fields(owner_id, slug, {"appearance": appearance})
    print(f"ok character {owner_id}/{slug} ({len(appearance)} chars)")
    return True


async def backfill_known_user(
    ku: dict, owner_id: str, slug: str, *, dry_run: bool
) -> bool:
    if not ku.get("imageS3Key") or ku.get("appearance"):
        return False
    ku_id = ku.get("knownUserId") or ku["sk"].split("#KNOWN#")[-1]
    if dry_run:
        print(f"[dry-run] would backfill known user {owner_id}/{slug}/{ku_id}")
        return True
    api_key = get_user_api_key(owner_id)
    if not api_key:
        print(f"skip known {owner_id}/{ku_id}: no API key")
        return False
    user = get_user(owner_id)
    if is_over_budget(user):
        print(f"skip known {owner_id}/{ku_id}: over budget")
        return False
    data_url = fetch_image_data_url(ku.get("imageS3Key", ""), ku.get("imageContentType"))
    if not data_url:
        print(f"skip known {owner_id}/{ku_id}: S3 fetch failed")
        return False
    appearance = await describe_known_user_portrait(
        api_key=api_key,
        owner_discord_id=owner_id,
        data_url=data_url,
    )
    if not appearance:
        print(f"skip known {owner_id}/{ku_id}: empty appearance")
        return False
    update_item_fields("USERS", ku["sk"], {"appearance": appearance})
    print(f"ok known user {owner_id}/{slug}/{ku_id} ({len(appearance)} chars)")
    return True


async def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill appearance descriptions")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--owner-id", help="Process only this Discord user ID")
    parser.add_argument("--limit", type=int, default=0, help="Max items to process")
    args = parser.parse_args()

    users = query_approved_users()
    if args.owner_id:
        users = [u for u in users if str(u.get("discordId") or u["sk"].replace("USERID#", "")) == args.owner_id]

    processed = 0
    for user in users:
        owner_id = str(user.get("discordId") or user["sk"].replace("USERID#", ""))
        for char in list_characters_for_user(owner_id):
            if args.limit and processed >= args.limit:
                return
            if await backfill_character(char, owner_id, dry_run=args.dry_run):
                processed += 1
            slug = char.get("slug") or char["sk"].split("#CHAR#")[-1].split("#")[0]
            for ku in list_known_users(owner_id, slug):
                if args.limit and processed >= args.limit:
                    return
                if await backfill_known_user(ku, owner_id, slug, dry_run=args.dry_run):
                    processed += 1

    print(f"Done. Processed {processed} item(s).")


if __name__ == "__main__":
    asyncio.run(main())
