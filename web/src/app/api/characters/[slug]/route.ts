import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { fetchDiscordDisplayNames } from "@/lib/discord-bot";
import { characterSchema } from "@/lib/schemas/character";
import {
  deleteCharacter,
  getCharacter,
  listKnownUsers,
  requireApproved,
  updateCharacter,
} from "@/lib/users";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { slug } = await params;
    const char = await getCharacter(s.user.id, slug);
    if (!char) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const known = await listKnownUsers(s.user.id, slug);
    const idOf = (k: Record<string, unknown>): string =>
      (k.knownUserId as string | undefined) ?? String(k.sk ?? "").split("#KNOWN#")[1] ?? "";
    const usernames = await fetchDiscordDisplayNames(known.map(idOf));
    const knownUsers = known.map((k) => ({ ...k, displayName: usernames[idOf(k)] }));
    return NextResponse.json({ character: char, knownUsers, ownerId: s.user.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { slug } = await params;
    const body = characterSchema.parse(await req.json());
    await updateCharacter(s.user.id, slug, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { slug } = await params;
    await deleteCharacter(s.user.id, slug);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
