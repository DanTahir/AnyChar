import type { Session } from "next-auth";

import { config } from "./config";
import {
  charSk,
  deleteItem,
  getItem,
  knownSk,
  putItem,
  queryGsi1,
  queryPkSk,
  updateItem,
  userSk,
} from "./dynamo";
import { knownUserMaxLength, slugify } from "./schemas/character";

export type AppUser = {
  discordId: string;
  approved: boolean;
  admin: boolean;
  usageInputTokens: number;
  usageOutputTokens: number;
  usageCostUsd: number;
  usageCachedTokens: number;
  usageCacheWriteTokens: number;
  budgetUsd: number;
  preferredTextModel?: string;
  age18plus?: boolean;
};

export async function getAppUser(discordId: string): Promise<AppUser | null> {
  const item = await getItem("USERS", userSk(discordId));
  if (!item) return null;
  return {
    discordId,
    approved: Boolean(item.approved),
    admin: Boolean(item.admin),
    usageInputTokens: Number(item.usageInputTokens ?? 0),
    usageOutputTokens: Number(item.usageOutputTokens ?? 0),
    usageCostUsd: Number(item.usageCostUsd ?? 0),
    usageCachedTokens: Number(item.usageCachedTokens ?? 0),
    usageCacheWriteTokens: Number(item.usageCacheWriteTokens ?? 0),
    budgetUsd: Number(item.budgetUsd ?? config.budgetUsd),
    preferredTextModel:
      typeof item.preferredTextModel === "string" ? item.preferredTextModel : undefined,
    age18plus: typeof item.age18plus === "boolean" ? item.age18plus : undefined,
  };
}

export async function setUserAge18Plus(discordId: string, age18plus: boolean) {
  await updateItem(
    "USERS",
    userSk(discordId),
    "SET age18plus = :v",
    { ":v": age18plus },
  );
}

export async function raiseUserBudget(discordId: string, amount: number) {
  await updateItem(
    "USERS",
    userSk(discordId),
    "SET budgetUsd = if_not_exists(budgetUsd, :base) + :amt",
    { ":base": config.budgetUsd, ":amt": amount },
  );
}

export async function listPendingUsers() {
  return queryGsi1("APPROVAL#pending");
}

export async function listApprovedUsers() {
  return queryGsi1("APPROVAL#approved");
}

export function requireSession(session: Session | null) {
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session;
}

export async function requireApproved(session: Session | null) {
  const s = requireSession(session);
  const user = await getAppUser(s.user.id);
  if (!user?.approved) throw new Error("Not approved");
  return { session: s, user };
}

export async function requireAdmin(session: Session | null) {
  const { session: s, user } = await requireApproved(session);
  if (!user.admin) throw new Error("Forbidden");
  return { session: s, user };
}

export async function listCharacters(ownerId: string) {
  const items = await queryPkSk("USERS", `USERID#${ownerId}#CHAR#`);
  // A character SK is exactly USERID#{owner}#CHAR#{slug}. Anything with a further
  // "#" segment (e.g. #KNOWN#, #SERVER#...#MEMORY#) is a sub-item, not a character.
  return items.filter((i) => {
    const slugPart = String(i.sk).split("#CHAR#")[1] ?? "";
    return slugPart.length > 0 && !slugPart.includes("#");
  });
}

export async function getCharacter(ownerId: string, slug: string) {
  return getItem("USERS", charSk(ownerId, slug));
}

export async function listKnownUsers(ownerId: string, slug: string) {
  return queryPkSk("USERS", `USERID#${ownerId}#CHAR#${slug}#KNOWN#`);
}

export async function createCharacter(
  ownerId: string,
  data: {
    displayName: string;
    good: string;
    bad: string;
    description: string;
    replyStyle: string;
  },
) {
  const slug = slugify(data.displayName);
  if (!slug) throw new Error("Invalid character name");
  const existing = await getCharacter(ownerId, slug);
  if (existing) throw new Error("Character with this name already exists");

  await putItem({
    pk: "USERS",
    sk: charSk(ownerId, slug),
    slug,
    displayName: data.displayName,
    good: data.good,
    bad: data.bad,
    description: data.description,
    replyStyle: data.replyStyle,
    ownerDiscordId: ownerId,
  });

  await putItem({
    pk: "USERS",
    sk: knownSk(ownerId, slug, ownerId),
    knownUserId: ownerId,
    content: "",
  });

  return slug;
}

export async function updateCharacter(
  ownerId: string,
  slug: string,
  data: Partial<{
    displayName: string;
    good: string;
    bad: string;
    description: string;
    replyStyle: string;
  }>,
) {
  const char = await getCharacter(ownerId, slug);
  if (!char) throw new Error("Character not found");
  await putItem({
    ...char,
    ...data,
    pk: "USERS",
    sk: charSk(ownerId, slug),
  });
}

export async function deleteCharacter(ownerId: string, slug: string) {
  const known = await listKnownUsers(ownerId, slug);
  for (const k of known) {
    await deleteItem("USERS", k.sk as string);
  }
  await deleteItem("USERS", charSk(ownerId, slug));
}

export async function upsertKnownUser(
  ownerId: string,
  slug: string,
  knownUserId: string,
  content: string,
) {
  const known = await listKnownUsers(ownerId, slug);
  const exists = known.find((k) => k.knownUserId === knownUserId);
  if (!exists && known.length >= 5) {
    throw new Error("Maximum 5 Known Users per character");
  }
  const count = exists ? known.length : known.length + 1;
  const maxLen = knownUserMaxLength(count);
  if (content.length > maxLen) {
    throw new Error(`Known User content max ${maxLen} characters (${count} entries)`);
  }
  if (count > 1) {
    for (const k of known) {
      const c = k.knownUserId === knownUserId ? content : (k.content as string) ?? "";
      if (c.length > 500) {
        throw new Error("When multiple Known Users exist, each is limited to 500 characters");
      }
    }
  }

  await putItem({
    pk: "USERS",
    sk: knownSk(ownerId, slug, knownUserId),
    knownUserId,
    content,
    ...(exists?.imageS3Key ? { imageS3Key: exists.imageS3Key, imageContentType: exists.imageContentType } : {}),
  });
}

export async function deleteKnownUser(ownerId: string, slug: string, knownUserId: string) {
  if (knownUserId === ownerId) throw new Error("Cannot delete owner Known User entry");
  await deleteItem("USERS", knownSk(ownerId, slug, knownUserId));
}

export async function linkGuild(discordId: string, guildId: string) {
  await putItem({
    pk: "USERS",
    sk: `USERID#${discordId}#GUILD#${guildId}`,
    gsi1pk: `GUILD#${guildId}`,
    gsi1sk: userSk(discordId),
    discordId,
    guildId,
  });
}

export async function listLinkedGuilds(discordId: string) {
  const items = await queryPkSk("USERS", `USERID#${discordId}#GUILD#`);
  return items.map((i) => i.guildId as string);
}

export type ActiveCharacter = {
  ownerDiscordId: string;
  slug: string;
  displayName: string;
};

export async function setActiveGuildCharacter(
  guildId: string,
  ownerId: string,
  slug: string,
  updatedBy: string,
) {
  await putItem({
    pk: "GUILDS",
    sk: `GUILDID#${guildId}`,
    activeOwnerDiscordId: ownerId,
    activeCharacterSlug: slug,
    activeCharacters: [{ ownerDiscordId: ownerId, slug, displayName: slug }],
    updatedByDiscordId: updatedBy,
    updatedAt: new Date().toISOString(),
  });
}

export async function setActiveGuildCharacters(
  guildId: string,
  characters: ActiveCharacter[],
  updatedBy: string,
) {
  const item: Record<string, unknown> = {
    pk: "GUILDS",
    sk: `GUILDID#${guildId}`,
    activeCharacters: characters,
    updatedByDiscordId: updatedBy,
    updatedAt: new Date().toISOString(),
  };
  if (characters.length > 0) {
    item.activeOwnerDiscordId = characters[0].ownerDiscordId;
    item.activeCharacterSlug = characters[0].slug;
  }
  await putItem(item);
}

export async function getGuildActiveCharacters(
  guildId: string,
): Promise<ActiveCharacter[]> {
  const cfg = await getItem("GUILDS", `GUILDID#${guildId}`);
  if (!cfg) return [];
  const list = cfg.activeCharacters;
  if (Array.isArray(list) && list.length > 0) {
    return list
      .map((e) => ({
        ownerDiscordId: String((e as Record<string, unknown>).ownerDiscordId ?? ""),
        slug: String((e as Record<string, unknown>).slug ?? ""),
        displayName: String(
          (e as Record<string, unknown>).displayName ?? (e as Record<string, unknown>).slug ?? "",
        ),
      }))
      .filter((e) => e.ownerDiscordId && e.slug);
  }
  if (cfg.activeOwnerDiscordId && cfg.activeCharacterSlug) {
    return [
      {
        ownerDiscordId: String(cfg.activeOwnerDiscordId),
        slug: String(cfg.activeCharacterSlug),
        displayName: String(cfg.activeCharacterSlug),
      },
    ];
  }
  return [];
}

export async function listGuildLinkedUsers(guildId: string) {
  const items = await queryGsi1(`GUILD#${guildId}`);
  return items
    .map((i) => String(i.discordId ?? i.sk?.toString().split("#GUILD#")[0]?.replace("USERID#", "")))
    .filter(Boolean);
}

export async function listServerCharacters(guildId: string) {
  const userIds = await listGuildLinkedUsers(guildId);
  const chars = [];
  for (const uid of userIds) {
    const user = await getAppUser(uid);
    if (!user?.approved) continue;
    chars.push(...(await listCharacters(uid)));
  }
  return chars;
}

export async function setDmCharacter(discordId: string, slug: string) {
  const char = await getCharacter(discordId, slug);
  if (!char) throw new Error("Character not found");
  const { updateItem, userSk } = await import("./dynamo");
  await updateItem(
    "USERS",
    userSk(discordId),
    "SET dmCharacterSlug = :s, dmCharacterName = :n",
    { ":s": slug, ":n": char.displayName },
  );
}
