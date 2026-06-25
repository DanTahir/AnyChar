import { redirect } from "next/navigation";

import AdminClient from "./admin-client";
import { auth } from "@/lib/auth";
import { listPendingUsers } from "@/lib/users";

import { botInviteUrl } from "@/lib/config";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.admin) redirect("/");

  const pending = (await listPendingUsers()).map((u) => ({
    discordId: String(u.discordId ?? u.sk?.toString().replace("USERID#", "")),
    name: u.name as string | undefined,
    email: u.email as string | undefined,
  }));

  return <AdminClient pending={pending} botInviteUrl={botInviteUrl()} />;
}
