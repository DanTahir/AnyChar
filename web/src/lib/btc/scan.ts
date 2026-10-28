// Central-wallet scan: balances across every derived receive address plus the
// change chain, and spendable UTXOs for building withdrawals.

import { type EsploraUtxo, getAddressStats, getAddressUtxos, mapLimit } from "./esplora";
import { getReceiveIndexCount, listDepositAddresses } from "./store";
import { type DerivedAddress, deriveAddress } from "./wallet";

const CHANGE_GAP_LIMIT = 10;
const CONCURRENCY = 4;
const CACHE_MS = 30_000;

export type ScannedAddress = DerivedAddress & {
  confirmedSats: number;
  unconfirmedSats: number;
  used: boolean;
  userId?: string;
};

export type WalletScan = {
  addresses: ScannedAddress[];
  confirmedSats: number;
  unconfirmedSats: number;
  receiveIndexCount: number;
  nextChangeIndex: number;
  /** Stored deposit addresses that don't match what BTC_XPUB derives (should never happen). */
  mismatches: { userId: string; index: number; stored: string; derived: string }[];
  scannedAt: string;
};

async function scanOne(d: DerivedAddress): Promise<ScannedAddress> {
  const s = await getAddressStats(d.address);
  return {
    ...d,
    confirmedSats: s.chain_stats.funded_txo_sum - s.chain_stats.spent_txo_sum,
    unconfirmedSats: s.mempool_stats.funded_txo_sum - s.mempool_stats.spent_txo_sum,
    used: s.chain_stats.tx_count + s.mempool_stats.tx_count > 0,
  };
}

let cache: { at: number; value: WalletScan } | null = null;

export function invalidateWalletScan(): void {
  cache = null;
}

export async function scanWallet(force = false): Promise<WalletScan> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const [receiveIndexCount, assigned] = await Promise.all([
    getReceiveIndexCount(),
    listDepositAddresses(),
  ]);
  const owners = new Map(assigned.map((a) => [a.index, a]));

  const mismatches: WalletScan["mismatches"] = [];
  const receiveDerived = Array.from({ length: receiveIndexCount }, (_, i) => {
    const d = deriveAddress(0, i);
    const owner = owners.get(i);
    if (owner && owner.address !== d.address) {
      mismatches.push({ userId: owner.userId, index: i, stored: owner.address, derived: d.address });
    }
    return d;
  });
  const receive = await mapLimit(receiveDerived, CONCURRENCY, async (d) => ({
    ...(await scanOne(d)),
    userId: owners.get(d.index)?.userId,
  }));

  // Change chain: gap-limit scan (change is used by withdrawals built here or by
  // the admin's own wallet software).
  const change: ScannedAddress[] = [];
  let lastUsed = -1;
  for (let start = 0; start - lastUsed <= CHANGE_GAP_LIMIT; start += CONCURRENCY) {
    const batch = Array.from({ length: CONCURRENCY }, (_, k) => deriveAddress(1, start + k));
    const scanned = await mapLimit(batch, CONCURRENCY, scanOne);
    for (const s of scanned) {
      change.push(s);
      if (s.used) lastUsed = s.index;
    }
  }

  const addresses = [...receive, ...change];
  const value: WalletScan = {
    addresses,
    confirmedSats: addresses.reduce((n, a) => n + a.confirmedSats, 0),
    unconfirmedSats: addresses.reduce((n, a) => n + a.unconfirmedSats, 0),
    receiveIndexCount,
    nextChangeIndex: lastUsed + 1,
    mismatches,
    scannedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), value };
  return value;
}

export type SpendableUtxo = EsploraUtxo & { derived: DerivedAddress };

/** Confirmed UTXOs across the whole wallet (freshly scanned). */
export async function listSpendableUtxos(): Promise<{ scan: WalletScan; utxos: SpendableUtxo[] }> {
  const scan = await scanWallet(true);
  const funded = scan.addresses.filter((a) => a.confirmedSats > 0 || a.unconfirmedSats !== 0);
  const lists = await mapLimit(funded, CONCURRENCY, async (a) =>
    (await getAddressUtxos(a.address))
      .filter((u) => u.status.confirmed)
      .map((u) => ({ ...u, derived: a as DerivedAddress })),
  );
  return { scan, utxos: lists.flat() };
}
