import { NextResponse } from "next/server";

import { getItem, userSk } from "@/lib/dynamo";
import { unapproveUser } from "@/lib/openrouter";
import { requireAdmin } from "@/lib/users";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const session = await auth();
    await requireAdmin(session);
    const { discordId } = (await req.json()) as { discordId: string };
    if (!discordId) {
      return NextResponse.json({ error: "discordId required" }, { status: 400 });
    }
    const profile = await getItem("USERS", userSk(discordId));
    await unapproveUser(discordId, profile?.openRouterKeyId as string | undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
