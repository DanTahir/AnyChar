import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { buildCombinedNickname, syncBotGuildNickname } from "@/lib/discord-bot";
import {
  type ActiveCharacter,
  getCharacter,
  linkGuild,
  requireApproved,
  setActiveGuildCharacters,
} from "@/lib/users";

type Body = {
  guildId: string;
  // New multi-character form: an ordered list (0-3 entries).
  characters?: { ownerId: string; slug: string }[];
  // Legacy single-character form.
  ownerId?: string;
  slug?: string;
};

export async function POST(req: Request) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const body = (await req.json()) as Body;
    const { guildId } = body;
    if (!guildId) {
      return NextResponse.json({ error: "guildId required" }, { status: 400 });
    }

    const requested =
      body.characters ??
      (body.ownerId && body.slug ? [{ ownerId: body.ownerId, slug: body.slug }] : []);

    // De-dupe while preserving order, cap at 3.
    const seen = new Set<string>();
    const deduped = requested
      .filter((c) => c.ownerId && c.slug)
      .filter((c) => {
        const key = `${c.ownerId}:${c.slug}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3);

    const resolved: ActiveCharacter[] = [];
    for (const c of deduped) {
      const char = await getCharacter(c.ownerId, c.slug);
      if (!char) {
        return NextResponse.json(
          { error: `Character not found: ${c.slug}` },
          { status: 404 },
        );
      }
      resolved.push({
        ownerDiscordId: c.ownerId,
        slug: c.slug,
        displayName: (char.displayName as string) || c.slug,
      });
    }

    await linkGuild(s.user.id, guildId);
    await setActiveGuildCharacters(guildId, resolved, s.user.id);
    const nick = buildCombinedNickname(resolved.map((c) => c.displayName));
    if (nick) await syncBotGuildNickname(guildId, nick);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
