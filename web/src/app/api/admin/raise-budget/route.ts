import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getAppUser, raiseUserBudget, requireAdmin } from "@/lib/users";

const INCREMENT_USD = 10;

export async function POST(req: Request) {
  try {
    const session = await auth();
    await requireAdmin(session);
    const { discordId } = (await req.json()) as { discordId: string };
    if (!discordId) {
      return NextResponse.json({ error: "discordId required" }, { status: 400 });
    }
    await raiseUserBudget(discordId, INCREMENT_USD);
    const user = await getAppUser(discordId);
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
