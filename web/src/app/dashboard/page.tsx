import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { loadDashboardBitcoin } from "@/lib/btc/dashboard";
import { defaultTextModel } from "@/lib/models";
import { getAppUser, listCharacters } from "@/lib/users";

import BitcoinDeposit from "./bitcoin-deposit";
import ModelSelector from "./model-selector";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (!session.user.approved) redirect("/pending");

  const [user, characters, bitcoin] = await Promise.all([
    getAppUser(session.user.id),
    listCharacters(session.user.id),
    loadDashboardBitcoin(session.user.id),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-purple-300/70">Manage your characters and usage.</p>
      </div>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold text-purple-100">Usage</h2>
          <p className="mt-2 text-sm text-purple-300/70">
            Input tokens: {user?.usageInputTokens ?? 0} · Output tokens:{" "}
            {user?.usageOutputTokens ?? 0} · Cached tokens: {user?.usageCachedTokens ?? 0}
          </p>
          <p className="text-sm text-purple-300/70">
            Cost: ${(user?.usageCostUsd ?? 0).toFixed(4)} / ${(user?.budgetUsd ?? 10).toFixed(2)}{" "}
            cap
          </p>
        </div>
        <ModelSelector
          currentModel={
            user?.preferredTextModel ?? defaultTextModel(user?.adultContentEnabled ?? false)
          }
        />
        <p className="text-xs text-purple-300/60">
          {user?.adultContentEnabled
            ? "Adult content is on — \u2605 starred models are top picks that support adult content."
            : "\u2605 starred models are top frontier picks."}{" "}
          <Link href="/dashboard/settings" className="link-accent">
            Content settings
          </Link>
        </p>
      </section>

      {bitcoin?.ok && (
        <BitcoinDeposit
          address={bitcoin.address}
          qrSvg={bitcoin.qrSvg}
          network={bitcoin.network}
          explorerBase={bitcoin.explorerBase}
          requiredConfirmations={bitcoin.requiredConfirmations}
          initialDeposits={bitcoin.deposits}
          btcUsdPrice={bitcoin.btcUsdPrice}
        />
      )}
      {bitcoin && !bitcoin.ok && (
        <section className="card p-5 text-sm text-purple-300/70">
          Bitcoin deposits are temporarily unavailable. Please try again later.
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-purple-100">Characters</h2>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/public" className="btn-secondary px-3 py-1.5 text-sm">
              Browse public characters
            </Link>
            <Link href="/dashboard/characters/new" className="btn-primary px-3 py-1.5 text-sm">
              New character
            </Link>
          </div>
        </div>
        {characters.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-purple-300/70">No characters yet.</p>
            <Link
              href="/dashboard/characters/new"
              className="btn-primary mt-4 inline-block text-sm"
            >
              Create your first character
            </Link>
          </div>
        ) : (
          <ul className="card divide-y divide-purple-900/40">
            {characters.map((c) => (
              <li key={c.slug as string} className="flex items-center justify-between px-4 py-3">
                <span className="flex items-center gap-2">
                  {c.displayName as string}
                  {user?.adultContentEnabled && c.adultCharacter === true && (
                    <span className="rounded bg-purple-800/50 px-1.5 py-0.5 text-xs text-purple-200">
                      18+
                    </span>
                  )}
                  {Boolean(c.publicId) && (
                    <span className="rounded bg-green-900/50 px-1.5 py-0.5 text-xs text-green-300">
                      Public
                    </span>
                  )}
                </span>
                <Link href={`/dashboard/characters/${c.slug}`} className="link-accent text-sm">
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
