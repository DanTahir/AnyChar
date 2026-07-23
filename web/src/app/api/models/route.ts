import { NextResponse } from "next/server";

import { fetchOpenRouterModels } from "@/lib/models";

export async function GET() {
  try {
    const models = await fetchOpenRouterModels();
    return NextResponse.json({ models });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
