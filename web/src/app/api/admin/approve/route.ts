import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { approveUser } from "@/lib/openrouter";
import { getAppUser, requireAdmin } from "@/lib/users";

export async function POST(req: Request) {
  try {
    const session = await auth();
    await requireAdmin(session);
    const { discordId } = (await req.json()) as { discordId: string };
    if (!discordId) {
      return NextResponse.json({ error: "discordId required" }, { status: 400 });
    }
    await approveUser(discordId);
    const user = await getAppUser(discordId);
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Forbidden" ? 403 : msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
