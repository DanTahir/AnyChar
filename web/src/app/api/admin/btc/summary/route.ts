import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { btcEnabled } from "@/lib/btc/config";
import { getRecommendedFees } from "@/lib/btc/esplora";
import { tryGetBtcUsdPrice } from "@/lib/btc/price";
import { btcDisabledResponse, btcErrorResponse } from "@/lib/btc/route-utils";
import { scanWallet } from "@/lib/btc/scan";
import { listAllDeposits } from "@/lib/btc/store";
import { toAdminDepositView } from "@/lib/btc/types";
import { requireAdmin } from "@/lib/users";

const MAX_DEPOSITS = 200;

/** Central wallet balance, deposit history and fee estimates. `?refresh=1` bypasses the scan cache. */
export async function GET(req: Request) {
  try {
    await requireAdmin(await auth());
    if (!btcEnabled()) return btcDisabledResponse();
    const force = new URL(req.url).searchParams.get("refresh") === "1";

    const [scan, deposits, btcUsdPrice, fees] = await Promise.all([
      scanWallet(force),
      listAllDeposits(),
      tryGetBtcUsdPrice(),
      getRecommendedFees(),
    ]);

    const credited = deposits.filter((d) => d.status === "credited");
    const unsettled = deposits.filter((d) => d.status === "pending" || d.status === "crediting");

    return NextResponse.json({
      confirmedSats: scan.confirmedSats,
      unconfirmedSats: scan.unconfirmedSats,
      receiveIndexCount: scan.receiveIndexCount,
      assignedCount: scan.addresses.filter((a) => a.chain === 0 && a.userId).length,
      nextChangeIndex: scan.nextChangeIndex,
      mismatches: scan.mismatches,
      scannedAt: scan.scannedAt,
      btcUsdPrice,
      fees,
      totals: {
        creditedUsd: Math.round(credited.reduce((n, d) => n + (d.usdCredited ?? 0), 0) * 100) / 100,
        creditedSats: credited.reduce((n, d) => n + d.sats, 0),
        unsettledSats: unsettled.reduce((n, d) => n + d.sats, 0),
        depositCount: deposits.length,
      },
      fundedAddresses: scan.addresses
        .filter((a) => a.confirmedSats !== 0 || a.unconfirmedSats !== 0)
        .map((a) => ({
          address: a.address,
          chain: a.chain,
          index: a.index,
          userId: a.userId,
          confirmedSats: a.confirmedSats,
          unconfirmedSats: a.unconfirmedSats,
        })),
      deposits: deposits.slice(0, MAX_DEPOSITS).map(toAdminDepositView),
    });
  } catch (e) {
    return btcErrorResponse(e, 502, true);
  }
}
