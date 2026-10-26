import Image from "next/image";
import Link from "next/link";

import { botInviteUrl } from "@/lib/config";

export function MarketingFooter() {
  return (
    <footer className="relative border-t border-white/[0.06]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Image src="/brand/anychar-mark.png" alt="" width={32} height={32} className="h-8 w-8" />
          <div>
            <p className="font-display font-semibold text-white">AnyChar</p>
            <p className="text-xs text-purple-200/50">
              Characters for Discord, powered by OpenRouter.
            </p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-purple-200/60">
          <Link href="/" className="transition hover:text-white">
            Home
          </Link>
          <Link href="/about" className="transition hover:text-white">
            About
          </Link>
          <a href={botInviteUrl()} className="transition hover:text-white">
            Add to Discord
          </a>
          <a
            href="https://openrouter.ai"
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-white"
          >
            OpenRouter
          </a>
        </nav>
      </div>
    </footer>
  );
}
