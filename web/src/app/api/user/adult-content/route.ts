import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { requireApproved, setAdultContentEnabled } from "@/lib/users";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { enabled, confirmedAdult } = (await req.json()) as {
      enabled?: unknown;
      confirmedAdult?: unknown;
    };
    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }
    // Enabling requires an explicit age/majority confirmation from the client;
    // disabling never does.
    if (enabled && confirmedAdult !== true) {
      return NextResponse.json(
        {
          error:
            "You must confirm you are at least 18 and of legal age of majority to enable adult content.",
        },
        { status: 400 },
      );
    }
    await setAdultContentEnabled(s.user.id, enabled);
    return NextResponse.json({ ok: true, enabled });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
