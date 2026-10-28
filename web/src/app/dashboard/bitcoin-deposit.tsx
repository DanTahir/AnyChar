"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { type DepositView, formatBtc, formatUsd } from "@/lib/btc/types";

const POLL_MS = 30_000;

type Props = {
  address: string;
  qrSvg: string;
  network: string;
  explorerBase: string;
  requiredConfirmations: number;
  initialDeposits: DepositView[];
  btcUsdPrice: number | null;
};

/** Deterministic (timezone-independent) timestamp so SSR and hydration match. */
function shortUtc(iso: string): string {
  return iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "";
}

function statusLabel(d: DepositView, required: number): { text: string; className: string } {
  switch (d.status) {
    case "credited":
      return { text: `Credited ${formatUsd(d.usdCredited ?? 0)}`, className: "text-green-300" };
    case "crediting":
      return { text: "Crediting…", className: "text-purple-200" };
    case "dropped":
      return { text: "Dropped (replaced or never confirmed)", className: "text-red-300" };
    default:
      return {
        text:
          d.confirmations === 0
            ? "Seen — waiting for first confirmation"
            : `${d.confirmations}/${required} confirmations`,
        className: "text-yellow-200",
      };
  }
}

export default function BitcoinDeposit({
  address,
  qrSvg,
  network,
  explorerBase,
  requiredConfirmations,
  initialDeposits,
  btcUsdPrice,
}: Props) {
  const router = useRouter();
  const [deposits, setDeposits] = useState(initialDeposits);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const credited = useRef(
    new Set(initialDeposits.filter((d) => d.status === "credited").map((d) => d.outpoint)),
  );

  const applyDeposits = useCallback(
    (next: DepositView[]) => {
      setDeposits(next);
      const fresh = next.filter((d) => d.status === "credited" && !credited.current.has(d.outpoint));
      if (fresh.length > 0) {
        for (const d of fresh) credited.current.add(d.outpoint);
        const usd = fresh.reduce((n, d) => n + (d.usdCredited ?? 0), 0);
        setNotice(`${formatUsd(usd)} was added to your spending cap.`);
        router.refresh();
      }
    },
    [router],
  );

  // The server-side watcher polls the chain; here we just pick up its results.
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/btc/deposits", { cache: "no-store" });
        if (res.ok) applyDeposits(((await res.json()) as { deposits: DepositView[] }).deposits);
      } catch {
        // transient network error; the next tick retries
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [applyDeposits]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy automatically — select the address and copy it manually.");
    }
  }

  async function checkNow() {
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/btc/check", { method: "POST" });
      const body = (await res.json()) as { deposits?: DepositView[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Check failed");
      applyDeposits(body.deposits ?? []);
      if ((body.deposits ?? []).length === 0) {
        setNotice("No deposits seen yet. New transactions usually show up within a minute of being sent.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed");
    } finally {
      setChecking(false);
    }
  }

  const uri = `bitcoin:${address}`;

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold text-purple-100">Add funds with Bitcoin</h2>
        <p className="mt-1 text-sm text-purple-300/70">
          Send BTC to your personal deposit address. Once the transaction has{" "}
          {requiredConfirmations} confirmations (about {requiredConfirmations * 10} minutes), its
          US-dollar value at the current spot price is added to your spending cap.
        </p>
      </div>

      {network !== "mainnet" && (
        <div className="rounded border border-yellow-600/50 bg-yellow-900/20 px-3 py-2 text-sm text-yellow-200">
          Bitcoin <span className="font-semibold">{network}</span> test mode — this address only
          accepts {network} coins. Do not send real bitcoin.
        </div>
      )}

      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <a href={uri} title="Open in your wallet" className="shrink-0 self-center sm:self-start">
          <div
            role="img"
            aria-label="QR code for your Bitcoin deposit address"
            className="h-44 w-44 rounded-lg bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
            // SVG generated server-side by the qrcode library from our own address.
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        </a>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-purple-400">Your deposit address</p>
            <p className="mt-1 break-all font-mono text-sm text-purple-50">{address}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyAddress()} className="btn-secondary px-3 py-1.5 text-sm">
              {copied ? "Copied!" : "Copy address"}
            </button>
            <a href={uri} className="btn-secondary px-3 py-1.5 text-sm">
              Open in wallet
            </a>
            <button
              type="button"
              onClick={() => void checkNow()}
              disabled={checking}
              className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {checking ? "Checking…" : "Check for deposits"}
            </button>
          </div>
          {btcUsdPrice !== null && (
            <p className="text-xs text-purple-300/60">
              Current price: 1 BTC ≈ {formatUsd(btcUsdPrice)}. The amount credited uses the price at
              the moment your deposit reaches {requiredConfirmations} confirmations.
            </p>
          )}
          <p className="text-xs text-purple-300/60">
            Only send bitcoin (BTC) on the Bitcoin network. This address stays yours, so you can use
            it again for future deposits.
          </p>
          {notice && <p className="text-sm text-green-300">{notice}</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>

      {deposits.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-purple-100">Your deposits</h3>
          <ul className="mt-2 divide-y divide-purple-900/40 text-sm">
            {deposits.map((d) => {
              const s = statusLabel(d, requiredConfirmations);
              return (
                <li key={d.outpoint} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <span className="font-mono text-purple-50">{formatBtc(d.sats)} BTC</span>
                    <span className="ml-2 text-xs text-purple-300/60">{shortUtc(d.detectedAt)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={s.className}>{s.text}</span>
                    <a
                      href={`${explorerBase}/tx/${d.txid}`}
                      target="_blank"
                      rel="noreferrer"
                      className="link-accent text-xs"
                    >
                      View tx
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
