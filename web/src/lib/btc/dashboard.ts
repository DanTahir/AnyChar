// Server-side data loader for the dashboard's Bitcoin deposit card.

import QRCode from "qrcode";

import { btcConfig, btcEnabled } from "./config";
import { tryGetBtcUsdPrice } from "./price";
import { getOrCreateDepositAddress, listUserDeposits, markAddressHot } from "./store";
import { type DepositView, toDepositView } from "./types";

/** While a user has the dashboard open, the watcher polls their address every cycle. */
export const DASHBOARD_HOT_MS = 2 * 60 * 60_000;

export type DashboardBitcoin =
  | {
      ok: true;
      address: string;
      qrSvg: string;
      network: string;
      explorerBase: string;
      requiredConfirmations: number;
      deposits: DepositView[];
      btcUsdPrice: number | null;
    }
  | { ok: false };

export function bitcoinUri(address: string): string {
  return `bitcoin:${address}`;
}

export async function loadDashboardBitcoin(userId: string): Promise<DashboardBitcoin | null> {
  if (!btcEnabled()) return null;
  try {
    const rec = await getOrCreateDepositAddress(userId);
    const [deposits, btcUsdPrice, qrSvg] = await Promise.all([
      listUserDeposits(userId),
      // The price is only informational here; never let a slow price API stall the page.
      Promise.race([
        tryGetBtcUsdPrice(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]),
      QRCode.toString(bitcoinUri(rec.address), { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
      markAddressHot(userId, DASHBOARD_HOT_MS),
    ]);
    return {
      ok: true,
      address: rec.address,
      qrSvg,
      network: btcConfig.network,
      explorerBase: btcConfig.explorerBase,
      requiredConfirmations: btcConfig.requiredConfirmations,
      deposits: deposits.map(toDepositView),
      btcUsdPrice,
    };
  } catch (e) {
    console.error("[btc] failed to load dashboard deposit card:", e);
    return { ok: false };
  }
}
