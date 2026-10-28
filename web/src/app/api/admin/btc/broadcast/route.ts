import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { btcEnabled } from "@/lib/btc/config";
import { broadcastSigned } from "@/lib/btc/psbt";
import { btcDisabledResponse, btcErrorResponse } from "@/lib/btc/route-utils";
import { requireAdmin } from "@/lib/users";

const bodySchema = z.object({ signed: z.string().min(1).max(500_000) });

/** Broadcasts an admin-signed PSBT (finalizing it if needed) or a raw signed transaction. */
export async function POST(req: Request) {
  try {
    const { user } = await requireAdmin(await auth());
    if (!btcEnabled()) return btcDisabledResponse();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Paste a signed PSBT or raw transaction" }, { status: 400 });
    }
    const txid = await broadcastSigned(parsed.data.signed);
    console.log(`[btc] admin ${user.discordId} broadcast withdrawal ${txid}`);
    return NextResponse.json({ txid });
  } catch (e) {
    return btcErrorResponse(e, 400, true);
  }
}
