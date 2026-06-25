import { redirect } from "next/navigation";

import ServersClient from "./servers-client";
import { auth } from "@/lib/auth";
import { botInviteUrl } from "@/lib/config";
import { queryPkSk } from "@/lib/dynamo";
import { listLinkedGuilds } from "@/lib/users";

async function fetchGuilds(accessToken: string) {
  const res = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 60 },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    id: string;
    name: string;
    owner: boolean;
    permissions: string;
  }[];
  return data.filter(
    (g) => g.owner || (BigInt(g.permissions) & BigInt(0x20)) !== BigInt(0),
  );
}

export default async function ServersPage() {
  const session = await auth();
  if (!session?.user?.approved) redirect("/pending");

  let guilds: { id: string; name: string; owner: boolean; permissions: string }[] = [];
  const linked = await listLinkedGuilds(session.user.id);

  const accounts = await queryPkSk("USERS", `USERID#${session.user.id}#ACCOUNT#`);
  const discordAccount = accounts.find((a) => String(a.provider) === "discord");
  if (discordAccount?.access_token) {
    guilds = await fetchGuilds(discordAccount.access_token as string);
  }

  return (
    <ServersClient
      guilds={guilds}
      linkedGuilds={linked}
      botInviteUrl={botInviteUrl()}
    />
  );
}
