import type { ReactNode } from "react";

import { signIn } from "@/lib/auth";

import { DiscordIcon } from "./icons";

/** Server-action form that starts the Discord OAuth sign-in. Server components only. */
export function SignInButton({
  children,
  className = "mk-btn-primary",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("discord");
      }}
    >
      <button type="submit" className={className}>
        <DiscordIcon className="h-5 w-5" />
        {children}
      </button>
    </form>
  );
}
