// Background deposit watcher. Started once per server process from
// src/instrumentation.ts; also exposes a per-user "check now" entry point.
//
// Safe to run in more than one process at once: every state transition in
// store.ts is a conditional DynamoDB write, so a deposit can't be credited twice.

import { btcConfig, btcEnabled } from "./config";
import { getAddressTxs, getTipHeight, mapLimit } from "./esplora";
import {
  type DepositAddressRecord,
  type DepositRecord,
  creditDeposit,
  getDepositAddress,
  listAllDeposits,
  listDepositAddresses,
  listUserDeposits,
  recordDeposit,
  updateDepositProgress,
} from "./store";

/** Addresses nobody is looking at and with nothing pending are polled this often. */
const COLD_INTERVAL_MS = 30 * 60_000;
const CONCURRENCY = 3;

const lastChecked = new Map<string, number>();

function confirmationsFor(blockHeight: number | undefined, tip: number): number {
  return blockHeight === undefined ? 0 : Math.max(0, tip - blockHeight + 1);
}

/** Syncs one address's on-chain outputs into deposit records and credits confirmed ones. */
export async function checkAddress(
  rec: DepositAddressRecord,
  tip: number,
  known: Map<string, DepositRecord>,
): Promise<void> {
  const { txs, complete } = await getAddressTxs(rec.address);
  const seen = new Set<string>();

  for (const tx of txs) {
    for (let vout = 0; vout < tx.vout.length; vout++) {
      const out = tx.vout[vout];
      if (out.scriptpubkey_address !== rec.address || out.value <= 0) continue;
      const outpoint = `${tx.txid}:${vout}`;
      if (seen.has(outpoint)) continue; // tx can appear on two pages during a new block
      seen.add(outpoint);

      const blockHeight = tx.status.confirmed ? tx.status.block_height : undefined;
      const confirmations = confirmationsFor(blockHeight, tip);

      let dep = known.get(outpoint);
      if (!dep) {
        dep = await recordDeposit({
          outpoint,
          txid: tx.txid,
          vout,
          userId: rec.userId,
          address: rec.address,
          sats: out.value,
          confirmations,
          blockHeight,
        });
        known.set(outpoint, dep);
        console.log(`[btc] detected deposit ${outpoint} (${out.value} sats) for user ${rec.userId}`);
      } else if (
        (dep.status === "pending" || dep.status === "dropped") &&
        (dep.confirmations !== confirmations || dep.status === "dropped" || dep.blockHeight !== blockHeight)
      ) {
        await updateDepositProgress(dep, confirmations, blockHeight, "pending");
      }

      if (
        (dep.status === "pending" && confirmations >= btcConfig.requiredConfirmations) ||
        dep.status === "crediting"
      ) {
        dep.confirmations = confirmations;
        await creditDeposit(dep);
      }
    }
  }

  // Pending outputs that vanished from the address history were replaced (RBF),
  // double-spent, or reorged out. Only judge this from a complete history.
  if (complete) {
    for (const dep of known.values()) {
      if (dep.address === rec.address && dep.status === "pending" && !seen.has(dep.outpoint)) {
        await updateDepositProgress(dep, 0, undefined, "dropped");
        console.warn(`[btc] deposit ${dep.outpoint} disappeared from chain/mempool; marked dropped`);
      }
    }
  }

  lastChecked.set(rec.address, Date.now());
}

/** On-demand check of a single user's address. Returns their up-to-date deposits. */
export async function checkUserDeposits(userId: string): Promise<DepositRecord[]> {
  const rec = await getDepositAddress(userId);
  if (!rec) return [];
  const deposits = await listUserDeposits(userId);
  const known = new Map(deposits.map((d) => [d.outpoint, d]));
  await checkAddress(rec, await getTipHeight(), known);
  return [...known.values()].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

let running = false;

export async function runWatcherCycle(): Promise<void> {
  if (running || !btcEnabled()) return;
  running = true;
  try {
    const addresses = await listDepositAddresses();
    if (addresses.length === 0) return;

    const deposits = await listAllDeposits();
    const known = new Map(deposits.map((d) => [d.outpoint, d]));
    const unsettled = new Set(
      deposits
        .filter((d) => d.status === "pending" || d.status === "crediting")
        .map((d) => d.address),
    );

    const now = Date.now();
    const due = addresses.filter(
      (a) =>
        unsettled.has(a.address) ||
        (a.watchUntil !== undefined && a.watchUntil > now) ||
        now - (lastChecked.get(a.address) ?? 0) >= COLD_INTERVAL_MS,
    );
    if (due.length === 0) return;

    const tip = await getTipHeight();
    await mapLimit(due, CONCURRENCY, async (rec) => {
      try {
        await checkAddress(rec, tip, known);
      } catch (e) {
        console.error(`[btc] check failed for ${rec.address} (user ${rec.userId}):`, e);
      }
    });
  } catch (e) {
    console.error("[btc] watcher cycle failed:", e);
  } finally {
    running = false;
  }
}

type WatcherGlobal = typeof globalThis & { __anycharBtcWatcher?: ReturnType<typeof setInterval> };

export function startBtcWatcher(): void {
  if (!btcEnabled() || !btcConfig.watcherEnabled) {
    console.log("[btc] deposit watcher not started (BTC_XPUB unset/invalid or BTC_WATCHER_ENABLED=false)");
    return;
  }
  const g = globalThis as WatcherGlobal;
  if (g.__anycharBtcWatcher) return; // dev hot-reload / double register guard
  console.log(
    `[btc] deposit watcher started: network=${btcConfig.network} every ${btcConfig.pollIntervalMs / 1000}s, ` +
      `${btcConfig.requiredConfirmations} confirmations`,
  );
  g.__anycharBtcWatcher = setInterval(() => void runWatcherCycle(), btcConfig.pollIntervalMs);
  setTimeout(() => void runWatcherCycle(), 5_000);
}
