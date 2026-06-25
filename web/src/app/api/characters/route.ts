import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { characterSchema } from "@/lib/schemas/character";
import { createCharacter, listCharacters, requireApproved } from "@/lib/users";

export async function GET() {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const chars = await listCharacters(s.user.id);
    return NextResponse.json({ characters: chars });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 403 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const body = characterSchema.parse(await req.json());
    const slug = await createCharacter(s.user.id, body);
    return NextResponse.json({ slug });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
