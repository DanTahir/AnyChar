import { redirect } from "next/navigation";

import AdminClient from "./admin-client";
import BitcoinAdmin, { type BitcoinAdminProps } from "./bitcoin-admin";
import { auth } from "@/lib/auth";
import { btcConfig, btcConfigError } from "@/lib/btc/config";
import { getWallet, signingInfo } from "@/lib/btc/wallet";
import { listApprovedUsers, listPendingUsers } from "@/lib/users";

import { botInviteUrl, config } from "@/lib/config";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function bitcoinAdminProps(userNames: Record<string, string>): BitcoinAdminProps {
  if (!btcConfig.xpub) return { enabled: false };
  if (btcConfigError) return { enabled: false, error: btcConfigError };
  try {
    getWallet();
  } catch (e) {
    return { enabled: false, error: errorMessage(e) };
  }
  let psbtError: string | null = null;
  try {
    signingInfo();
  } catch (e) {
    psbtError = errorMessage(e);
  }
  return {
    enabled: true,
    network: btcConfig.network,
    explorerBase: btcConfig.explorerBase,
    requiredConfirmations: btcConfig.requiredConfirmations,
    psbtError,
    userNames,
  };
}

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.admin) redirect("/");

  const pending = (await listPendingUsers()).map((u) => ({
    discordId: String(u.discordId ?? u.sk?.toString().replace("USERID#", "")),
    name: u.name as string | undefined,
    email: u.email as string | undefined,
  }));

  const approved = (await listApprovedUsers()).map((u) => {
    const inputTokens = Number(u.usageInputTokens ?? 0);
    const outputTokens = Number(u.usageOutputTokens ?? 0);
    const cachedTokens = Number(u.usageCachedTokens ?? 0);
    const cacheWriteTokens = Number(u.usageCacheWriteTokens ?? 0);
    return {
      discordId: String(u.discordId ?? u.sk?.toString().replace("USERID#", "")),
      name: u.name as string | undefined,
      email: u.email as string | undefined,
      inputTokens,
      outputTokens,
      cachedTokens,
      cacheWriteTokens,
      costUsd: Number(u.usageCostUsd ?? 0),
      budgetUsd: Number(u.budgetUsd ?? config.budgetUsd),
    };
  });

  const userNames: Record<string, string> = {};
  for (const u of [...pending, ...approved]) userNames[u.discordId] = u.name ?? u.email ?? u.discordId;

  return (
    <div className="space-y-8">
      <AdminClient pending={pending} approved={approved} botInviteUrl={botInviteUrl()} />
      <BitcoinAdmin {...bitcoinAdminProps(userNames)} />
    </div>
  );
}
