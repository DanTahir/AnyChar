import { encryptApiKey } from "./crypto";
import { getItem, updateItem, userSk } from "./dynamo";

export async function createOpenRouterKey(discordId: string): Promise<{
  key: string;
  keyId: string;
}> {
  const managementKey = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (!managementKey) throw new Error("OPENROUTER_MANAGEMENT_KEY is not set");

  const resp = await fetch("https://openrouter.ai/api/v1/keys", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: `anychar-${discordId}` }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenRouter key creation failed: ${text}`);
  }

  const data = (await resp.json()) as { key?: string; data?: { hash?: string; label?: string } };
  const key = data.key ?? (data as { data?: { key?: string } }).data?.key;
  const keyId = (data as { data?: { hash?: string } }).data?.hash ?? discordId;
  if (!key) throw new Error("OpenRouter did not return a key");
  return { key, keyId };
}

export async function revokeOpenRouterKey(keyId: string) {
  const managementKey = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (!managementKey || !keyId) return;
  await fetch(`https://openrouter.ai/api/v1/keys/${keyId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${managementKey}` },
  });
}

export async function approveUser(discordId: string) {
  const existing = await getItem("USERS", userSk(discordId));
  const { key, keyId } = await createOpenRouterKey(discordId);
  await updateItem(
    "USERS",
    userSk(discordId),
    "SET approved = :a, gsi1pk = :gpk, openRouterApiKey = :k, openRouterKeyId = :kid, usageInputTokens = :zero, usageOutputTokens = :zero, #name = if_not_exists(#name, :n)",
    {
      ":a": true,
      ":gpk": "APPROVAL#approved",
      ":k": encryptApiKey(key),
      ":kid": keyId,
      ":zero": 0,
      ":n": existing?.name ?? discordId,
    },
    { "#name": "name" },
  );
}

export async function unapproveUser(discordId: string, keyId?: string) {
  if (keyId) await revokeOpenRouterKey(keyId);
  await updateItem(
    "USERS",
    userSk(discordId),
    "SET approved = :a, gsi1pk = :gpk REMOVE openRouterApiKey, openRouterKeyId",
    { ":a": false, ":gpk": "APPROVAL#pending" },
  );
}
