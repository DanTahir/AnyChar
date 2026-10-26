"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { castMember, type CastMember } from "./cast";
import { FaceMark } from "./face-mark";
import { HashIcon, SparkleIcon } from "./icons";
import { delay } from "./style";

type Author = "bot" | { name: string; color: string };

type Msg = {
  author: Author;
  time: string;
  /** `*action*` renders as italics, `@[Name]` as a Discord mention. */
  text: string;
  replyTo?: { name: string; text: string };
};

type Scene = {
  channel: string;
  character: CastMember;
  messages: Msg[];
  memory: string;
};

const MIRA = { name: "mira", color: "#f472b6" };
const SAM = { name: "sam", color: "#60a5fa" };
const OLI = { name: "oli", color: "#34d399" };
const JULES = { name: "jules", color: "#fbbf24" };

const SCENES: Scene[] = [
  {
    channel: "wraith-bridge",
    character: castMember("vela"),
    memory: "Sam still hasn't forgiven the three-day drift.",
    messages: [
      { author: MIRA, time: "9:41 PM", text: "@[Captain Vela] the engines are making *that* noise again" },
      {
        author: "bot",
        time: "9:41 PM",
        replyTo: { name: "mira", text: "the engines are making that noise again" },
        text: "*kicks the console twice without looking up* There. Purring like a kitten. Don't tell the Guild I fixed it with my boot.",
      },
      {
        author: SAM,
        time: "9:42 PM",
        replyTo: { name: "Captain Vela", text: "There. Purring like a kitten…" },
        text: "you said that last time and we drifted for three days",
      },
    ],
  },
  {
    channel: "castle-courtyard",
    character: castMember("barnaby"),
    memory: "Oli is the squire. The moat is under threat.",
    messages: [
      { author: OLI, time: "2:13 PM", text: "@[Sir Barnaby] there's a DRAGON at the gate!!" },
      {
        author: "bot",
        time: "2:13 PM",
        replyTo: { name: "oli", text: "there's a DRAGON at the gate!!" },
        text: "*rises from his sunbeam with tremendous dignity* Then it shall taste my steel. After my nap. Fetch my second-best cushion, squire.",
      },
      {
        author: OLI,
        time: "2:14 PM",
        replyTo: { name: "Sir Barnaby", text: "Then it shall taste my steel…" },
        text: "it's eating the moat",
      },
    ],
  },
  {
    channel: "late-night-cafe",
    character: castMember("bolt"),
    memory: "Jules has a 9am deadline. Again.",
    messages: [
      { author: JULES, time: "1:07 AM", text: "@[BOLT-7] I need something strong. deadline at 9am" },
      {
        author: "bot",
        time: "1:07 AM",
        replyTo: { name: "jules", text: "I need something strong. deadline at 9am" },
        text: "*whirrs thoughtfully* One triple espresso. Also: you said this exact sentence before your last deadline, and you crushed it. BEEP BOOP. You've got this.",
      },
      {
        author: JULES,
        time: "1:08 AM",
        replyTo: { name: "BOLT-7", text: "One triple espresso. Also…" },
        text: "wait you REMEMBER that??",
      },
    ],
  },
];

const MSG_DELAYS = [250, 1250, 2800];
const MEMORY_DELAY = 2100;
const TYPING_DELAY = 3600;
const SCENE_MS = 9500;

function renderText(text: string) {
  return text.split(/(\*[^*]+\*|@\[[^\]]+\])/g).map((part, i) => {
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) {
      return (
        <em key={i} className="text-purple-200/70">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith("@[")) {
      return (
        <span key={i} className="rounded bg-indigo-500/25 px-1 font-medium text-indigo-200">
          @{part.slice(2, -1)}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function Message({ msg, character, delayMs }: { msg: Msg; character: CastMember; delayMs: number }) {
  const author = msg.author;
  const isBot = author === "bot";
  const name = isBot ? character.name : author.name;
  const color = isBot ? "#e9d5ff" : author.color;

  return (
    <div className="mk-msg" style={delay(delayMs)}>
      {msg.replyTo && (
        <div className="mb-1 flex items-center gap-1.5 pl-5 text-xs text-white/40">
          <span
            aria-hidden
            className="mt-2 h-2.5 w-7 shrink-0 rounded-tl-md border-l-2 border-t-2 border-white/15"
          />
          <span className="font-medium text-white/60">@{msg.replyTo.name}</span>
          <span className="truncate">{msg.replyTo.text}</span>
        </div>
      )}
      <div className="flex gap-3">
        {isBot ? (
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1d1530] ring-1 ring-white/10">
            <Image src="/brand/anychar-mark.png" alt="" width={40} height={40} className="h-7 w-7" />
          </span>
        ) : (
          <span
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-[#0b0716]"
            style={{ background: color }}
          >
            {name[0]?.toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[0.92rem] font-semibold" style={{ color }}>
              {name}
            </span>
            {isBot && (
              <span className="rounded-[0.25rem] bg-[#5865f2] px-1 py-px text-[0.58rem] font-bold uppercase leading-tight text-white">
                App
              </span>
            )}
            <span className="text-[0.68rem] text-white/30">Today at {msg.time}</span>
          </div>
          <p className="mt-0.5 text-[0.9rem] leading-relaxed text-white/80">{renderText(msg.text)}</p>
        </div>
      </div>
    </div>
  );
}

/** A Discord-style channel that cycles through example roleplay scenes. */
export function ChatScene() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % SCENES.length), SCENE_MS);
    return () => window.clearTimeout(timer);
  }, [index]);

  const scene = SCENES[index];

  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div
        aria-hidden
        className="absolute -inset-12 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(168,85,247,0.3),transparent)] blur-2xl"
      />

      <div className="relative">
        <div aria-hidden className="absolute -right-5 -top-11 z-20 hidden sm:block">
          <div className="mk-float">
            <FaceMark size={84} preload />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#110d1c]/90 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3 text-sm">
            <HashIcon className="h-4 w-4 text-white/40" />
            <span className="font-semibold text-white/85">{scene.channel}</span>
            <span aria-hidden className="mx-1 h-4 w-px bg-white/10" />
            <span className="truncate text-xs text-white/40">
              Now playing: {scene.character.name}
            </span>
          </div>

          <div key={index} className="mk-scene min-h-[24rem] space-y-4 px-4 py-5 sm:min-h-[22rem]">
            {scene.messages.map((m, i) => (
              <Message key={i} msg={m} character={scene.character} delayMs={MSG_DELAYS[i] ?? 0} />
            ))}
            <div
              className="mk-msg flex items-center gap-2 pl-[3.25rem] text-xs text-white/45"
              style={delay(TYPING_DELAY)}
            >
              <span className="mk-typing flex gap-1 text-white/60">
                <span />
                <span />
                <span />
              </span>
              <span>
                <b className="font-semibold text-white/70">{scene.character.name}</b> is typing…
              </span>
            </div>
          </div>

          <div className="px-4 pb-4">
            <div className="rounded-lg bg-white/[0.045] px-4 py-2.5 text-sm text-white/30">
              Message #{scene.channel}
            </div>
          </div>
        </div>

        <div
          key={`memory-${index}`}
          className="mk-msg absolute -bottom-8 -left-6 z-20 hidden max-w-[17rem] sm:block"
          style={delay(MEMORY_DELAY)}
        >
          <div
            className="mk-float rounded-2xl border border-white/10 bg-[#1a1229]/90 px-4 py-3 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
            style={delay(400)}
          >
            <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-pink-200/80">
              <SparkleIcon className="h-3 w-3" />
              Memory saved
            </p>
            <p className="mt-1 text-sm text-purple-50/85">{scene.memory}</p>
          </div>
        </div>
      </div>

      <div className="mt-14 flex items-center justify-center gap-3">
        {SCENES.map((s, i) => (
          <button
            key={s.character.id}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show a scene with ${s.character.name}`}
            aria-pressed={i === index}
            className={`relative h-10 w-10 overflow-hidden rounded-full ring-2 transition duration-300 ${
              i === index
                ? "scale-110 ring-pink-300/80"
                : "opacity-50 ring-white/10 hover:opacity-90"
            }`}
          >
            <Image src={s.character.img} alt="" fill sizes="40px" className="object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
