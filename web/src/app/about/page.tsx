import Image from "next/image";
import Link from "next/link";

import { castMember } from "@/components/marketing/cast";
import { MarketingEffects } from "@/components/marketing/effects";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { FaceMark } from "@/components/marketing/face-mark";
import { MarketingFooter } from "@/components/marketing/footer";
import { HeroBackdrop } from "@/components/marketing/hero-backdrop";
import { delay, h2Class, serifAccent } from "@/components/marketing/style";
import { botInviteUrl } from "@/lib/config";

export const metadata = {
  title: "About",
  description:
    "AnyChar lets you create AI character personas for Discord — with memory, images, and per-server configuration.",
};

const TOC = [
  { id: "how-it-works", label: "How it works" },
  { id: "features", label: "Major features" },
  { id: "getting-started", label: "Getting started" },
  { id: "creating", label: "Creating a character" },
  { id: "talking", label: "Talking to the bot" },
  { id: "commands", label: "Discord commands" },
  { id: "good-to-know", label: "Good to know" },
];

const FEATURES = [
  {
    title: "Character profiles",
    desc: "Give each character a name, personality, description, and rules for what it should and shouldn't do.",
  },
  {
    title: "Reply styles",
    desc: "Choose how much the character writes, from quick one-liners to multi-paragraph novella replies.",
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
    desc: "Pick the active character for each Discord server, or up to three that reply in turn, plus your own character in direct messages.",
  },
  {
    title: "Public characters",
    desc: "Publish a character for others to find, or copy someone else's into your own collection and make it yours.",
  },
  {
    title: "Your choice of model",
    desc: "Choose the model that voices your characters from the catalogue available through OpenRouter.",
  },
];

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"];

const STEPS = [
  {
    title: "Sign in with Discord",
    desc: "Log in with your Discord account. Most new accounts are approved automatically; otherwise an admin approves you before you get dashboard access.",
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
    desc: "In a server, run /setcharacter to choose which of your characters is live (join up to three names with &). In DMs, set your character from the dashboard.",
  },
  {
    title: "Start talking",
    desc: "@mention the bot or reply to one of its messages and it responds in character.",
  },
];

const FIELDS = [
  {
    name: "Display name",
    desc: "What the character is called. The bot uses this name in the server.",
    example: "Professor Moth",
  },
  {
    name: "Description",
    desc: "The heart of the character: personality, background, voice, and how it behaves. The more detail, the more consistent the character.",
    example:
      "A gentle, absent-minded archivist of forgotten spells. Speaks softly, misplaces his spectacles constantly, and treats every question as the most interesting one he's heard all week.",
  },
  {
    name: "Loves / Hates",
    desc: "What the character loves doing, having, talking about, or thinking about, and what it hates doing, talking about, hearing about, or thinking about. Loves light the character up; hates sour its mood.",
    example: "Loves candlelight and curious students. Hates dog-eared pages.",
  },
  {
    name: "Reply style",
    desc: "How long replies are: one-liner (brief), semi-lit (a short paragraph), literate (a few paragraphs), or novella (long, detailed).",
  },
  {
    name: "Memory",
    desc: "How much the character remembers: short, medium, or long. Longer memory keeps more history before older moments are summarized.",
  },
  {
    name: "Appearance image",
    desc: "An optional portrait that's always shown to the character so it knows how it looks.",
  },
  {
    name: "Known Users",
    desc: "Up to 5 specific Discord users the character should recognize, each with their own description and optional image.",
    example: "Mira: his most promising, and most reckless, apprentice.",
  },
];

const COMMANDS = [
  { cmd: "/help", desc: "Get a link to the dashboard." },
  { cmd: "/character", desc: "Show which character(s) are active in the current server." },
  { cmd: "/listcharacters", desc: "List the characters available to this server." },
  {
    cmd: "/setcharacter <name>",
    desc: "Set the active character for the server, or up to three joined with & that reply in order. Requires an approved account and the Manage Server permission.",
  },
  { cmd: "/describecharacter <name>", desc: "Show a character's description and portrait." },
];

const NOTES = [
  "A server can have up to three active characters at a time, chosen by someone with the Manage Server permission. You can switch them anytime with /setcharacter.",
  "Memory is kept separately per character and per server (and per DM), so conversations don't bleed across different characters or communities.",
  "The character's portrait represents how it looks, but what's actually happening in a scene is driven by your conversation, so the character keeps up as things change.",
  "New accounts are approved automatically when possible; otherwise they wait for an admin before they can build characters and use the dashboard.",
];

const FAN = [
  { id: "moth", pos: "left-0 top-10 -rotate-[9deg]", float: 0 },
  { id: "marr", pos: "right-0 top-10 rotate-[9deg]", float: 1400 },
  { id: "juniper", pos: "left-1/2 top-0 z-10 -translate-x-1/2", float: 700 },
];

export default function AboutPage() {
  const moth = castMember("moth");

  return (
    <div className="marketing">
      <MarketingEffects />

      {/* Hero */}
      <section data-spotlight className="relative isolate">
        <HeroBackdrop />
        <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 pb-20 pt-14 sm:pt-20 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="mk-rise">
              <Eyebrow>About AnyChar</Eyebrow>
            </div>
            <h1
              className="mk-rise mt-6 font-display text-[clamp(2.6rem,6vw,4.6rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-white"
              style={delay(100)}
            >
              What is <span className={serifAccent}>AnyChar?</span>
            </h1>
            <p
              className="mk-rise mt-7 max-w-2xl text-[clamp(1.02rem,1.4vw,1.15rem)] leading-relaxed text-purple-100/65"
              style={delay(200)}
            >
              AnyChar is a platform for building AI-powered character personas and bringing them
              to life inside Discord. You design a character on the web dashboard, add it to your
              server or DMs, and then chat with it like any other member. It stays in character,
              remembers your conversations, and can even react to images.
            </p>
            <p
              className="mk-rise mt-8 border-l-2 border-pink-300/40 pl-5 font-serif text-2xl italic text-purple-50/85"
              style={delay(300)}
            >
              You write the character. Discord gives it a stage.
            </p>
          </div>

          <div className="mk-rise relative mx-auto h-[23rem] w-full max-w-sm" style={delay(250)}>
            {FAN.map(({ id, pos, float }) => {
              const c = castMember(id);
              return (
                <div key={id} className={`absolute w-40 sm:w-44 ${pos}`}>
                  <div className="mk-float" style={delay(float)}>
                    <div className="relative aspect-[3/4] overflow-hidden rounded-t-full rounded-b-3xl shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/15">
                      <Image src={c.img} alt={c.name} fill sizes="176px" className="object-cover" />
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2">
              <FaceMark size={72} preload />
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="mx-auto grid max-w-6xl gap-12 px-6 pb-8 pt-8 lg:grid-cols-[12rem_1fr] lg:gap-20">
        <aside className="hidden lg:block">
          <nav data-toc aria-label="On this page" className="sticky top-28 text-sm">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-purple-300/40">
              On this page
            </p>
            {TOC.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className="flex items-center gap-3 py-1.5 text-purple-200/50 transition hover:text-white"
              >
                <span className="mk-toc-dot h-1.5 w-1.5 rounded-full bg-white/20 transition duration-300" />
                {t.label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 space-y-28">
          {/* How it works */}
          <section id="how-it-works" data-reveal>
            <Eyebrow n="01">How it works</Eyebrow>
            <h2 className={h2Class}>
              A character, a server, <span className={serifAccent}>a conversation.</span>
            </h2>
            <p className="mt-6 max-w-3xl leading-relaxed text-purple-100/65">
              Every character you create is fully customizable: its personality, how it writes,
              what it knows about the people it talks to, and how it looks. Once a character is
              active in a server or in your DMs, the bot replies in that character&apos;s voice
              whenever you @mention it or reply to one of its messages. Behind the scenes it keeps
              a memory of your conversations so it can refer back to things that happened earlier.
            </p>
            <ol className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              {["You write it on the dashboard", "It goes live in Discord", "It remembers what happened"].map(
                (label, i, all) => (
                  <li key={label} className="flex items-center gap-3 sm:flex-1">
                    <span className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-purple-50/85">
                      <span className="mr-2 font-mono text-xs text-pink-300/70">0{i + 1}</span>
                      {label}
                    </span>
                    {i < all.length - 1 && (
                      <span
                        aria-hidden
                        className="hidden h-px flex-1 bg-linear-to-r from-pink-300/50 to-purple-400/10 sm:block"
                      />
                    )}
                  </li>
                ),
              )}
            </ol>
          </section>

          {/* Features */}
          <section id="features">
            <div data-reveal>
              <Eyebrow n="02">Major features</Eyebrow>
              <h2 className={h2Class}>
                Everything a character needs <span className={serifAccent}>to feel real.</span>
              </h2>
            </div>
            <dl className="mt-10 border-t border-white/[0.07]">
              {FEATURES.map((f, i) => (
                <div
                  key={f.title}
                  data-reveal
                  className="group grid gap-2 border-b border-white/[0.07] py-6 sm:grid-cols-[15rem_1fr] sm:gap-8"
                >
                  <dt className="flex items-baseline gap-3 font-display font-semibold text-white">
                    <span className="w-7 font-serif text-xl font-normal italic text-pink-300/60 transition group-hover:text-pink-200">
                      {ROMAN[i]}
                    </span>
                    {f.title}
                  </dt>
                  <dd className="leading-relaxed text-purple-100/60">{f.desc}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Getting started */}
          <section id="getting-started">
            <div data-reveal>
              <Eyebrow n="03">Getting started</Eyebrow>
              <h2 className={h2Class}>
                Five steps to <span className={serifAccent}>curtain up.</span>
              </h2>
            </div>
            <ol className="relative mt-12 space-y-10 pl-14">
              <div
                aria-hidden
                className="absolute bottom-2 left-[17.5px] top-2 w-px bg-linear-to-b from-purple-400/70 via-pink-400/40 to-transparent"
              />
              {STEPS.map((s, i) => (
                <li key={s.title} data-reveal style={delay(i * 80)} className="relative">
                  <span className="absolute -left-14 top-0 flex h-9 w-9 items-center justify-center rounded-full border border-pink-300/30 bg-[#0d0919] font-mono text-xs text-pink-200 shadow-[0_0_24px_rgba(236,72,153,0.35)]">
                    {i + 1}
                  </span>
                  <h3 className="pt-1.5 font-display text-lg font-semibold text-white">{s.title}</h3>
                  <p className="mt-1.5 max-w-2xl leading-relaxed text-purple-100/60">{s.desc}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* Creating a character */}
          <section id="creating">
            <div data-reveal>
              <Eyebrow n="04">Creating a character</Eyebrow>
              <h2 className={h2Class}>
                Anatomy of <span className={serifAccent}>a character.</span>
              </h2>
              <p className="mt-6 max-w-3xl leading-relaxed text-purple-100/65">
                On the dashboard, each character is built from a few simple fields. Here&apos;s how
                they come together for one of ours.
              </p>
            </div>
            <div className="mt-12 grid gap-12 md:grid-cols-[13rem_1fr]">
              <figure data-reveal className="md:sticky md:top-28 md:self-start">
                <div className="relative mx-auto aspect-[3/4] w-48 overflow-hidden rounded-t-full rounded-b-3xl shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/15 md:w-full">
                  <Image
                    src={moth.img}
                    alt={`${moth.name}, an example character`}
                    fill
                    sizes="208px"
                    className="object-cover"
                  />
                </div>
                <figcaption className="mt-4 text-center">
                  <p className="font-serif text-2xl italic text-white">{moth.name}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-purple-300/50">
                    Example character
                  </p>
                </figcaption>
              </figure>
              <dl className="space-y-9">
                {FIELDS.map((f) => (
                  <div key={f.name} data-reveal className="relative pl-6">
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-linear-to-br from-purple-300 to-pink-400 shadow-[0_0_10px_rgba(244,114,182,0.6)]"
                    />
                    <dt className="font-mono text-xs uppercase tracking-[0.18em] text-pink-200/75">
                      {f.name}
                    </dt>
                    <dd className="mt-2 leading-relaxed text-purple-100/65">{f.desc}</dd>
                    {f.example && (
                      <dd className="mt-3 border-l-2 border-purple-400/30 pl-4 font-serif text-xl italic leading-snug text-purple-50/80">
                        “{f.example}”
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {/* Talking to the bot */}
          <section id="talking">
            <div data-reveal>
              <Eyebrow n="05">Talking to the bot</Eyebrow>
              <h2 className={h2Class}>
                Two ways to <span className={serifAccent}>start a scene.</span>
              </h2>
              <p className="mt-6 max-w-3xl leading-relaxed text-purple-100/65">
                The bot responds two ways: <span className="text-white">@mention</span> it in a
                message, or <span className="text-white">reply</span> to one of its messages.
                Replying keeps a back-and-forth thread of context, while a fresh @mention starts a
                new exchange that still draws on the character&apos;s memories. You can also send
                images and the character will respond to what it sees.
              </p>
            </div>
            <div className="mt-10 grid gap-10 md:grid-cols-2">
              {[
                {
                  label: "@mention",
                  note: "Starts a fresh exchange",
                  user: "@Juniper got any tea left?",
                  reply: "For you? Only the suspicious kind. Sit.",
                },
                {
                  label: "Reply",
                  note: "Continues the thread",
                  user: "…what makes it suspicious",
                  reply: "The fact that you asked. Drink up.",
                },
              ].map((ex, i) => (
                <div key={ex.label} data-reveal style={delay(i * 120)}>
                  <p className="flex items-baseline gap-3">
                    <span className="font-display text-lg font-semibold text-white">{ex.label}</span>
                    <span className="text-sm text-purple-200/50">{ex.note}</span>
                  </p>
                  <div className="mt-4 space-y-3 border-l border-white/10 pl-5 text-[0.92rem]">
                    <p>
                      <span className="font-semibold text-[#f472b6]">mira</span>{" "}
                      <span className="text-white/75">{ex.user}</span>
                    </p>
                    <p>
                      <span className="font-semibold text-purple-100">Juniper</span>{" "}
                      <span className="rounded-[0.25rem] bg-[#5865f2] px-1 py-px text-[0.58rem] font-bold uppercase text-white">
                        App
                      </span>{" "}
                      <em className="text-purple-200/70">flicks an ear</em>{" "}
                      <span className="text-white/75">{ex.reply}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Commands */}
          <section id="commands">
            <div data-reveal>
              <Eyebrow n="06">Discord commands</Eyebrow>
              <h2 className={h2Class}>
                Five commands, <span className={serifAccent}>that&apos;s all.</span>
              </h2>
            </div>
            <div
              data-reveal
              className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0915]/90 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)]"
            >
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                <span className="ml-3 font-mono text-xs text-white/35">slash commands</span>
              </div>
              <ul className="divide-y divide-white/[0.05]">
                {COMMANDS.map((c) => (
                  <li
                    key={c.cmd}
                    className="grid gap-1.5 px-5 py-4 transition hover:bg-white/[0.02] sm:grid-cols-[15rem_1fr] sm:gap-6"
                  >
                    <code className="font-mono text-sm text-pink-200">{c.cmd}</code>
                    <span className="text-sm leading-relaxed text-purple-100/60">{c.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Good to know */}
          <section id="good-to-know">
            <div data-reveal>
              <Eyebrow n="07">Good to know</Eyebrow>
              <h2 className={h2Class}>
                The <span className={serifAccent}>fine print.</span>
              </h2>
            </div>
            <ol className="mt-10 space-y-8">
              {NOTES.map((note, i) => (
                <li key={note} data-reveal className="flex gap-6">
                  <span className="mk-gradient-text w-8 shrink-0 font-serif text-4xl italic leading-none">
                    {i + 1}
                  </span>
                  <p className="max-w-3xl pt-1 leading-relaxed text-purple-100/65">{note}</p>
                </li>
              ))}
            </ol>
          </section>
        </article>
      </div>

      {/* CTA */}
      <section className="relative isolate overflow-hidden py-24 sm:py-32">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 mx-auto h-[30rem] max-w-3xl rounded-full bg-[radial-gradient(closest-side,rgba(192,38,211,0.2),transparent)]"
        />
        <div data-reveal className="mx-auto flex max-w-2xl flex-col items-center px-6 text-center">
          <h2 className={h2Class}>
            Ready to <span className={serifAccent}>try it?</span>
          </h2>
          <p className="mt-5 max-w-xl leading-relaxed text-purple-100/60">
            Sign in with Discord to create your first character, then invite the bot to your
            server.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/" className="mk-btn-primary">
              Get started
            </Link>
            <a href={botInviteUrl()} className="mk-btn-ghost">
              Add the bot to Discord
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
