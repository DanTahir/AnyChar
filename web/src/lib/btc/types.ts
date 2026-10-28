// Shared (client-safe) Bitcoin deposit types and formatting helpers.

export type DepositStatus = "pending" | "crediting" | "credited" | "dropped";

export type DepositView = {
  outpoint: string;
  txid: string;
  sats: number;
  status: DepositStatus;
  confirmations: number;
  detectedAt: string;
  creditedAt?: string;
  usdCredited?: number;
  btcUsdPrice?: number;
};

export type AdminDepositView = DepositView & { userId: string; address: string };

/** Strips server-only fields so a deposit record can be sent to the browser. */
export function toDepositView(d: DepositView): DepositView {
  return {
    outpoint: d.outpoint,
    txid: d.txid,
    sats: d.sats,
    status: d.status,
    confirmations: d.confirmations,
    detectedAt: d.detectedAt,
    creditedAt: d.creditedAt,
    usdCredited: d.usdCredited,
    btcUsdPrice: d.btcUsdPrice,
  };
}

export function toAdminDepositView(d: AdminDepositView): AdminDepositView {
  return { ...toDepositView(d), userId: d.userId, address: d.address };
}

export function formatBtc(sats: number): string {
  return (sats / 1e8).toFixed(8);
}

export function formatUsd(usd: number): string {
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
