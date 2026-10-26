import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { fetchOpenRouterModels } from "@/lib/models";
import { getAppUser } from "@/lib/users";

export async function GET() {
  try {
    const session = await auth();
    let adultContent = false;
    if (session?.user?.id) {
      const user = await getAppUser(session.user.id);
      adultContent = Boolean(user?.adultContentEnabled);
    }
    const models = await fetchOpenRouterModels({ adultContent });
    return NextResponse.json({ models });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
