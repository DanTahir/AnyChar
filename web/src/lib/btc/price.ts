// BTC/USD spot price with a short cache. Coinbase first, CoinGecko as fallback.

const CACHE_MS = 60_000;
let cached: { at: number; price: number } | null = null;

function validPrice(n: number): number {
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid BTC price");
  return n;
}

async function fromCoinbase(): Promise<number> {
  const res = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Coinbase price ${res.status}`);
  const body = (await res.json()) as { data?: { amount?: string } };
  return validPrice(Number(body.data?.amount));
}

async function fromCoinGecko(): Promise<number> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    { cache: "no-store", signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`CoinGecko price ${res.status}`);
  const body = (await res.json()) as { bitcoin?: { usd?: number } };
  return validPrice(Number(body.bitcoin?.usd));
}

/** Throws if no source is reachable — callers must not credit deposits without a price. */
export async function getBtcUsdPrice(): Promise<number> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.price;
  let price: number;
  try {
    price = await fromCoinbase();
  } catch (e) {
    console.warn("[btc] Coinbase price failed, trying CoinGecko:", e);
    price = await fromCoinGecko();
  }
  cached = { at: Date.now(), price };
  return price;
}

export async function tryGetBtcUsdPrice(): Promise<number | null> {
  try {
    return await getBtcUsdPrice();
  } catch {
    return null;
  }
}

/** USD value of `sats` at `price`, floored to whole cents. */
export function satsToUsd(sats: number, price: number): number {
  return Math.floor((sats * price) / 1e6) / 100;
}
