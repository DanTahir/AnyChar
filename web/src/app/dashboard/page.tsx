import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { estimateCostUsd } from "@/lib/config";
import { getAppUser, listCharacters } from "@/lib/users";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (!session.user.approved) redirect("/pending");

  const user = await getAppUser(session.user.id);
  const characters = await listCharacters(session.user.id);
  const cost = estimateCostUsd(
    user?.usageInputTokens ?? 0,
    user?.usageOutputTokens ?? 0,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-zinc-400">Manage your characters and usage.</p>
      </div>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h2 className="font-semibold">Usage</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Input tokens: {user?.usageInputTokens ?? 0} · Output tokens:{" "}
          {user?.usageOutputTokens ?? 0}
        </p>
        <p className="text-sm text-zinc-400">
          Estimated cost: ${cost.toFixed(4)} / $10.00 cap
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Characters</h2>
          <Link
            href="/dashboard/characters/new"
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm hover:bg-indigo-500"
          >
            New character
          </Link>
        </div>
        {characters.length === 0 ? (
          <p className="text-zinc-500">No characters yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {characters.map((c) => (
              <li key={c.slug as string} className="flex items-center justify-between px-4 py-3">
                <span>{c.displayName as string}</span>
                <Link
                  href={`/dashboard/characters/${c.slug}`}
                  className="text-sm text-indigo-400 hover:underline"
                >
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
