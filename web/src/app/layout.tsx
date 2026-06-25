import Link from "next/link";
import type { ReactNode } from "react";

import { auth, signIn, signOut } from "@/lib/auth";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <header className="border-b border-zinc-800 px-6 py-4">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <Link href="/" className="text-lg font-semibold">
              AnyChar
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              {session?.user ? (
                <>
                  {session.user.approved && (
                    <>
                      <Link href="/dashboard">Dashboard</Link>
                      <Link href="/dashboard/servers">Servers</Link>
                      <Link href="/dashboard/dm">DM</Link>
                    </>
                  )}
                  {session.user.admin && <Link href="/admin">Admin</Link>}
                  <form
                    action={async () => {
                      "use server";
                      await signOut();
                    }}
                  >
                    <button type="submit" className="text-zinc-400 hover:text-white">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <form
                  action={async () => {
                    "use server";
                    await signIn("discord");
                  }}
                >
                  <button
                    type="submit"
                    className="rounded bg-indigo-600 px-3 py-1.5 font-medium hover:bg-indigo-500"
                  >
                    Login with Discord
                  </button>
                </form>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
