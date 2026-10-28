/**
 * Bitcoin deposit configuration (server-only).
 *
 * Custody model: watch-only. The server only ever holds the central wallet's
 * account-level extended PUBLIC key (BTC_XPUB). Each user gets their own
 * receive address derived from it, so every deposit lands directly in the
 * admin's central wallet. Withdrawals are built here as unsigned PSBTs and
 * signed offline by the admin (Sparrow / Electrum / hardware wallet).
 */

export type BtcNetwork = "mainnet" | "testnet" | "testnet4" | "signet";

const NETWORKS: readonly BtcNetwork[] = ["mainnet", "testnet", "testnet4", "signet"];

const DEFAULT_EXPLORERS: Record<BtcNetwork, string> = {
  mainnet: "https://mempool.space",
  testnet: "https://mempool.space/testnet",
  testnet4: "https://mempool.space/testnet4",
  signet: "https://mempool.space/signet",
};

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const rawNetwork = (process.env.BTC_NETWORK ?? "testnet").trim().toLowerCase();
const networkValid = (NETWORKS as readonly string[]).includes(rawNetwork);
const network: BtcNetwork = networkValid ? (rawNetwork as BtcNetwork) : "testnet";
const explorerBase = (process.env.BTC_EXPLORER_URL ?? DEFAULT_EXPLORERS[network]).replace(/\/+$/, "");

export const btcConfig = {
  network,
  /** Account-level extended public key (zpub/vpub preferred; xpub/tpub of a native-segwit wallet accepted). */
  xpub: (process.env.BTC_XPUB ?? "").trim(),
  /** Master key fingerprint (8 hex chars) — required to build PSBTs that hardware/offline wallets can sign. */
  masterFingerprint: (process.env.BTC_MASTER_FINGERPRINT ?? "").trim().toLowerCase(),
  /** Derivation path of BTC_XPUB from the master key. */
  accountPath: (
    process.env.BTC_ACCOUNT_PATH ?? (network === "mainnet" ? "m/84'/0'/0'" : "m/84'/1'/0'")
  ).trim(),
  requiredConfirmations: positiveInt(process.env.BTC_CONFIRMATIONS, 3),
  pollIntervalMs: positiveInt(process.env.BTC_POLL_INTERVAL_SECONDS, 60) * 1000,
  watcherEnabled: process.env.BTC_WATCHER_ENABLED !== "false",
  explorerBase,
  apiBase: (process.env.BTC_ESPLORA_API_URL ?? `${explorerBase}/api`).replace(/\/+$/, ""),
};

/** Non-null when the env config is present but invalid; deposits are disabled in that case. */
export const btcConfigError: string | null = !btcConfig.xpub
  ? null
  : !networkValid
    ? `BTC_NETWORK="${rawNetwork}" is invalid (expected one of ${NETWORKS.join(", ")})`
    : null;

export function btcEnabled(): boolean {
  return Boolean(btcConfig.xpub) && btcConfigError === null;
}
