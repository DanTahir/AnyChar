import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { btcEnabled } from "@/lib/btc/config";
import { buildWithdrawalPsbt } from "@/lib/btc/psbt";
import { btcDisabledResponse, btcErrorResponse } from "@/lib/btc/route-utils";
import { requireAdmin } from "@/lib/users";

const bodySchema = z.object({
  destination: z.string().trim().min(1).max(120),
  amountBtc: z.string().trim().max(24).optional(),
  sendMax: z.boolean(),
  feeRate: z.number().int().min(1).max(1000),
});

/** Builds an UNSIGNED withdrawal PSBT from the central wallet. Nothing is broadcast. */
export async function POST(req: Request) {
  try {
    const { user } = await requireAdmin(await auth());
    if (!btcEnabled()) return btcDisabledResponse();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid withdrawal request" }, { status: 400 });
    }
    const psbt = await buildWithdrawalPsbt(parsed.data);
    console.log(
      `[btc] admin ${user.discordId} built withdrawal PSBT: ${psbt.sendSats} sats → ${psbt.destination}, fee ${psbt.feeSats}`,
    );
    return NextResponse.json(psbt);
  } catch (e) {
    return btcErrorResponse(e, 400, true);
  }
}
