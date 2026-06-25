import { redirect } from "next/navigation";

import { auth, signIn } from "@/lib/auth";
import { botInviteUrl } from "@/lib/config";

export default async function HomePage() {
  const session = await auth();

  if (session?.user?.approved) {
    redirect("/dashboard");
  }

  if (session?.user && !session.user.approved) {
    redirect("/pending");
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">AnyChar</h1>
        <p className="mt-2 max-w-xl text-zinc-400">
          Create Discord roleplay characters with per-server configuration, memories, and
          multimodal personas.
        </p>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("discord");
        }}
      >
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium hover:bg-indigo-500"
        >
          Get started with Discord
        </button>
      </form>
      <p className="text-sm text-zinc-500">
        After approval, invite the bot:{" "}
        <a className="text-indigo-400 underline" href={botInviteUrl()}>
          Add to Discord
        </a>
      </p>
    </div>
  );
}
