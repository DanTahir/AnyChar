import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { listPublicCharacters } from "@/lib/public-characters";
import { requireApproved } from "@/lib/users";

export async function GET() {
  try {
    const session = await auth();
    await requireApproved(session);
    const characters = await listPublicCharacters();
    return NextResponse.json({ characters });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 403 });
  }
}
