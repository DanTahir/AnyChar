import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { btcEnabled } from "@/lib/btc/config";
import { DASHBOARD_HOT_MS } from "@/lib/btc/dashboard";
import { btcDisabledResponse, btcErrorResponse } from "@/lib/btc/route-utils";
import { markAddressHot } from "@/lib/btc/store";
import { toDepositView } from "@/lib/btc/types";
import { checkUserDeposits } from "@/lib/btc/watcher";
import { getAppUser, requireApproved } from "@/lib/users";

const MIN_INTERVAL_MS = 20_000;
const lastCheck = new Map<string, number>();

/** On-demand chain check of the signed-in user's deposit address (rate limited). */
export async function POST() {
  try {
    const { user } = await requireApproved(await auth());
    if (!btcEnabled()) return btcDisabledResponse();

    const now = Date.now();
    const prev = lastCheck.get(user.discordId) ?? 0;
    if (now - prev < MIN_INTERVAL_MS) {
      const wait = Math.ceil((MIN_INTERVAL_MS - (now - prev)) / 1000);
      return NextResponse.json(
        { error: `Please wait ${wait}s before checking again.` },
        { status: 429, headers: { "Retry-After": String(wait) } },
      );
    }
    lastCheck.set(user.discordId, now);

    await markAddressHot(user.discordId, DASHBOARD_HOT_MS);
    const deposits = await checkUserDeposits(user.discordId);
    const fresh = await getAppUser(user.discordId);
    return NextResponse.json({
      deposits: deposits.map(toDepositView),
      budgetUsd: fresh?.budgetUsd ?? user.budgetUsd,
    });
  } catch (e) {
    return btcErrorResponse(e, 502, false);
  }
}
