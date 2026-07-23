import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { DEFAULT_TEXT_MODEL } from "@/lib/models";
import { getAppUser, listCharacters } from "@/lib/users";

import AgeGate from "./age-gate";
import ModelSelector from "./model-selector";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  if (!session.user.approved) redirect("/pending");

  const user = await getAppUser(session.user.id);
  if (user && user.age18plus === undefined) {
    return <AgeGate />;
  }
  const characters = await listCharacters(session.user.id);

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
        <ModelSelector currentModel={user?.preferredTextModel ?? DEFAULT_TEXT_MODEL} />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-purple-100">Characters</h2>
          <Link href="/dashboard/characters/new" className="btn-primary px-3 py-1.5 text-sm">
            New character
          </Link>
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
