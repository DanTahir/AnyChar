import { randomBytes } from "crypto";

import {
  charSk,
  deleteItem,
  getItem,
  publicCharSk,
  putItem,
  queryPkSkAll,
  updateItem,
} from "./dynamo";
import {
  characterImageKey,
  copyImage,
  deleteImage,
  extForType,
  publicCharacterImageKey,
} from "./s3";
import { hatesOf, lovesOf, slugify } from "./schemas/character";
import { createCharacter, getCharacter, listCharacters } from "./users";

/**
 * Public characters live under their own partition:
 *   pk = "PUBLIC", sk = "PUBCHAR#{publicId}"
 * Each item is a snapshot of a non-adult character (no known users, no memories).
 * The portrait is copied to public-characters/{publicId}/avatar.{ext} so the
 * public copy is independent of the author's own character.
 */
export const PUBLIC_PK = "PUBLIC";

export type PublicCharacter = {
  publicId: string;
  displayName: string;
  description: string;
  loves: string;
  hates: string;
  replyStyle: string;
  memoryLevel: string;
  hasImage: boolean;
  authorDiscordId: string;
  authorName: string;
  downloads: number;
  createdAt: string;
  updatedAt: string;
};

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function toPublic(item: Record<string, unknown>): PublicCharacter {
  return {
    publicId: str(item.publicId),
    displayName: str(item.displayName),
    description: str(item.description),
    loves: str(item.loves),
    hates: str(item.hates),
    replyStyle: str(item.replyStyle, "semi-lit"),
    memoryLevel: str(item.memoryLevel, "medium"),
    hasImage: Boolean(item.imageS3Key),
    authorDiscordId: str(item.authorDiscordId),
    authorName: str(item.authorName, "Unknown"),
    downloads: Number(item.downloads ?? 0),
    createdAt: str(item.createdAt),
    updatedAt: str(item.updatedAt),
  };
}

export async function listPublicCharacters(): Promise<PublicCharacter[]> {
  const items = await queryPkSkAll(PUBLIC_PK, "PUBCHAR#");
  return items
    .map(toPublic)
    .filter((c) => c.publicId)
    .sort(
      (a, b) => b.downloads - a.downloads || a.displayName.localeCompare(b.displayName),
    );
}

export async function getPublicCharacterItem(publicId: string) {
  return getItem(PUBLIC_PK, publicCharSk(publicId));
}

function newPublicId(slug: string) {
  return `${slug.slice(0, 60)}-${randomBytes(4).toString("hex")}`;
}

/**
 * Publishes (or refreshes) a public snapshot of one of the owner's characters.
 * Adult characters are rejected.
 */
export async function publishCharacter(ownerId: string, slug: string, authorName: string) {
  const char = await getCharacter(ownerId, slug);
  if (!char) throw new Error("Character not found");
  if (char.adultCharacter === true) {
    throw new Error(
      'Adult characters can\'t be made public. Uncheck "Adult character" first.',
    );
  }

  let existing = char.publicId ? await getPublicCharacterItem(String(char.publicId)) : undefined;
  if (existing && existing.authorDiscordId !== ownerId) existing = undefined;
  const publicId = existing ? String(existing.publicId) : newPublicId(slug);

  let imageS3Key: string | undefined;
  let imageContentType: string | undefined;
  if (char.imageS3Key) {
    const ext = extForType(str(char.imageContentType, "image/jpeg"));
    const key = publicCharacterImageKey(publicId, ext);
    const ct = await copyImage(String(char.imageS3Key), key);
    if (ct) {
      imageS3Key = key;
      imageContentType = ct;
    }
  }
  if (existing?.imageS3Key && existing.imageS3Key !== imageS3Key) {
    await deleteImage(String(existing.imageS3Key));
  }

  const now = new Date().toISOString();
  await putItem({
    pk: PUBLIC_PK,
    sk: publicCharSk(publicId),
    publicId,
    displayName: str(char.displayName, slug),
    description: str(char.description),
    loves: lovesOf(char),
    hates: hatesOf(char),
    replyStyle: str(char.replyStyle, "semi-lit"),
    memoryLevel: str(char.memoryLevel, "medium"),
    appearance: str(char.appearance) || undefined,
    imageS3Key,
    imageContentType,
    authorDiscordId: ownerId,
    authorName: authorName || "Unknown",
    sourceSlug: slug,
    downloads: Number(existing?.downloads ?? 0),
    createdAt: str(existing?.createdAt) || now,
    updatedAt: now,
  });

  if (char.publicId !== publicId) {
    await updateItem("USERS", charSk(ownerId, slug), "SET publicId = :p", { ":p": publicId });
  }
  return { publicId, updated: Boolean(existing) };
}

/** Removes a public character. Only its author or an admin may do this. */
export async function removePublicCharacter(
  publicId: string,
  requester: { id: string; admin: boolean },
) {
  const item = await getPublicCharacterItem(publicId);
  if (!item) throw new Error("Public character not found");
  if (item.authorDiscordId !== requester.id && !requester.admin) throw new Error("Forbidden");

  if (item.imageS3Key) await deleteImage(String(item.imageS3Key));
  await deleteItem(PUBLIC_PK, publicCharSk(publicId));

  // Clear the link on the author's source character, if it still points here.
  const authorId = str(item.authorDiscordId);
  const sourceSlug = str(item.sourceSlug);
  if (authorId && sourceSlug) {
    const src = await getCharacter(authorId, sourceSlug);
    if (src?.publicId === publicId) {
      await updateItem("USERS", charSk(authorId, sourceSlug), "REMOVE publicId");
    }
  }
}

/** Removes the public copy of one of the owner's own characters, if any. */
export async function unpublishCharacter(ownerId: string, slug: string) {
  const char = await getCharacter(ownerId, slug);
  if (!char) throw new Error("Character not found");
  if (!char.publicId) return;
  const publicId = String(char.publicId);
  if (await getPublicCharacterItem(publicId)) {
    await removePublicCharacter(publicId, { id: ownerId, admin: false });
  } else {
    await updateItem("USERS", charSk(ownerId, slug), "REMOVE publicId");
  }
}

function nameKey(name: string) {
  return name.trim().toLowerCase();
}

/** Slugs and display names already used by the owner's characters. */
async function takenNames(ownerId: string) {
  const chars = await listCharacters(ownerId);
  return {
    slugs: new Set(chars.map((c) => str(c.slug))),
    names: new Set(chars.map((c) => nameKey(str(c.displayName)))),
  };
}

function isTaken(taken: { slugs: Set<string>; names: Set<string> }, name: string) {
  return taken.slugs.has(slugify(name)) || taken.names.has(nameKey(name));
}

function suggestFreeName(taken: { slugs: Set<string>; names: Set<string> }, base: string) {
  const trimmed = base.trim().slice(0, 95);
  for (let n = 2; n < 1000; n++) {
    const candidate = `${trimmed} ${n}`;
    if (!isTaken(taken, candidate)) return candidate;
  }
  return `${trimmed} ${randomBytes(2).toString("hex")}`;
}

export type DownloadResult =
  | { ok: true; slug: string; displayName: string }
  | { ok: false; error: string; suggestedName: string };

/**
 * Copies a public character (including its portrait and appearance text) into
 * the user's own characters. If the user already has a character with the same
 * name (or slug), nothing is created and a free suggested name is returned so
 * the user can pick a different one.
 */
export async function downloadPublicCharacter(
  publicId: string,
  ownerId: string,
  requestedName?: string,
): Promise<DownloadResult> {
  const item = await getPublicCharacterItem(publicId);
  if (!item) throw new Error("Public character not found");

  const displayName = (requestedName ?? str(item.displayName)).trim();
  if (!displayName || displayName.length > 100) {
    throw new Error("Name must be 1-100 characters");
  }
  const slug = slugify(displayName);
  if (!slug) throw new Error("Invalid character name");

  const taken = await takenNames(ownerId);
  if (isTaken(taken, displayName)) {
    return {
      ok: false,
      error: `You already have a character named "${displayName}". Pick a different name.`,
      suggestedName: suggestFreeName(taken, displayName),
    };
  }

  await createCharacter(ownerId, {
    displayName,
    loves: str(item.loves),
    hates: str(item.hates),
    description: str(item.description),
    replyStyle: str(item.replyStyle, "semi-lit"),
    memoryLevel: str(item.memoryLevel, "medium"),
    // Public characters are never adult; the copy starts non-adult too.
    adultCharacter: false,
  });

  const sets: string[] = ["sourcePublicId = :src"];
  const values: Record<string, unknown> = { ":src": publicId };
  if (item.imageS3Key) {
    const ext = extForType(str(item.imageContentType, "image/jpeg"));
    const key = characterImageKey(ownerId, slug, ext);
    const ct = await copyImage(String(item.imageS3Key), key);
    if (ct) {
      sets.push("imageS3Key = :k", "imageContentType = :t");
      values[":k"] = key;
      values[":t"] = ct;
    }
  }
  if (str(item.appearance)) {
    sets.push("appearance = :a");
    values[":a"] = str(item.appearance);
  }
  await updateItem("USERS", charSk(ownerId, slug), `SET ${sets.join(", ")}`, values);

  await updateItem(PUBLIC_PK, publicCharSk(publicId), "ADD downloads :one", { ":one": 1 });
  return { ok: true, slug, displayName };
}
