import { NextResponse } from "next/server";

import { listServerCharacters } from "@/lib/users";

type Params = { params: Promise<{ guildId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { guildId } = await params;
  const characters = await listServerCharacters(guildId);
  return NextResponse.json({
    characters: characters.map((c) => ({
      ...c,
      ownerDiscordId: String(c.ownerDiscordId ?? c.sk?.toString().split("#CHAR#")[0]?.replace("USERID#", "")),
    })),
  });
}
