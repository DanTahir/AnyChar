export type MemoryListItem = {
  sk: string;
  tier: "short" | "long";
  serverId: string;
  createdAt: string | null;
  threadRootMessageId: string | null;
  lastHumanUserId: string | null;
  content: string;
};

export type MemoryServerOption = {
  id: string;
  label: string;
};
