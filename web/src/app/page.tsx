import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/lib/auth";
import { botInviteUrl } from "@/lib/config";

export default async function HomePage() {
  const session = await auth();

  if (session?.user?.approved) {
    redirect("/dashboard");
  }

  if (session?.user) {
    return (
      <div className="mx-auto max-w-lg space-y-6 pt-8">
        <div className="card p-8 text-center">
          {session.user.image && (
            <Image
              src={session.user.image}
              alt=""
              width={72}
              height={72}
              className="mx-auto rounded-full ring-4 ring-purple-600/40"
            />
          )}
          <p className="mt-4 text-sm font-medium uppercase tracking-wider text-purple-400">
            You&apos;re logged in
          </p>
          <h1 className="mt-2 text-2xl font-bold text-purple-50">
            Welcome, {session.user.name}
          </h1>
          <p className="mt-3 text-purple-300/80">
            Your account is awaiting admin approval. You&apos;ll get access to the dashboard once
            approved.
          </p>
          <Link
            href="/pending"
            className="mt-6 inline-block btn-primary text-sm"
          >
            View status
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 pt-4">
      <section className="space-y-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-purple-400">
          Discord roleplay, reimagined
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          <span className="bg-gradient-to-br from-white via-purple-200 to-purple-400 bg-clip-text text-transparent">
            AnyChar
          </span>
        </h1>
        <p className="mx-auto max-w-xl text-lg text-purple-300/80">
          Create rich character personas with memories, multimodal images, and per-server
          configuration — powered by your own OpenRouter key.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("discord");
          }}
          className="pt-2"
        >
          <button type="submit" className="btn-primary text-base">
            Get started with Discord
          </button>
        </form>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Character profiles",
            desc: "Build detailed personas with traits, reply styles, and Known Users.",
          },
          {
            title: "Server pools",
            desc: "Link guilds and switch active characters with slash commands.",
          },
          {
            title: "Smart memories",
            desc: "Short and long-term memory keeps conversations coherent over time.",
          },
        ].map((item) => (
          <div key={item.title} className="card p-5">
            <h2 className="font-semibold text-purple-100">{item.title}</h2>
            <p className="mt-2 text-sm text-purple-300/70">{item.desc}</p>
          </div>
        ))}
      </section>

      <p className="text-center text-sm text-purple-400/60">
        After approval, invite the bot:{" "}
        <a className="link-accent" href={botInviteUrl()}>
          Add to Discord
        </a>
      </p>
    </div>
  );
}
