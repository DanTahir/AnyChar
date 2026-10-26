import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { removePublicCharacter } from "@/lib/public-characters";
import { requireApproved } from "@/lib/users";

type Params = { params: Promise<{ id: string }> };

/** Removes a public character (author or admin only). */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    const { session: s, user } = await requireApproved(session);
    const { id } = await params;
    await removePublicCharacter(id, { id: s.user.id, admin: user.admin });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Forbidden" ? 403 : msg === "Public character not found" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
