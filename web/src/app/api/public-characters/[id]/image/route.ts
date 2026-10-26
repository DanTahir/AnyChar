import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getPublicCharacterItem } from "@/lib/public-characters";
import { fetchImage } from "@/lib/s3";
import { requireApproved } from "@/lib/users";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const session = await auth();
    await requireApproved(session);
    const { id } = await params;
    const item = await getPublicCharacterItem(id);
    if (!item?.imageS3Key) {
      return NextResponse.json({ error: "No image" }, { status: 404 });
    }
    const image = await fetchImage(item.imageS3Key as string);
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
