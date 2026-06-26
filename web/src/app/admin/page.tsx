import { redirect } from "next/navigation";

import AdminClient from "./admin-client";
import { auth } from "@/lib/auth";
import { listApprovedUsers, listPendingUsers } from "@/lib/users";

import { botInviteUrl, config, estimateCostUsd } from "@/lib/config";

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
    return {
      discordId: String(u.discordId ?? u.sk?.toString().replace("USERID#", "")),
      name: u.name as string | undefined,
      email: u.email as string | undefined,
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(inputTokens, outputTokens),
      budgetUsd: Number(u.budgetUsd ?? config.budgetUsd),
    };
  });

  return (
    <AdminClient pending={pending} approved={approved} botInviteUrl={botInviteUrl()} />
  );
}
