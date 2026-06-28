import { NextResponse } from "next/server";

import {
  bufferToDataUrl,
  describeCharacterPortrait,
} from "@/lib/appearance";
import { auth } from "@/lib/auth";
import { charSk, getItem, updateItem, userSk } from "@/lib/dynamo";
import {
  characterImageKey,
  extForType,
  fetchImage,
  uploadImage,
  validateImage,
} from "@/lib/s3";
import { getCharacter, requireApproved } from "@/lib/users";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { slug } = await params;
    const char = await getCharacter(s.user.id, slug);
    if (!char?.imageS3Key) {
      return NextResponse.json({ error: "No image" }, { status: 404 });
    }
    const image = await fetchImage(char.imageS3Key as string);
    if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(image.body, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

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

    const userRecord = await getItem("USERS", userSk(s.user.id));
    const encKey = userRecord?.openRouterApiKey as string | undefined;
    if (!encKey) {
      return NextResponse.json({ error: "No API key configured" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const dataUrl = bufferToDataUrl(buf, file.type);
    const appearance = await describeCharacterPortrait(s.user.id, encKey, dataUrl);
    if (!appearance) {
      return NextResponse.json({ error: "Appearance generation failed" }, { status: 502 });
    }

    const ext = extForType(file.type);
    const key = characterImageKey(s.user.id, slug, ext);
    await uploadImage(key, buf, file.type);

    await updateItem(
      "USERS",
      charSk(s.user.id, slug),
      "SET imageS3Key = :k, imageContentType = :t, appearance = :a",
      { ":k": key, ":t": file.type, ":a": appearance },
    );

    return NextResponse.json({ ok: true, key });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
