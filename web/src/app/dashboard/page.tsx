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
        <p className="text-purple-300/70">Manage your characters and usage.</p>
      </div>

      <section className="card p-5">
        <h2 className="font-semibold text-purple-100">Usage</h2>
        <p className="mt-2 text-sm text-purple-300/70">
          Input tokens: {user?.usageInputTokens ?? 0} · Output tokens:{" "}
          {user?.usageOutputTokens ?? 0}
        </p>
        <p className="text-sm text-purple-300/70">
          Estimated cost: ${cost.toFixed(4)} / $10.00 cap
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-purple-100">Characters</h2>
          <Link href="/dashboard/characters/new" className="btn-primary px-3 py-1.5 text-sm">
            New character
          </Link>
        </div>
        {characters.length === 0 ? (
          <p className="text-purple-400/50">No characters yet.</p>
        ) : (
          <ul className="card divide-y divide-purple-900/40">
            {characters.map((c) => (
              <li key={c.slug as string} className="flex items-center justify-between px-4 py-3">
                <span>{c.displayName as string}</span>
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
