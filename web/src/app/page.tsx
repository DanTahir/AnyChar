import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CastMarquee } from "@/components/marketing/cast-marquee";
import { CharacterSheet } from "@/components/marketing/character-sheet";
import { ChatScene } from "@/components/marketing/chat-scene";
import { MarketingEffects } from "@/components/marketing/effects";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { FaceMark } from "@/components/marketing/face-mark";
import { MarketingFooter } from "@/components/marketing/footer";
import { HeroBackdrop } from "@/components/marketing/hero-backdrop";
import { SparkleIcon } from "@/components/marketing/icons";
import { SignInButton } from "@/components/marketing/sign-in-button";
import { delay, h2Class, serifAccent } from "@/components/marketing/style";
import { Typewriter } from "@/components/marketing/typewriter";
import { auth } from "@/lib/auth";
import { botInviteUrl } from "@/lib/config";

const TYPED_NAMES = [
  "Captain Vela",
  "Sir Barnaby",
  "BOLT-7",
  "Professor Moth",
  "your D&D party's bard",
  "literally anyone",
];

const HERO_POINTS = [
  "Hundreds of models",
  "Long-term memory",
  "Image vision",
  "Up to 3 characters per server",
];

const ACTS: {
  act: string;
  title: string;
  body: string;
  points: string[];
  art?: { src: string; alt: string };
}[] = [
  {
    act: "Act I",
    title: "Write the soul",
    body: "Give a character a name, a voice and a history. Tell it what it loves and what sours its mood, pick how much it writes, and introduce it to the people it should know by sight.",
    points: [
      "Personality, backstory and rules in plain words",
      "Loves and hates that shape its mood",
      "Four reply styles, from one-liners to novellas",
      "Up to five Known Users, each with notes and a photo",
    ],
  },
  {
    act: "Act II",
    title: "It remembers",
    body: "Every exchange is distilled into short-term memories, and older history is folded into long-term ones. Memory is kept per character and per server, so your tavern regulars never leak into your noir campaign.",
    points: [
      "Short- and long-term memory tiers",
      "Separate memories for every server and DM",
      "Choose how much each character remembers",
    ],
    art: {
      src: "/brand/art-memory.webp",
      alt: "A glowing journal unravelling into threads of remembered moments",
    },
  },
  {
    act: "Act III",
    title: "It sees",
    body: "Upload a portrait so the character knows how it looks, add photos of the people it knows, and drop images into the chat. It reacts to what's actually in them.",
    points: [
      "A portrait that's always part of the character",
      "Per-person images for Known Users",
      "Understands images you send mid-scene",
    ],
    art: {
      src: "/brand/art-vision.webp",
      alt: "A stained-glass eye reading floating photographs",
    },
  },
  {
    act: "Act IV",
    title: "Every server, its own stage",
    body: "Link your servers and choose who's on stage in each one. Run up to three characters at once and they'll take turns replying, or keep a favourite of your own in your DMs.",
    points: [
      "A different cast for every server",
      "Up to three characters replying in turn",
      "Your own character in direct messages",
    ],
    art: {
      src: "/brand/art-stages.webp",
      alt: "Floating theatre stages, each lighting a different character",
    },
  },
];

const STEPS = [
  { title: "Sign in with Discord", desc: "One click. Your Discord account is your AnyChar account." },
  { title: "Write a character", desc: "A name, a soul, and optionally a portrait." },
  { title: "Invite the bot", desc: "To any server you manage, or just use your DMs." },
  { title: "@mention it", desc: "It answers in character. Reply to keep the thread going." },
];

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
          <h1 className="mt-2 font-display text-2xl font-bold text-purple-50">
            Welcome, {session.user.name}
          </h1>
          <p className="mt-3 text-purple-300/80">
            Your account is awaiting admin approval. You&apos;ll get access to the dashboard once
            approved.
          </p>
          <Link href="/pending" className="mt-6 inline-block btn-primary text-sm">
            View status
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="marketing">
      <MarketingEffects />

      {/* Hero */}
      <section data-spotlight className="relative isolate">
        <HeroBackdrop />
        <div className="mx-auto grid max-w-6xl items-center gap-20 px-6 pb-24 pt-14 sm:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:pb-32">
          <div>
            <p className="mk-rise inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-purple-100/80 backdrop-blur">
              <span className="mk-ping h-2 w-2 rounded-full bg-emerald-400" />
              Discord roleplay, reimagined
            </p>
            <h1 className="mt-7 font-display text-[clamp(2.4rem,4.6vw,4.1rem)] font-extrabold leading-[1.02] tracking-[-0.035em] text-white">
              <span className="mk-rise block" style={delay(80)}>
                Any character,
              </span>
              <span className="mk-rise block" style={delay(180)}>
                <span className={serifAccent}>brought to life</span>
              </span>
              <span className="mk-rise block lg:whitespace-nowrap" style={delay(280)}>
                in your Discord.
              </span>
            </h1>
            <p
              className="mk-rise mt-7 font-mono text-sm text-purple-200/60 sm:text-base"
              style={delay(380)}
            >
              <span className="text-pink-300/80">/setcharacter</span>{" "}
              <Typewriter phrases={TYPED_NAMES} className="text-white" />
            </p>
            <p
              className="mk-rise mt-5 max-w-xl text-[clamp(1.02rem,1.4vw,1.15rem)] leading-relaxed text-purple-100/65"
              style={delay(460)}
            >
              Write a character once (its voice, its history, the people it knows) and AnyChar
              plays it in your servers and DMs. It remembers your stories, sees your images, and
              stays in character.
            </p>
            <div className="mk-rise mt-9 flex flex-wrap items-center gap-3" style={delay(540)}>
              <SignInButton>Get started with Discord</SignInButton>
              <Link href="/about" className="mk-btn-ghost">
                How it works <span aria-hidden>→</span>
              </Link>
            </div>
            <ul
              className="mk-rise mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-purple-200/50"
              style={delay(620)}
            >
              {HERO_POINTS.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <span aria-hidden className="h-1 w-1 rounded-full bg-pink-300/70" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="mk-rise" style={delay(300)}>
            <ChatScene />
          </div>
        </div>
      </section>

      {/* The cast */}
      <section className="relative py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div
            data-reveal
            className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between"
          >
            <div>
              <Eyebrow n="01">The cast</Eyebrow>
              <h2 className={h2Class}>
                If you can describe it,
                <br />
                <span className={serifAccent}>it can play it.</span>
              </h2>
            </div>
            <p className="max-w-sm leading-relaxed text-purple-100/60">
              Starship captains, noir detectives, a robot barista, your D&amp;D party&apos;s bard
              or your actual cat. Every one of them starts as a few paragraphs of text.
            </p>
          </div>
        </div>
        <div data-reveal className="mt-14">
          <CastMarquee />
        </div>
      </section>

      {/* Acts */}
      <section className="relative isolate py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div data-reveal className="max-w-2xl">
            <Eyebrow n="02">The craft</Eyebrow>
            <h2 className={h2Class}>
              A character in <span className={serifAccent}>four acts.</span>
            </h2>
          </div>

          <div className="mt-20 space-y-28">
            {ACTS.map((a, i) => (
              <article
                key={a.title}
                className="grid items-center gap-12 md:grid-cols-2 md:gap-16"
              >
                <div data-reveal className={i % 2 ? "md:order-2" : ""}>
                  {a.art ? (
                    <div className="relative">
                      <div
                        aria-hidden
                        className="absolute inset-[12%] -z-10 rounded-full bg-fuchsia-600/25 blur-3xl"
                      />
                      <Image
                        src={a.art.src}
                        alt={a.art.alt}
                        width={1400}
                        height={933}
                        sizes="(min-width: 768px) 50vw, 100vw"
                        className="mk-art-fade h-auto w-full"
                      />
                    </div>
                  ) : (
                    <CharacterSheet />
                  )}
                </div>
                <div data-reveal style={delay(120)}>
                  <p className="font-serif text-2xl italic text-pink-200/80">{a.act}</p>
                  <h3 className="mt-2 font-display text-[clamp(1.6rem,2.6vw,2.2rem)] font-bold tracking-tight text-white">
                    {a.title}
                  </h3>
                  <p className="mt-4 max-w-lg leading-relaxed text-purple-100/65">{a.body}</p>
                  <ul className="mt-6 space-y-3">
                    {a.points.map((p) => (
                      <li key={p} className="flex items-start gap-3 text-sm text-purple-100/80">
                        <SparkleIcon className="mt-0.5 h-4 w-4 shrink-0 text-pink-300/80" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="relative py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div data-reveal className="max-w-2xl">
            <Eyebrow n="03">Curtain up</Eyebrow>
            <h2 className={h2Class}>
              From zero to roleplay <span className={serifAccent}>in four moves.</span>
            </h2>
          </div>
          <ol className="relative mt-16 grid gap-10 md:grid-cols-4 md:gap-8">
            <div
              aria-hidden
              className="absolute bottom-2 left-[1.15rem] top-2 w-px bg-linear-to-b from-purple-400/60 via-pink-400/40 to-transparent md:bottom-auto md:left-0 md:right-0 md:top-[1.15rem] md:h-px md:w-auto md:bg-linear-to-r"
            />
            {STEPS.map((s, i) => (
              <li key={s.title} data-reveal style={delay(i * 120)} className="relative pl-14 md:pl-0">
                <span className="absolute left-0 top-0 flex h-[2.3rem] w-[2.3rem] items-center justify-center rounded-full border border-pink-300/30 bg-[#0d0919] font-mono text-xs text-pink-200 shadow-[0_0_24px_rgba(236,72,153,0.35)] md:relative">
                  0{i + 1}
                </span>
                <h3 className="font-display text-lg font-semibold text-white md:mt-6">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-purple-100/60">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative isolate overflow-hidden py-24 sm:py-36">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 mx-auto h-[36rem] max-w-4xl rounded-full bg-[radial-gradient(closest-side,rgba(192,38,211,0.22),transparent)]"
        />
        <div data-reveal className="mx-auto flex max-w-3xl flex-col items-center px-6 text-center">
          <div className="mk-float">
            <FaceMark size={112} />
          </div>
          <h2 className={`${h2Class} mt-12`}>
            Someone&apos;s waiting <span className={serifAccent}>to meet you.</span>
          </h2>
          <p className="mt-5 max-w-xl leading-relaxed text-purple-100/60">
            Sign in with Discord, write your first character, and invite the bot. Most new
            accounts are approved automatically.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <SignInButton>Sign in with Discord</SignInButton>
            <a href={botInviteUrl()} className="mk-btn-ghost">
              Add the bot to a server
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
