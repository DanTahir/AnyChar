import Link from "next/link";

import { botInviteUrl } from "@/lib/config";

export const metadata = {
  title: "About AnyChar",
  description:
    "AnyChar lets you create AI character personas for Discord — with memory, images, and per-server configuration.",
};

const features = [
  {
    title: "Character profiles",
    desc: "Give each character a name, personality, description, and rules for what it should and shouldn't do.",
  },
  {
    title: "Reply styles",
    desc: "Choose how much the character writes — from quick one-liners to multi-paragraph novella replies.",
  },
  {
    title: "Persistent memory",
    desc: "Characters remember past conversations. Recent exchanges and older history are kept so chats stay coherent over time.",
  },
  {
    title: "Known Users",
    desc: "Teach a character about specific people (up to 5) so it recognizes them and treats them consistently.",
  },
  {
    title: "Images & vision",
    desc: "Upload a character portrait that's always present, add per-person images, and the character can see images you send.",
  },
  {
    title: "Per-server & DM setup",
    desc: "Run a different active character in each Discord server, plus your own character in direct messages.",
  },
];

const commands = [
  { cmd: "/help", desc: "Get a link to the dashboard." },
  { cmd: "/character", desc: "Show which character is active in the current server." },
  { cmd: "/listcharacters", desc: "List the characters available to this server." },
  {
    cmd: "/setcharacter <name>",
    desc: "Set the active character for the server. Requires an approved account and the Manage Server permission.",
  },
  {
    cmd: "/describecharacter <name>",
    desc: "Show a character's description and portrait.",
  },
];

const steps = [
  {
    title: "Sign in with Discord",
    desc: "Log in with your Discord account. New accounts wait for a quick admin approval before getting dashboard access.",
  },
  {
    title: "Create a character",
    desc: "From the dashboard, open New Character and fill in a name, description, personality, and reply style. Optionally upload a portrait.",
  },
  {
    title: "Invite the bot",
    desc: "Add the bot to a Discord server you manage, or set a character to use in your direct messages.",
  },
  {
    title: "Pick the active character",
    desc: "In a server, run /setcharacter to choose which of your characters is live. In DMs, set your character from the dashboard.",
  },
  {
    title: "Start talking",
    desc: "@mention the bot or reply to one of its messages and it responds in character.",
  },
];

export default function AboutPage() {
  return (
    <div className="space-y-14 pt-2">
      <section className="space-y-5 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-purple-400">
          About
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          <span className="bg-gradient-to-br from-white via-purple-200 to-purple-400 bg-clip-text text-transparent">
            What is AnyChar?
          </span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-purple-300/80">
          AnyChar is a platform for building AI-powered character personas and bringing them to
          life inside Discord. You design a character on the web dashboard, add it to your server
          or DMs, and then chat with it like any other member — it stays in character, remembers
          your conversations, and can even react to images.
        </p>
      </section>

      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-purple-50">How it works</h2>
        <p className="max-w-3xl text-purple-300/80">
          Every character you create is fully customizable: its personality, how it writes, what
          it knows about the people it talks to, and how it looks. Once a character is active in a
          server or in your DMs, the bot replies in that character&apos;s voice whenever you
          @mention it or reply to one of its messages. Behind the scenes it keeps a memory of your
          conversations so it can refer back to things that happened earlier.
        </p>
      </section>

      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-purple-50">Major features</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="card p-5">
              <h3 className="font-semibold text-purple-100">{f.title}</h3>
              <p className="mt-2 text-sm text-purple-300/70">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-purple-50">Getting started</h2>
        <ol className="space-y-4">
          {steps.map((s, i) => (
            <li key={s.title} className="card flex gap-4 p-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600 text-sm font-bold text-white shadow-lg shadow-purple-900/40">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold text-purple-100">{s.title}</h3>
                <p className="mt-1 text-sm text-purple-300/70">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-purple-50">Creating a character</h2>
        <p className="max-w-3xl text-purple-300/80">
          On the dashboard, each character is built from a few simple fields:
        </p>
        <ul className="space-y-3">
          {[
            {
              name: "Display name",
              desc: "What the character is called. The bot uses this name in the server.",
            },
            {
              name: "Description",
              desc: "The heart of the character — personality, background, voice, and how it behaves. The more detail, the more consistent the character.",
            },
            {
              name: "Should do / Should never do",
              desc: "Short guidance the character always tries to follow, and hard limits it must avoid.",
            },
            {
              name: "Reply style",
              desc: "How long replies are: one-liner (brief), semi-lit (a short paragraph), literate (a few paragraphs), or novella (long, detailed).",
            },
            {
              name: "Appearance image",
              desc: "An optional portrait that's always shown to the character so it knows how it looks.",
            },
            {
              name: "Known Users",
              desc: "Up to 5 specific Discord users the character should recognize, each with their own description and optional image.",
            },
          ].map((field) => (
            <li key={field.name} className="card p-4">
              <span className="font-medium text-purple-100">{field.name}</span>
              <span className="text-sm text-purple-300/70"> — {field.desc}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-purple-50">Talking to the bot</h2>
        <p className="max-w-3xl text-purple-300/80">
          The bot responds two ways: <span className="text-purple-100">@mention</span> it in a
          message, or <span className="text-purple-100">reply</span> to one of its messages.
          Replying keeps a back-and-forth thread of context, while a fresh @mention starts a new
          exchange that still draws on the character&apos;s memories. You can also send images and
          the character will respond to what it sees.
        </p>
      </section>

      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-purple-50">Discord commands</h2>
        <div className="space-y-3">
          {commands.map((c) => (
            <div key={c.cmd} className="card p-4">
              <code className="rounded bg-purple-900/40 px-2 py-1 text-sm font-semibold text-purple-100">
                {c.cmd}
              </code>
              <span className="ml-3 text-sm text-purple-300/70">{c.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-2xl font-bold text-purple-50">Good to know</h2>
        <ul className="space-y-3">
          {[
            "Each server has one active character at a time, chosen by someone with the Manage Server permission. You can switch it anytime with /setcharacter.",
            "Memory is kept separately per character and per server (and per DM), so conversations don't bleed across different characters or communities.",
            "The character's portrait represents how it looks, but what's actually happening in a scene is driven by your conversation — so the character keeps up as things change.",
            "New accounts require admin approval before they can build characters and use the dashboard.",
          ].map((note) => (
            <li key={note} className="card p-4 text-sm text-purple-300/80">
              {note}
            </li>
          ))}
        </ul>
      </section>

      <section className="card flex flex-col items-center gap-4 p-8 text-center">
        <h2 className="text-2xl font-bold text-purple-50">Ready to try it?</h2>
        <p className="max-w-xl text-purple-300/80">
          Sign in with Discord to create your first character, then invite the bot to your server.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/" className="btn-primary text-sm">
            Get started
          </Link>
          <a href={botInviteUrl()} className="btn-secondary text-sm">
            Add the bot to Discord
          </a>
        </div>
      </section>
    </div>
  );
}
