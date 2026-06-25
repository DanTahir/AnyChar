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
        <Field label="Name" name="displayName" required maxLength={100} />
        <TextArea label="Good (do whenever possible)" name="good" maxLength={500} />
        <TextArea label="Bad (never do)" name="bad" maxLength={500} />
        <TextArea label="Description" name="description" maxLength={2000} rows={6} />
        <label className="block text-sm">
          Reply style
          <select name="replyStyle" className="input-field mt-1">
            {replyStyles.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
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
  name,
  required,
  maxLength,
}: {
  label: string;
  name: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        name={name}
        required={required}
        maxLength={maxLength}
        className="input-field mt-1"
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  maxLength,
  rows = 3,
}: {
  label: string;
  name: string;
  maxLength: number;
  rows?: number;
}) {
  return (
    <label className="block text-sm">
      {label}
      <textarea
        name={name}
        maxLength={maxLength}
        rows={rows}
        className="input-field mt-1"
      />
    </label>
  );
}
