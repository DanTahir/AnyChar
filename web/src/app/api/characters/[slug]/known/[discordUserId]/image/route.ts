import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getItem } from "@/lib/dynamo";
import {
  extForType,
  knownUserImageKey,
  uploadImage,
  validateImage,
} from "@/lib/s3";
import { getCharacter, requireApproved } from "@/lib/users";
import { knownSk } from "@/lib/dynamo";
import { putItem } from "@/lib/dynamo";

type Params = { params: Promise<{ slug: string; discordUserId: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { slug, discordUserId } = await params;
    const char = await getCharacter(s.user.id, slug);
    if (!char) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "image required" }, { status: 400 });
    }
    const err = validateImage(file);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const ext = extForType(file.type);
    const key = knownUserImageKey(s.user.id, slug, discordUserId, ext);
    const buf = Buffer.from(await file.arrayBuffer());
    await uploadImage(key, buf, file.type);

    const existing = await getItem("USERS", knownSk(s.user.id, slug, discordUserId));
    await putItem({
      pk: "USERS",
      sk: knownSk(s.user.id, slug, discordUserId),
      knownUserId: discordUserId,
      content: existing?.content ?? "",
      imageS3Key: key,
      imageContentType: file.type,
    });

    return NextResponse.json({ ok: true, key });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
