from __future__ import annotations

import math
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key

from config import AWS_REGION, DYNAMODB_TABLE
from crypto_util import decrypt_api_key

_dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
_table = _dynamodb.Table(DYNAMODB_TABLE)


def _user_sk(discord_id: str | int) -> str:
    return f"USERID#{discord_id}"


def _char_sk(owner_id: str | int, slug: str) -> str:
    return f"USERID#{owner_id}#CHAR#{slug}"


def get_user(discord_id: str | int) -> dict[str, Any] | None:
    resp = _table.get_item(Key={"pk": "USERS", "sk": _user_sk(discord_id)})
    return resp.get("Item")


def get_user_api_key(discord_id: str | int) -> str:
    user = get_user(discord_id)
    if not user:
        return ""
    enc = user.get("openRouterApiKey") or ""
    if not enc:
        return ""
    try:
        return decrypt_api_key(enc)
    except Exception:
        return ""


def get_guild_config(guild_id: str | int) -> dict[str, Any] | None:
    resp = _table.get_item(Key={"pk": "GUILDS", "sk": f"GUILDID#{guild_id}"})
    return resp.get("Item")


def get_character(owner_id: str | int, slug: str) -> dict[str, Any] | None:
    resp = _table.get_item(Key={"pk": "USERS", "sk": _char_sk(owner_id, slug)})
    return resp.get("Item")


def list_characters_for_user(discord_id: str | int) -> list[dict[str, Any]]:
    resp = _table.query(
        KeyConditionExpression=Key("pk").eq("USERS")
        & Key("sk").begins_with(f"USERID#{discord_id}#CHAR#"),
    )
    # A character SK is exactly USERID#{owner}#CHAR#{slug}. Skip sub-items such as
    # #KNOWN# entries and #SERVER#...#MEMORY# records, which have a further "#".
    chars = []
    for item in resp.get("Items", []):
        slug_part = item["sk"].split("#CHAR#", 1)[-1]
        if slug_part and "#" not in slug_part:
            chars.append(item)
    return chars


def list_known_users(owner_id: str | int, slug: str) -> list[dict[str, Any]]:
    prefix = f"USERID#{owner_id}#CHAR#{slug}#KNOWN#"
    resp = _table.query(
        KeyConditionExpression=Key("pk").eq("USERS") & Key("sk").begins_with(prefix),
    )
    return resp.get("Items", [])


def get_guild_linked_user_ids(guild_id: str | int) -> list[str]:
    resp = _table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("gsi1pk").eq(f"GUILD#{guild_id}"),
    )
    ids: list[str] = []
    for item in resp.get("Items", []):
        sk = item.get("sk", "")
        if sk.startswith("USERID#") and "#GUILD#" in sk:
            ids.append(sk.split("#GUILD#")[0].replace("USERID#", ""))
    return ids


def list_server_characters(guild_id: str | int) -> list[dict[str, Any]]:
    chars: list[dict[str, Any]] = []
    seen: set[str] = set()
    for uid in get_guild_linked_user_ids(guild_id):
        user = get_user(uid)
        if not user or not user.get("approved"):
            continue
        for char in list_characters_for_user(uid):
            key = f"{uid}:{char.get('slug')}"
            if key not in seen:
                seen.add(key)
                char = dict(char)
                char["ownerDiscordId"] = uid
                chars.append(char)
    return chars


def find_character_by_display_name(
    guild_id: str | int, display_name: str
) -> dict[str, Any] | None:
    target = display_name.strip().lower()
    for char in list_server_characters(guild_id):
        if (char.get("displayName") or "").strip().lower() == target:
            return char
        if (char.get("slug") or "").strip().lower() == target:
            return char
    return None


def link_guild_to_user(discord_id: str | int, guild_id: str | int) -> None:
    _table.put_item(
        Item={
            "pk": "USERS",
            "sk": f"USERID#{discord_id}#GUILD#{guild_id}",
            "gsi1pk": f"GUILD#{guild_id}",
            "gsi1sk": _user_sk(discord_id),
            "discordId": str(discord_id),
            "guildId": str(guild_id),
        }
    )


def get_guild_active_characters(cfg: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Normalize a guild config into an ordered list of active characters.

    Prefers the new ``activeCharacters`` list, falling back to the legacy single
    ``activeOwnerDiscordId``/``activeCharacterSlug`` fields as a 1-element list.
    """
    if not cfg:
        return []
    chars = cfg.get("activeCharacters")
    if isinstance(chars, list) and chars:
        result: list[dict[str, Any]] = []
        for entry in chars:
            owner = entry.get("ownerDiscordId")
            slug = entry.get("slug")
            if owner and slug:
                result.append(
                    {
                        "ownerDiscordId": str(owner),
                        "slug": str(slug),
                        "displayName": entry.get("displayName") or str(slug),
                    }
                )
        if result:
            return result
    owner_id = cfg.get("activeOwnerDiscordId")
    slug = cfg.get("activeCharacterSlug")
    if owner_id and slug:
        return [
            {
                "ownerDiscordId": str(owner_id),
                "slug": str(slug),
                "displayName": str(slug),
            }
        ]
    return []


def set_guild_active_characters(
    guild_id: str | int,
    characters: list[dict[str, Any]],
    updated_by: str | int,
) -> None:
    from datetime import datetime, timezone

    normalized = [
        {
            "ownerDiscordId": str(c["ownerDiscordId"]),
            "slug": str(c["slug"]),
            "displayName": str(c.get("displayName") or c["slug"]),
        }
        for c in characters
    ]
    item: dict[str, Any] = {
        "pk": "GUILDS",
        "sk": f"GUILDID#{guild_id}",
        "activeCharacters": normalized,
        "updatedByDiscordId": str(updated_by),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    if normalized:
        item["activeOwnerDiscordId"] = normalized[0]["ownerDiscordId"]
        item["activeCharacterSlug"] = normalized[0]["slug"]
    _table.put_item(Item=item)


def set_guild_active_character(
    guild_id: str | int,
    owner_id: str | int,
    slug: str,
    updated_by: str | int,
) -> None:
    set_guild_active_characters(
        guild_id,
        [{"ownerDiscordId": owner_id, "slug": slug, "displayName": slug}],
        updated_by,
    )


def get_thread_counter_key(guild_or_dm_key: str, root_message_id: int) -> dict[str, str]:
    return {"pk": "GUILDS", "sk": f"{guild_or_dm_key}#THREAD#{root_message_id}"}


def increment_thread_count(guild_or_dm_key: str, root_message_id: int) -> int:
    key = get_thread_counter_key(guild_or_dm_key, root_message_id)
    resp = _table.update_item(
        Key=key,
        UpdateExpression="SET messageCount = if_not_exists(messageCount, :zero) + :one",
        ExpressionAttributeValues={
            ":one": 1,
            ":zero": 0,
        },
        ReturnValues="UPDATED_NEW",
    )
    return int(resp["Attributes"]["messageCount"])


def get_thread_count(guild_or_dm_key: str, root_message_id: int) -> int:
    key = get_thread_counter_key(guild_or_dm_key, root_message_id)
    resp = _table.get_item(Key=key)
    item = resp.get("Item")
    return int(item["messageCount"]) if item else 0


def query_memories(
    owner_id: str | int, slug: str, server_id: str, memory_prefix: str
) -> list[dict[str, Any]]:
    prefix = f"USERID#{owner_id}#CHAR#{slug}#SERVER#{server_id}#{memory_prefix}"
    resp = _table.query(
        KeyConditionExpression=Key("pk").eq("USERS") & Key("sk").begins_with(prefix),
    )
    return sorted(resp.get("Items", []), key=lambda x: x.get("sk", ""))


def put_memory_item(item: dict[str, Any]) -> None:
    _table.put_item(Item=item)


def delete_memory_item(pk: str, sk: str) -> None:
    _table.delete_item(Key={"pk": pk, "sk": sk})


def update_usage(
    discord_id: str | int,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float = 0.0,
    cached_tokens: int = 0,
    cache_write_tokens: int = 0,
) -> None:
    _table.update_item(
        Key={"pk": "USERS", "sk": _user_sk(discord_id)},
        UpdateExpression=(
            "ADD usageInputTokens :i, usageOutputTokens :o, usageCostUsd :c, "
            "usageCachedTokens :ct, usageCacheWriteTokens :cw"
        ),
        ExpressionAttributeValues={
            ":i": input_tokens,
            ":o": output_tokens,
            ":c": Decimal(str(cost_usd)),
            ":ct": cached_tokens,
            ":cw": cache_write_tokens,
        },
    )


def get_user_preferred_model(discord_id: str | int, default: str) -> str:
    user = get_user(discord_id)
    preferred = (user or {}).get("preferredTextModel")
    return preferred or default


def token_estimate(text: str) -> int:
    return max(1, math.ceil(len(text) / 4))


def msgimg_sk(guild_or_dm_key: str, message_id: str | int) -> str:
    return f"{guild_or_dm_key}#MSGIMG#{message_id}"


def get_message_image_index(
    guild_or_dm_key: str, message_id: str | int
) -> dict[str, Any] | None:
    resp = _table.get_item(
        Key={"pk": "GUILDS", "sk": msgimg_sk(guild_or_dm_key, message_id)}
    )
    return resp.get("Item")


def put_message_image_index(
    guild_or_dm_key: str,
    message_id: str | int,
    *,
    descriptions: list[str],
    channel_id: str,
    image_count: int,
    indexed_by_owner_id: str,
) -> None:
    from datetime import datetime, timezone

    _table.put_item(
        Item={
            "pk": "GUILDS",
            "sk": msgimg_sk(guild_or_dm_key, message_id),
            "descriptions": descriptions,
            "messageId": str(message_id),
            "channelId": channel_id,
            "imageCount": image_count,
            "indexedByOwnerId": indexed_by_owner_id,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
    )


def update_character_fields(
    owner_id: str | int, slug: str, updates: dict[str, Any]
) -> None:
    sk = _char_sk(owner_id, slug)
    update_item_fields("USERS", sk, updates)


def update_item_fields(pk: str, sk: str, updates: dict[str, Any]) -> None:
    names: dict[str, str] = {}
    values: dict[str, Any] = {}
    parts: list[str] = []
    for i, (key, val) in enumerate(updates.items()):
        nk = f"#k{i}"
        vk = f":v{i}"
        names[nk] = key
        values[vk] = val
        parts.append(f"{nk} = {vk}")
    _table.update_item(
        Key={"pk": pk, "sk": sk},
        UpdateExpression="SET " + ", ".join(parts),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


def query_approved_users() -> list[dict[str, Any]]:
    resp = _table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("gsi1pk").eq("APPROVAL#approved"),
    )
    return resp.get("Items", [])

