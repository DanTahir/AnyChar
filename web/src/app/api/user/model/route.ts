import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { fetchOpenRouterModels } from "@/lib/models";
import { requireApproved } from "@/lib/users";
import { updateItem, userSk } from "@/lib/dynamo";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { modelId } = (await req.json()) as { modelId?: unknown };
    if (typeof modelId !== "string" || !modelId.trim()) {
      return NextResponse.json({ error: "modelId must be a non-empty string" }, { status: 400 });
    }

    const models = await fetchOpenRouterModels();
    const valid = models.some((m) => m.id === modelId);
    if (!valid) {
      return NextResponse.json({ error: "Unknown model" }, { status: 400 });
    }

    await updateItem(
      "USERS",
      userSk(s.user.id),
      "SET preferredTextModel = :m",
      { ":m": modelId },
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
