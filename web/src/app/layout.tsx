import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

import { auth, signIn, signOut } from "@/lib/auth";

import "./globals.css";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <html lang="en">
      <body className="min-h-screen text-purple-50 antialiased">
        <header className="border-b border-purple-900/40 bg-[#0a0612]/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-sm font-bold shadow-lg shadow-purple-900/50">
                A
              </span>
              <span className="bg-gradient-to-r from-purple-200 to-purple-400 bg-clip-text text-transparent">
                AnyChar
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/about" className="link-accent">
                About
              </Link>
              {session?.user ? (
                <>
                  <div className="hidden items-center gap-2 sm:flex">
                    {session.user.image && (
                      <Image
                        src={session.user.image}
                        alt=""
                        width={28}
                        height={28}
                        className="rounded-full ring-2 ring-purple-600/50"
                      />
                    )}
                    <span className="text-purple-200">
                      {session.user.name ?? "Signed in"}
                    </span>
                  </div>
                  {session.user.approved && (
                    <>
                      <Link href="/dashboard" className="link-accent">
                        Dashboard
                      </Link>
                      <Link href="/dashboard/characters/new" className="link-accent">
                        New character
                      </Link>
                      <Link href="/dashboard/servers" className="link-accent">
                        Servers
                      </Link>
                      <Link href="/dashboard/dm" className="link-accent">
                        DM
                      </Link>
                    </>
                  )}
                  {session.user.admin && (
                    <Link href="/admin" className="link-accent">
                      Admin
                    </Link>
                  )}
                  <form
                    action={async () => {
                      "use server";
                      await signOut();
                    }}
                  >
                    <button type="submit" className="btn-secondary">
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
                  <button type="submit" className="btn-primary px-4 py-2 text-sm">
                    Login with Discord
                  </button>
                </form>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
