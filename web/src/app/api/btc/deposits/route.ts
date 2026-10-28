import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { btcEnabled } from "@/lib/btc/config";
import { btcDisabledResponse, btcErrorResponse } from "@/lib/btc/route-utils";
import { listUserDeposits } from "@/lib/btc/store";
import { toDepositView } from "@/lib/btc/types";
import { requireApproved } from "@/lib/users";

/** The signed-in user's Bitcoin deposits (read-only; the watcher does the chain polling). */
export async function GET() {
  try {
    const { user } = await requireApproved(await auth());
    if (!btcEnabled()) return btcDisabledResponse();
    const deposits = await listUserDeposits(user.discordId);
    return NextResponse.json({ deposits: deposits.map(toDepositView), budgetUsd: user.budgetUsd });
  } catch (e) {
    return btcErrorResponse(e, 500, false);
  }
}
