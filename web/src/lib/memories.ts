import { deleteItem, queryPkSk } from "./dynamo";
import { fetchGuildName } from "./discord-bot";
import type { MemoryListItem, MemoryServerOption } from "./schemas/memory";

const PAGE_SIZE = 20;

function charServerPrefix(ownerId: string, slug: string) {
  return `USERID#${ownerId}#CHAR#${slug}#SERVER#`;
}

function memoryPrefix(ownerId: string, slug: string, serverId: string, tier: "short" | "long") {
  const suffix = tier === "short" ? "MEMORY#" : "MEMORYLT#";
  return `${charServerPrefix(ownerId, slug)}${serverId}#${suffix}`;
}

function isMemorySk(sk: string): boolean {
  return sk.includes("#MEMORY#") || sk.includes("#MEMORYLT#");
}

function extractServerId(sk: string, ownerId: string, slug: string): string | null {
  const prefix = charServerPrefix(ownerId, slug);
  if (!sk.startsWith(prefix)) return null;
  const rest = sk.slice(prefix.length);
  const idx = rest.indexOf("#MEMORY");
  if (idx === -1) return null;
  return rest.slice(0, idx);
}

function memoryTimestamp(item: Record<string, unknown>): number {
  const createdAt = item.createdAt;
  if (typeof createdAt === "string") {
    const ms = Date.parse(createdAt);
    if (!Number.isNaN(ms)) return ms;
  }

  const sk = String(item.sk ?? "");
  if (sk.includes("#MEMORYLT#")) {
    const tail = sk.split("#MEMORYLT#")[1];
    const ts = parseInt(tail?.split("#")[0] ?? "", 10);
    if (!Number.isNaN(ts)) return ts;
  }
  if (sk.includes("#MEMORY#")) {
    const tail = sk.split("#MEMORY#")[1];
    const ts = parseInt(tail?.split("#")[0] ?? "", 10);
    if (!Number.isNaN(ts)) return ts;
  }
  return 0;
}

function parseMemorySk(sk: string): {
  tier: "short" | "long";
  threadRootMessageId: string | null;
  lastHumanUserId: string | null;
} {
  if (sk.includes("#MEMORYLT#")) {
    return { tier: "long", threadRootMessageId: null, lastHumanUserId: null };
  }

  if (sk.includes("#MEMORY#")) {
    const parts = sk.split("#MEMORY#")[1]?.split("#") ?? [];
    return {
      tier: "short",
      threadRootMessageId: parts[1] ?? null,
      lastHumanUserId: parts[2] ?? null,
    };
  }

  throw new Error("Invalid memory sort key");
}

export function parseMemoryItem(
  item: Record<string, unknown>,
  ownerId: string,
  slug: string,
): MemoryListItem {
  const sk = String(item.sk ?? "");
  const serverId = extractServerId(sk, ownerId, slug);
  if (!serverId) throw new Error("Invalid memory sort key");

  const parsed = parseMemorySk(sk);
  const threadRoot =
    item.threadRootMessageId != null
      ? String(item.threadRootMessageId)
      : parsed.threadRootMessageId;

  return {
    sk,
    tier: parsed.tier,
    serverId,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
    threadRootMessageId: parsed.tier === "short" ? threadRoot : null,
    lastHumanUserId: parsed.lastHumanUserId,
    content: String(item.content ?? ""),
  };
}

function sortNewestFirst(items: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...items].sort((a, b) => memoryTimestamp(b) - memoryTimestamp(a));
}

export async function listMemoryServerIds(ownerId: string, slug: string): Promise<string[]> {
  const items = await queryPkSk("USERS", charServerPrefix(ownerId, slug));
  const ids = new Set<string>();
  for (const item of items) {
    const sk = String(item.sk ?? "");
    if (!isMemorySk(sk)) continue;
    const serverId = extractServerId(sk, ownerId, slug);
    if (serverId) ids.add(serverId);
  }
  return Array.from(ids).sort((a, b) => {
    if (a === "DM") return -1;
    if (b === "DM") return 1;
    return a.localeCompare(b);
  });
}

export async function listMemoryServers(
  ownerId: string,
  slug: string,
): Promise<MemoryServerOption[]> {
  const ids = await listMemoryServerIds(ownerId, slug);
  const servers = await Promise.all(
    ids.map(async (id) => ({
      id,
      label: id === "DM" ? "Direct Messages" : (await fetchGuildName(id)) ?? id,
    })),
  );
  return servers;
}

export async function listMemories(
  ownerId: string,
  slug: string,
  serverId: string,
  page: number,
  pageSize = PAGE_SIZE,
): Promise<{
  memories: MemoryListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}> {
  const [stItems, ltItems] = await Promise.all([
    queryPkSk("USERS", memoryPrefix(ownerId, slug, serverId, "short")),
    queryPkSk("USERS", memoryPrefix(ownerId, slug, serverId, "long")),
  ]);

  const combined = [
    ...sortNewestFirst(stItems),
    ...sortNewestFirst(ltItems),
  ];
  const totalCount = combined.length;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  const safePage = Math.max(1, Math.min(page, Math.max(totalPages, 1)));
  const start = (safePage - 1) * pageSize;
  const slice = combined.slice(start, start + pageSize);

  return {
    memories: slice.map((item) => parseMemoryItem(item, ownerId, slug)),
    page: safePage,
    pageSize,
    totalCount,
    totalPages,
  };
}

function assertMemorySk(ownerId: string, slug: string, sk: string): void {
  const expected = `USERID#${ownerId}#CHAR#${slug}#SERVER#`;
  if (!sk.startsWith(expected) || !isMemorySk(sk)) {
    throw new Error("Invalid memory");
  }
}

export async function deleteMemory(ownerId: string, slug: string, sk: string): Promise<void> {
  assertMemorySk(ownerId, slug, sk);
  await deleteItem("USERS", sk);
}

export async function purgeMemories(
  ownerId: string,
  slug: string,
  serverId: string,
): Promise<number> {
  const [stItems, ltItems] = await Promise.all([
    queryPkSk("USERS", memoryPrefix(ownerId, slug, serverId, "short")),
    queryPkSk("USERS", memoryPrefix(ownerId, slug, serverId, "long")),
  ]);

  const items = [...stItems, ...ltItems];
  await Promise.all(
    items.map((item) => deleteItem("USERS", String(item.sk))),
  );
  return items.length;
}

export { PAGE_SIZE as MEMORY_PAGE_SIZE };
