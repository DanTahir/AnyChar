import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { linkGuild, requireApproved } from "@/lib/users";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { guildId } = (await req.json()) as { guildId: string };
    if (!guildId) {
      return NextResponse.json({ error: "guildId required" }, { status: 400 });
    }
    await linkGuild(s.user.id, guildId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
