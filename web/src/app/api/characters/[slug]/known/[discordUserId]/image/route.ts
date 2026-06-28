import { NextResponse } from "next/server";

import {
  bufferToDataUrl,
  describeKnownUserPortrait,
} from "@/lib/appearance";
import { auth } from "@/lib/auth";
import { getItem, knownSk, putItem, userSk } from "@/lib/dynamo";
import {
  extForType,
  fetchImage,
  knownUserImageKey,
  uploadImage,
  validateImage,
} from "@/lib/s3";
import { getCharacter, requireApproved } from "@/lib/users";

type Params = { params: Promise<{ slug: string; discordUserId: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { slug, discordUserId } = await params;
    const char = await getCharacter(s.user.id, slug);
    if (!char) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const known = await getItem("USERS", knownSk(s.user.id, slug, discordUserId));
    if (!known?.imageS3Key) {
      return NextResponse.json({ error: "No image" }, { status: 404 });
    }
    const image = await fetchImage(known.imageS3Key as string);
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

    const userRecord = await getItem("USERS", userSk(s.user.id));
    const encKey = userRecord?.openRouterApiKey as string | undefined;
    if (!encKey) {
      return NextResponse.json({ error: "No API key configured" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const dataUrl = bufferToDataUrl(buf, file.type);
    const appearance = await describeKnownUserPortrait(s.user.id, encKey, dataUrl);
    if (!appearance) {
      return NextResponse.json({ error: "Appearance generation failed" }, { status: 502 });
    }

    const ext = extForType(file.type);
    const key = knownUserImageKey(s.user.id, slug, discordUserId, ext);
    await uploadImage(key, buf, file.type);

    const existing = await getItem("USERS", knownSk(s.user.id, slug, discordUserId));
    await putItem({
      pk: "USERS",
      sk: knownSk(s.user.id, slug, discordUserId),
      knownUserId: discordUserId,
      content: existing?.content ?? "",
      imageS3Key: key,
      imageContentType: file.type,
      appearance,
    });

    return NextResponse.json({ ok: true, key });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
