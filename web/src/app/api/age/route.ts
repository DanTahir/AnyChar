import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { requireApproved, setUserAge18Plus } from "@/lib/users";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { age18plus } = (await req.json()) as { age18plus?: unknown };
    if (typeof age18plus !== "boolean") {
      return NextResponse.json({ error: "age18plus must be a boolean" }, { status: 400 });
    }
    await setUserAge18Plus(s.user.id, age18plus);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
