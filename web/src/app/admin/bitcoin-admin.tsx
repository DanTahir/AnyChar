"use client";

import { useEffect, useState } from "react";

import { type AdminDepositView, formatBtc, formatUsd } from "@/lib/btc/types";

export type BitcoinAdminProps =
  | { enabled: false; error?: string }
  | {
      enabled: true;
      network: string;
      explorerBase: string;
      requiredConfirmations: number;
      /** Why withdrawals can't be built (e.g. missing fingerprint), or null if they can. */
      psbtError: string | null;
      userNames: Record<string, string>;
    };

type FeeRates = { fastestFee: number; halfHourFee: number; hourFee: number; economyFee: number };

type Summary = {
  confirmedSats: number;
  unconfirmedSats: number;
  receiveIndexCount: number;
  assignedCount: number;
  nextChangeIndex: number;
  mismatches: { userId: string; index: number; stored: string; derived: string }[];
  scannedAt: string;
  btcUsdPrice: number | null;
  fees: FeeRates | null;
  totals: { creditedUsd: number; creditedSats: number; unsettledSats: number; depositCount: number };
  fundedAddresses: {
    address: string;
    chain: 0 | 1;
    index: number;
    userId?: string;
    confirmedSats: number;
    unconfirmedSats: number;
  }[];
  deposits: AdminDepositView[];
};

type Psbt = {
  psbtBase64: string;
  destination: string;
  sendSats: number;
  feeSats: number;
  changeSats: number;
  changeAddress?: string;
  inputCount: number;
  inputSats: number;
};

async function fetchSummary(refresh: boolean): Promise<Summary> {
  const res = await fetch(`/api/admin/btc/summary${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
  const body = (await res.json()) as Summary & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Failed to load wallet summary");
  return body;
}

function shortUtc(iso: string): string {
  return iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "";
}

function usdFor(sats: number, price: number | null): string {
  return price === null ? "" : ` ≈ ${formatUsd((sats / 1e8) * price)}`;
}

export default function BitcoinAdmin(props: BitcoinAdminProps) {
  if (!props.enabled) return <BitcoinSetup error={props.error} />;
  return <BitcoinWallet {...props} />;
}

function BitcoinSetup({ error }: { error?: string }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-purple-100">Bitcoin wallet</h2>
      <div className="card space-y-2 p-5 text-sm text-purple-300/80">
        {error ? (
          <p className="text-red-400">Bitcoin deposits are misconfigured: {error}</p>
        ) : (
          <p>Bitcoin deposits are off. To turn them on, set these in web/.env and restart:</p>
        )}
        <ul className="list-disc space-y-1 pl-5 font-mono text-xs">
          <li>BTC_NETWORK=testnet | testnet4 | signet | mainnet</li>
          <li>BTC_XPUB=&lt;account zpub/vpub of a dedicated native-segwit wallet&gt;</li>
          <li>BTC_MASTER_FINGERPRINT=&lt;8 hex chars&gt; (needed for withdrawals)</li>
          <li>BTC_ACCOUNT_PATH=m/84&apos;/1&apos;/0&apos; (testnet) or m/84&apos;/0&apos;/0&apos; (mainnet)</li>
        </ul>
      </div>
    </section>
  );
}

function BitcoinWallet({
  network,
  explorerBase,
  requiredConfirmations,
  psbtError,
  userNames,
}: Extract<BitcoinAdminProps, { enabled: true }>) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [destination, setDestination] = useState("");
  const [amountBtc, setAmountBtc] = useState("");
  const [sendMax, setSendMax] = useState(false);
  const [feeRate, setFeeRate] = useState("");
  const [building, setBuilding] = useState(false);
  const [psbt, setPsbt] = useState<Psbt | null>(null);
  const [psbtMsg, setPsbtMsg] = useState("");

  const [signed, setSigned] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<{ txid?: string; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSummary(false).then(
      (s) => {
        if (cancelled) return;
        setSummary(s);
        if (s.fees) setFeeRate((prev) => prev || String(s.fees!.halfHourFee));
      },
      (e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load wallet summary");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setRefreshing(true);
    setLoadError("");
    try {
      setSummary(await fetchSummary(true));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load wallet summary");
    } finally {
      setRefreshing(false);
    }
  }

  async function buildPsbt(e: React.FormEvent) {
    e.preventDefault();
    setBuilding(true);
    setPsbt(null);
    setPsbtMsg("");
    try {
      const res = await fetch("/api/admin/btc/psbt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: destination.trim(),
          amountBtc: sendMax ? undefined : amountBtc.trim(),
          sendMax,
          feeRate: Number(feeRate),
        }),
      });
      const body = (await res.json()) as Psbt & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to build PSBT");
      setPsbt(body);
    } catch (err) {
      setPsbtMsg(err instanceof Error ? err.message : "Failed to build PSBT");
    } finally {
      setBuilding(false);
    }
  }

  function downloadPsbt() {
    if (!psbt) return;
    const bin = atob(psbt.psbtBase64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `anychar-withdrawal-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.psbt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyPsbt() {
    if (!psbt) return;
    try {
      await navigator.clipboard.writeText(psbt.psbtBase64);
      setPsbtMsg("PSBT copied to clipboard.");
    } catch {
      setPsbtMsg("Couldn't copy — select the text and copy it manually.");
    }
  }

  async function broadcast() {
    if (!signed.trim()) return;
    if (!window.confirm("Broadcast this signed transaction to the Bitcoin network? This cannot be undone.")) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    try {
      const res = await fetch("/api/admin/btc/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signed }),
      });
      const body = (await res.json()) as { txid?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Broadcast failed");
      setBroadcastResult({ txid: body.txid });
      setSigned("");
      setPsbt(null);
    } catch (err) {
      setBroadcastResult({ error: err instanceof Error ? err.message : "Broadcast failed" });
    } finally {
      setBroadcasting(false);
    }
  }

  const price = summary?.btcUsdPrice ?? null;
  const nameOf = (id?: string) => (id ? (userNames[id] ?? id) : "—");
  const inputClass =
    "w-full rounded border border-purple-800/60 bg-purple-950/40 px-3 py-2 text-sm text-purple-50 placeholder:text-purple-400/40";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-purple-100">
          Bitcoin wallet{" "}
          {network !== "mainnet" && (
            <span className="ml-1 rounded bg-yellow-900/50 px-1.5 py-0.5 text-xs text-yellow-200">{network}</span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {refreshing ? "Scanning…" : "Rescan wallet"}
        </button>
      </div>
      {loadError && <p className="text-sm text-red-400">{loadError}</p>}

      {/* ---------------------------------------------------------- balance */}
      <div className="card space-y-2 p-5 text-sm">
        {!summary ? (
          !loadError && <p className="text-purple-300/70">Scanning the central wallet…</p>
        ) : (
          <>
            <p className="text-2xl font-bold text-purple-50">
              {formatBtc(summary.confirmedSats)} BTC
              <span className="ml-2 text-base font-normal text-purple-300/70">
                {usdFor(summary.confirmedSats, price)}
              </span>
            </p>
            {summary.unconfirmedSats !== 0 && (
              <p className="text-yellow-200">
                {summary.unconfirmedSats > 0 ? "+" : ""}
                {formatBtc(summary.unconfirmedSats)} BTC unconfirmed
              </p>
            )}
            <p className="text-purple-300/70">
              {summary.assignedCount} user deposit addresses · {summary.totals.depositCount} deposits ·{" "}
              {formatUsd(summary.totals.creditedUsd)} credited to budgets ({formatBtc(summary.totals.creditedSats)} BTC)
              {summary.totals.unsettledSats > 0 &&
                ` · ${formatBtc(summary.totals.unsettledSats)} BTC awaiting ${requiredConfirmations} confirmations`}
            </p>
            <p className="text-xs text-purple-300/60">
              All deposit addresses are receive addresses 0–{Math.max(0, summary.receiveIndexCount - 1)} of your
              central wallet, so the funds are already in it. In Sparrow/Electrum, set the wallet&apos;s gap limit to
              at least {summary.receiveIndexCount + 20} so every deposit shows up. Scanned {shortUtc(summary.scannedAt)}.
            </p>
            {summary.mismatches.length > 0 && (
              <p className="text-sm text-red-400">
                Warning: {summary.mismatches.length} stored deposit address(es) don&apos;t match BTC_XPUB. Do not change
                BTC_XPUB without migrating; investigate before withdrawing.
              </p>
            )}
          </>
        )}
      </div>

      {/* --------------------------------------------------------- withdraw */}
      <div className="card space-y-4 p-5">
        <div>
          <h3 className="font-semibold text-purple-100">Send from the central wallet</h3>
          <p className="mt-1 text-xs text-purple-300/60">
            This builds an <span className="font-semibold">unsigned</span> transaction (PSBT). The server never holds
            your private keys: sign it in Sparrow, Electrum or your hardware wallet (File → Open Transaction), then
            broadcast it there or paste the signed result below.
          </p>
        </div>
        {psbtError ? (
          <p className="text-sm text-red-400">{psbtError}</p>
        ) : (
          <form onSubmit={(e) => void buildPsbt(e)} className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-purple-300/80">Destination address</span>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder={network === "mainnet" ? "bc1…" : "tb1…"}
                className={`${inputClass} font-mono`}
                required
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-purple-300/80">Amount (BTC)</span>
              <input
                value={sendMax ? "" : amountBtc}
                onChange={(e) => setAmountBtc(e.target.value)}
                placeholder={sendMax ? "Entire confirmed balance" : "0.001"}
                disabled={sendMax}
                inputMode="decimal"
                className={`${inputClass} font-mono disabled:opacity-50`}
                required={!sendMax}
              />
              <span className="flex items-center gap-2 text-xs text-purple-300/70">
                <input
                  type="checkbox"
                  checked={sendMax}
                  onChange={(e) => setSendMax(e.target.checked)}
                  className="accent-purple-600"
                />
                Send entire confirmed balance (fee deducted)
              </span>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-purple-300/80">Fee rate (sat/vB)</span>
              <input
                value={feeRate}
                onChange={(e) => setFeeRate(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                className={`${inputClass} font-mono`}
                required
              />
              {summary?.fees && (
                <span className="flex flex-wrap gap-1 text-xs">
                  {(
                    [
                      ["Fast", summary.fees.fastestFee],
                      ["30 min", summary.fees.halfHourFee],
                      ["1 hr", summary.fees.hourFee],
                      ["Economy", summary.fees.economyFee],
                    ] as const
                  ).map(([label, rate]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setFeeRate(String(rate))}
                      className="rounded border border-purple-700/50 px-2 py-0.5 text-purple-200 hover:bg-purple-800/40"
                    >
                      {label}: {rate}
                    </button>
                  ))}
                </span>
              )}
            </label>
            <div className="sm:col-span-2">
              <button type="submit" disabled={building} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
                {building ? "Building…" : "Create unsigned transaction"}
              </button>
            </div>
          </form>
        )}
        {psbtMsg && <p className={`text-sm ${psbt ? "text-purple-300/80" : "text-red-400"}`}>{psbtMsg}</p>}

        {psbt && (
          <div className="space-y-3 rounded border border-purple-800/50 p-4 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-purple-300/70">Send</dt>
              <dd className="font-mono text-purple-50">
                {formatBtc(psbt.sendSats)} BTC{usdFor(psbt.sendSats, price)}
              </dd>
              <dt className="text-purple-300/70">To</dt>
              <dd className="break-all font-mono text-purple-50">{psbt.destination}</dd>
              <dt className="text-purple-300/70">Network fee</dt>
              <dd className="font-mono text-purple-50">
                {formatBtc(psbt.feeSats)} BTC{usdFor(psbt.feeSats, price)}
              </dd>
              {psbt.changeSats > 0 && (
                <>
                  <dt className="text-purple-300/70">Change back</dt>
                  <dd className="break-all font-mono text-purple-50">
                    {formatBtc(psbt.changeSats)} BTC → {psbt.changeAddress}
                  </dd>
                </>
              )}
              <dt className="text-purple-300/70">Inputs</dt>
              <dd className="font-mono text-purple-50">
                {psbt.inputCount} ({formatBtc(psbt.inputSats)} BTC)
              </dd>
            </dl>
            <textarea
              readOnly
              value={psbt.psbtBase64}
              rows={4}
              className={`${inputClass} font-mono text-xs`}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={downloadPsbt} className="btn-secondary px-3 py-1.5 text-sm">
                Download .psbt
              </button>
              <button type="button" onClick={() => void copyPsbt()} className="btn-secondary px-3 py-1.5 text-sm">
                Copy PSBT
              </button>
            </div>
            <p className="text-xs text-purple-300/60">
              Check the amount and destination again on your signing device before you approve.
            </p>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------- broadcast */}
      <div className="card space-y-3 p-5">
        <h3 className="font-semibold text-purple-100">Broadcast a signed transaction</h3>
        <textarea
          value={signed}
          onChange={(e) => setSigned(e.target.value)}
          rows={4}
          placeholder="Paste the signed PSBT (base64) or raw transaction hex"
          className={`${inputClass} font-mono text-xs`}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => void broadcast()}
          disabled={broadcasting || !signed.trim()}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
        >
          {broadcasting ? "Broadcasting…" : "Broadcast"}
        </button>
        {broadcastResult?.txid && (
          <p className="text-sm text-green-300">
            Broadcast!{" "}
            <a href={`${explorerBase}/tx/${broadcastResult.txid}`} target="_blank" rel="noreferrer" className="link-accent break-all font-mono">
              {broadcastResult.txid}
            </a>
          </p>
        )}
        {broadcastResult?.error && <p className="text-sm text-red-400">{broadcastResult.error}</p>}
      </div>

      {/* --------------------------------------------------------- deposits */}
      {summary && summary.deposits.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-purple-100">Recent deposits</h3>
          <div className="overflow-x-auto">
            <table className="card w-full overflow-hidden text-left text-sm">
              <thead>
                <tr className="border-b border-purple-900/40 text-purple-300/70">
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Credited</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Seen</th>
                  <th className="px-4 py-2">Tx</th>
                </tr>
              </thead>
              <tbody>
                {summary.deposits.map((d) => (
                  <tr key={d.outpoint} className="border-b border-purple-900/30">
                    <td className="px-4 py-2">{nameOf(d.userId)}</td>
                    <td className="px-4 py-2 font-mono">{formatBtc(d.sats)}</td>
                    <td className="px-4 py-2">
                      {d.usdCredited !== undefined ? formatUsd(d.usdCredited) : "—"}
                      {d.btcUsdPrice !== undefined && (
                        <span className="block text-xs text-purple-300/50">@ {formatUsd(d.btcUsdPrice)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {d.status === "pending" ? `${d.confirmations}/${requiredConfirmations} conf` : d.status}
                    </td>
                    <td className="px-4 py-2 text-xs text-purple-300/70">{shortUtc(d.detectedAt)}</td>
                    <td className="px-4 py-2">
                      <a href={`${explorerBase}/tx/${d.txid}`} target="_blank" rel="noreferrer" className="link-accent text-xs">
                        {d.txid.slice(0, 10)}…
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary && summary.fundedAddresses.length > 0 && (
        <details className="card p-4 text-sm">
          <summary className="cursor-pointer text-purple-200">Funded addresses ({summary.fundedAddresses.length})</summary>
          <ul className="mt-2 space-y-1">
            {summary.fundedAddresses.map((a) => (
              <li key={a.address} className="flex flex-wrap justify-between gap-2">
                <a
                  href={`${explorerBase}/address/${a.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="link-accent break-all font-mono text-xs"
                >
                  {a.chain === 0 ? "receive" : "change"}/{a.index} {a.address}
                </a>
                <span className="font-mono text-xs text-purple-300/80">
                  {formatBtc(a.confirmedSats)}
                  {a.unconfirmedSats !== 0 && ` (${a.unconfirmedSats > 0 ? "+" : ""}${formatBtc(a.unconfirmedSats)})`}
                  {a.userId && ` · ${nameOf(a.userId)}`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
