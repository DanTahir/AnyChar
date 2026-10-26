"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { replyStyles } from "@/lib/schemas/character";

export default function NewCharacterForm({
  adultContentEnabled,
}: {
  adultContentEnabled: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: form.get("displayName"),
        loves: form.get("loves"),
        hates: form.get("hates"),
        description: form.get("description"),
        replyStyle: form.get("replyStyle"),
        memoryLevel: form.get("memoryLevel"),
        adultCharacter: adultContentEnabled && form.get("adultCharacter") === "on",
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    router.push(`/dashboard/characters/${data.slug}`);
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">New character</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Name"
          help="The character's name. Shown in Discord and used as the bot's nickname."
          name="displayName"
          required
          maxLength={100}
        />
        <TextArea
          label="Loves"
          help="Things the character loves doing, having, talking about, or thinking about. They light up when these come up."
          name="loves"
          maxLength={500}
        />
        <TextArea
          label="Hates"
          help="Things the character hates doing, talking about, hearing about, or thinking about. They react with genuine distaste."
          name="hates"
          maxLength={500}
        />
        <TextArea
          label="Description"
          help="Personality, background, appearance, and voice. The more detail, the more consistent the character."
          name="description"
          maxLength={2000}
          rows={6}
        />
        <label className="block">
          <span className="text-sm font-medium">Reply style</span>
          <span className="mt-0.5 block text-xs text-purple-300/60">
            How long the character&apos;s replies tend to be.
          </span>
          <select name="replyStyle" className="input-field mt-1.5">
            {replyStyles.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Memory level</span>
          <span className="mt-0.5 block text-xs text-purple-300/60">
            How much this character remembers across sessions.
          </span>
          <select name="memoryLevel" defaultValue="medium" className="input-field mt-1.5">
            <option value="short">short — Less expensive</option>
            <option value="medium">medium — Average cost</option>
            <option value="long">long — More expensive</option>
          </select>
        </label>
        <div className="space-y-1">
          <label
            className={`flex items-start gap-3 ${adultContentEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
          >
            <input
              type="checkbox"
              name="adultCharacter"
              disabled={!adultContentEnabled}
              className="mt-0.5 h-4 w-4 shrink-0 accent-purple-600"
            />
            <span>
              <span className="text-sm font-medium">Adult character</span>
              <span className="mt-0.5 block text-xs text-purple-300/60">
                Allow this character to produce mature content, including sexual and violent
                themes, when it fits the character and scene. Only mark characters who are adults
                — characters described as under 18 will never produce sexual content.
              </span>
            </span>
          </label>
          {!adultContentEnabled && (
            <p className="text-xs text-purple-300/60">
              Turn on adult content in{" "}
              <Link href="/dashboard/settings" className="link-accent">
                Settings
              </Link>{" "}
              to use this.
            </p>
          )}
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <p className="text-sm text-purple-300/70">
          After creating your character, you can upload a portrait and known-user images on the
          edit page.
        </p>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  help,
  name,
  required,
  maxLength,
}: {
  label: string;
  help?: string;
  name: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {help && <span className="mt-0.5 block text-xs text-purple-300/60">{help}</span>}
      <input
        name={name}
        required={required}
        maxLength={maxLength}
        className="input-field mt-1.5"
      />
    </label>
  );
}

function TextArea({
  label,
  help,
  name,
  maxLength,
  rows = 3,
}: {
  label: string;
  help?: string;
  name: string;
  maxLength: number;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {help && <span className="mt-0.5 block text-xs text-purple-300/60">{help}</span>}
      <textarea
        name={name}
        maxLength={maxLength}
        rows={rows}
        className="input-field mt-1.5"
      />
    </label>
  );
}
