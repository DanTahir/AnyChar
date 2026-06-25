import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { knownUserSchema } from "@/lib/schemas/character";
import { deleteKnownUser, requireApproved, upsertKnownUser } from "@/lib/users";

type Params = { params: Promise<{ slug: string; discordUserId: string }> };

export async function PUT(req: Request, { params }: Params) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { slug, discordUserId } = await params;
    const body = knownUserSchema.parse({ ...(await req.json()), discordUserId });
    await upsertKnownUser(s.user.id, slug, body.discordUserId, body.content);
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
    const { slug, discordUserId } = await params;
    await deleteKnownUser(s.user.id, slug, discordUserId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
