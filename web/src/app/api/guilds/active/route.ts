import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { syncBotGuildNickname } from "@/lib/discord-bot";
import { getCharacter, linkGuild, requireApproved, setActiveGuildCharacter } from "@/lib/users";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { guildId, ownerId, slug } = (await req.json()) as {
      guildId: string;
      ownerId: string;
      slug: string;
    };
    if (!guildId || !ownerId || !slug) {
      return NextResponse.json({ error: "guildId, ownerId, slug required" }, { status: 400 });
    }
    const char = await getCharacter(ownerId, slug);
    if (!char) return NextResponse.json({ error: "Character not found" }, { status: 404 });
    await linkGuild(s.user.id, guildId);
    await setActiveGuildCharacter(guildId, ownerId, slug, s.user.id);
    const displayName = (char.displayName as string) || slug;
    await syncBotGuildNickname(guildId, displayName);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
