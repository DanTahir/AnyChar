// Minimal Esplora (mempool.space) REST client.

import { btcConfig } from "./config";

const TIMEOUT_MS = 15_000;
const PAGE_SIZE = 25; // confirmed txs per page returned by /address/:a/txs(/chain)
const MAX_PAGES = 40;

export type EsploraTx = {
  txid: string;
  status: { confirmed: boolean; block_height?: number; block_time?: number };
  vout: { scriptpubkey_address?: string; value: number }[];
};

export type EsploraUtxo = {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean; block_height?: number };
};

type TxoStats = { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
export type AddressStats = { address: string; chain_stats: TxoStats; mempool_stats: TxoStats };

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${btcConfig.apiBase}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Esplora ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res;
}

async function getJson<T>(path: string): Promise<T> {
  return (await (await request(path)).json()) as T;
}

export async function getTipHeight(): Promise<number> {
  const n = Number((await (await request("/blocks/tip/height")).text()).trim());
  if (!Number.isInteger(n) || n <= 0) throw new Error("Invalid tip height from Esplora");
  return n;
}

/**
 * All transactions touching an address (mempool + full confirmed history).
 * `complete` is false if pagination was cut off at MAX_PAGES.
 */
export async function getAddressTxs(address: string): Promise<{ txs: EsploraTx[]; complete: boolean }> {
  const first = await getJson<EsploraTx[]>(`/address/${address}/txs`);
  const txs = [...first];
  let confirmed = first.filter((t) => t.status.confirmed);
  let pages = 1;
  while (confirmed.length >= PAGE_SIZE) {
    if (pages >= MAX_PAGES) return { txs, complete: false };
    const last = confirmed[confirmed.length - 1].txid;
    const next = await getJson<EsploraTx[]>(`/address/${address}/txs/chain/${last}`);
    txs.push(...next);
    confirmed = next;
    pages += 1;
  }
  return { txs, complete: true };
}

export async function getAddressStats(address: string): Promise<AddressStats> {
  return getJson<AddressStats>(`/address/${address}`);
}

export async function getAddressUtxos(address: string): Promise<EsploraUtxo[]> {
  return getJson<EsploraUtxo[]>(`/address/${address}/utxo`);
}

export type FeeRates = { fastestFee: number; halfHourFee: number; hourFee: number; economyFee: number };

export async function getRecommendedFees(): Promise<FeeRates | null> {
  try {
    return await getJson<FeeRates>("/v1/fees/recommended");
  } catch {
    try {
      // Standard Esplora fallback: { "<target blocks>": sat/vB }
      const est = await getJson<Record<string, number>>("/fee-estimates");
      const pick = (k: string) => Math.max(1, Math.ceil(est[k] ?? 1));
      return { fastestFee: pick("1"), halfHourFee: pick("3"), hourFee: pick("6"), economyFee: pick("144") };
    } catch {
      return null;
    }
  }
}

/** Broadcasts a raw transaction (hex). Returns the txid. */
export async function broadcastTx(rawHex: string): Promise<string> {
  const res = await request("/tx", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: rawHex,
  });
  return (await res.text()).trim();
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
