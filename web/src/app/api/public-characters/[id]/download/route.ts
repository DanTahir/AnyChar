import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { downloadPublicCharacter } from "@/lib/public-characters";
import { requireApproved } from "@/lib/users";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  // Optional rename, used when the user already has a character with this name.
  displayName: z.string().trim().min(1).max(100).optional(),
});

/** Copies a public character into the signed-in user's characters. */
export async function POST(req: Request, { params }: Params) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const { displayName } = bodySchema.parse(raw ?? {});
    const result = await downloadPublicCharacter(id, s.user.id, displayName);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, suggestedName: result.suggestedName },
        { status: 409 },
      );
    }
    return NextResponse.json({ slug: result.slug, displayName: result.displayName });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Public character not found" ? 404 : 400 });
  }
}
