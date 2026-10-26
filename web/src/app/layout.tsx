import type { Metadata } from "next";
import { Instrument_Serif, Inter, Sora } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { auth, signIn, signOut } from "@/lib/auth";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  weight: ["500", "600", "700", "800"],
  display: "swap",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument",
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AnyChar — any character, brought to life in Discord",
    template: "%s · AnyChar",
  },
  description:
    "Create AI character personas with memory, vision, and per-server setup, then roleplay with them right inside Discord.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${sora.variable} ${instrumentSerif.variable}`}
    >
      <body className="min-h-screen text-purple-50 antialiased">
        <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0a0612]/70 backdrop-blur-xl backdrop-saturate-150">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-3.5">
            <Link href="/" className="group flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#140d24] shadow-[0_0_24px_-4px_rgba(217,70,239,0.6)] ring-1 ring-white/15 transition group-hover:shadow-[0_0_30px_-2px_rgba(236,72,153,0.8)]">
                <Image
                  src="/brand/anychar-mark.png"
                  alt=""
                  width={36}
                  height={36}
                  className="h-7 w-7"
                  preload
                />
              </span>
              <span className="font-display text-lg font-bold tracking-tight text-white">
                AnyChar
              </span>
            </Link>
            <nav className="flex flex-wrap items-center justify-end gap-1 text-sm">
              <Link href="/about" className="nav-link">
                About
              </Link>
              {session?.user ? (
                <>
                  {session.user.approved && (
                    <>
                      <Link href="/dashboard" className="nav-link">
                        Dashboard
                      </Link>
                      <Link href="/dashboard/characters/new" className="nav-link">
                        New character
                      </Link>
                      <Link href="/dashboard/public" className="nav-link">
                        Public characters
                      </Link>
                      <Link href="/dashboard/servers" className="nav-link">
                        Servers
                      </Link>
                      <Link href="/dashboard/dm" className="nav-link">
                        DM
                      </Link>
                      <Link href="/dashboard/settings" className="nav-link">
                        Settings
                      </Link>
                    </>
                  )}
                  {session.user.admin && (
                    <Link href="/admin" className="nav-link">
                      Admin
                    </Link>
                  )}
                  <div className="ml-2 hidden items-center gap-2 sm:flex">
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
                  <form
                    className="ml-2"
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
                  className="ml-2"
                  action={async () => {
                    "use server";
                    await signIn("discord");
                  }}
                >
                  <button type="submit" className="mk-btn-primary mk-btn-sm">
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
