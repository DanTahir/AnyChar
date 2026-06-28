import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import {
  deleteMemory,
  listMemories,
  listMemoryServers,
  MEMORY_PAGE_SIZE,
  purgeMemories,
} from "@/lib/memories";
import { getCharacter, requireApproved } from "@/lib/users";

type Params = { params: Promise<{ slug: string }> };

const deleteBodySchema = z.union([
  z.object({ sk: z.string().min(1) }),
  z.object({ purge: z.literal(true), serverId: z.string().min(1) }),
]);

export async function GET(req: Request, { params }: Params) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { slug } = await params;
    const char = await getCharacter(s.user.id, slug);
    if (!char) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const url = new URL(req.url);
    const serverId = url.searchParams.get("serverId") ?? "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

    const servers = await listMemoryServers(s.user.id, slug);

    if (!serverId) {
      return NextResponse.json({
        servers,
        memories: [],
        page: 1,
        pageSize: MEMORY_PAGE_SIZE,
        totalCount: 0,
        totalPages: 0,
      });
    }

    const result = await listMemories(s.user.id, slug, serverId, page);
    return NextResponse.json({ servers, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const session = await auth();
    const { session: s } = await requireApproved(session);
    const { slug } = await params;
    const char = await getCharacter(s.user.id, slug);
    if (!char) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = deleteBodySchema.parse(await req.json());

    if ("purge" in body) {
      const deleted = await purgeMemories(s.user.id, slug, body.serverId);
      return NextResponse.json({ ok: true, deleted });
    }

    await deleteMemory(s.user.id, slug, body.sk);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Invalid memory" ? 400 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
