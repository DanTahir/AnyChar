import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { updateItem, userSk } from "@/lib/dynamo";
import { getCharacter, requireApproved } from "@/lib/users";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { slug } = (await req.json()) as { slug: string };
    const char = await getCharacter(s.user.id, slug);
    if (!char) return NextResponse.json({ error: "Character not found" }, { status: 404 });
    await updateItem(
      "USERS",
      userSk(s.user.id),
      "SET dmCharacterSlug = :s, dmCharacterName = :n",
      { ":s": slug, ":n": char.displayName },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
