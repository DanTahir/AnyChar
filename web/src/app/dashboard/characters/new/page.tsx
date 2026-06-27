"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { replyStyles } from "@/lib/schemas/character";

export default function NewCharacterPage() {
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
        good: form.get("good"),
        bad: form.get("bad"),
        description: form.get("description"),
        replyStyle: form.get("replyStyle"),
        memoryLevel: form.get("memoryLevel"),
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
          label="Good (do whenever possible)"
          help="Things the character should try to do whenever it fits the scene."
          name="good"
          maxLength={500}
        />
        <TextArea
          label="Bad (never do)"
          help="Hard limits — things the character must never do or say."
          name="bad"
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
