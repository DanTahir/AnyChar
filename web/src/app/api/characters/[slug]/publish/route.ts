import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { publishCharacter, unpublishCharacter } from "@/lib/public-characters";
import { requireApproved } from "@/lib/users";

type Params = { params: Promise<{ slug: string }> };

/** Publishes the character publicly, or refreshes its existing public copy. */
export async function POST(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { slug } = await params;
    const result = await publishCharacter(s.user.id, slug, s.user.name ?? "");
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** Removes the character's public copy. */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { slug } = await params;
    await unpublishCharacter(s.user.id, slug);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
