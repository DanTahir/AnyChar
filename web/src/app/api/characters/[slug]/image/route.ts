import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { charSk, updateItem } from "@/lib/dynamo";
import {
  characterImageKey,
  extForType,
  uploadImage,
  validateImage,
} from "@/lib/s3";
import { getCharacter, requireApproved } from "@/lib/users";

type Params = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { slug } = await params;
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
    const key = characterImageKey(s.user.id, slug, ext);
    const buf = Buffer.from(await file.arrayBuffer());
    await uploadImage(key, buf, file.type);

    await updateItem(
      "USERS",
      charSk(s.user.id, slug),
      "SET imageS3Key = :k, imageContentType = :t",
      { ":k": key, ":t": file.type },
    );

    return NextResponse.json({ ok: true, key });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
