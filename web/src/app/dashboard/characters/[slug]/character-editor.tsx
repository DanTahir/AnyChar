"use client";

import { useEffect, useState } from "react";

import { replyStyles } from "@/lib/schemas/character";

type KnownUser = {
  knownUserId: string;
  content: string;
  imageS3Key?: string;
};

type Character = {
  slug: string;
  displayName: string;
  good?: string;
  bad?: string;
  description?: string;
  replyStyle?: string;
  imageS3Key?: string;
};

export default function EditCharacterPage({ slug }: { slug: string }) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [knownUsers, setKnownUsers] = useState<KnownUser[]>([]);
  const [error, setError] = useState("");
  const [ownerId, setOwnerId] = useState("");

  useEffect(() => {
    fetch(`/api/characters/${slug}`)
      .then((r) => r.json())
      .then((d) => {
        setCharacter(d.character);
        setKnownUsers(
          (d.knownUsers ?? []).map((k: KnownUser & { sk: string }) => ({
            knownUserId: k.knownUserId ?? k.sk.split("#KNOWN#")[1],
            content: k.content ?? "",
            imageS3Key: k.imageS3Key,
          })),
        );
      });
  }, [slug]);

  async function saveCharacter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/characters/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: form.get("displayName"),
        good: form.get("good"),
        bad: form.get("bad"),
        description: form.get("description"),
        replyStyle: form.get("replyStyle"),
      }),
    });
    if (!res.ok) setError((await res.json()).error);
    else setError("");
  }

  async function uploadAvatar(file: File) {
    const fd = new FormData();
    fd.set("image", file);
    await fetch(`/api/characters/${slug}/image`, { method: "POST", body: fd });
  }

  async function saveKnownUser(knownUserId: string, content: string) {
    await fetch(`/api/characters/${slug}/known/${knownUserId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordUserId: knownUserId, content }),
    });
    setKnownUsers((prev) =>
      prev.map((k) => (k.knownUserId === knownUserId ? { ...k, content } : k)),
    );
  }

  async function addKnownUser() {
    if (!ownerId.match(/^\d+$/)) {
      setError("Enter a numeric Discord user ID");
      return;
    }
    await fetch(`/api/characters/${slug}/known/${ownerId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordUserId: ownerId, content: "" }),
    });
    setKnownUsers((prev) => [...prev, { knownUserId: ownerId, content: "" }]);
    setOwnerId("");
  }

  async function uploadKnownImage(knownUserId: string, file: File) {
    const fd = new FormData();
    fd.set("image", file);
    await fetch(`/api/characters/${slug}/known/${knownUserId}/image`, {
      method: "POST",
      body: fd,
    });
  }

  if (!character) return <p className="text-zinc-500">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Edit {character.displayName}</h1>
      {error && <p className="text-red-400">{error}</p>}

      <form onSubmit={saveCharacter} className="space-y-4">
        <input
          name="displayName"
          defaultValue={character.displayName}
          maxLength={100}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2"
        />
        <textarea name="good" defaultValue={character.good} maxLength={500} rows={2} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2" placeholder="Good" />
        <textarea name="bad" defaultValue={character.bad} maxLength={500} rows={2} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2" placeholder="Bad" />
        <textarea name="description" defaultValue={character.description} maxLength={2000} rows={6} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2" placeholder="Description" />
        <select name="replyStyle" defaultValue={character.replyStyle} className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2">
          {replyStyles.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="submit" className="rounded bg-indigo-600 px-4 py-2">Save character</button>
      </form>

      <section>
        <h2 className="font-semibold">Character image (max 2MB)</h2>
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Known Users (max 5)</h2>
        <p className="text-sm text-zinc-500">Enable Developer Mode in Discord → right-click user → Copy User ID.</p>
        {knownUsers.map((ku) => (
          <div key={ku.knownUserId} className="rounded border border-zinc-800 p-3 space-y-2">
            <p className="text-sm text-zinc-400">User ID: {ku.knownUserId}</p>
            <textarea
              defaultValue={ku.content}
              maxLength={knownUsers.length <= 1 ? 2000 : 500}
              rows={3}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2"
              onBlur={(e) => saveKnownUser(ku.knownUserId, e.target.value)}
            />
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadKnownImage(ku.knownUserId, e.target.files[0])} />
          </div>
        ))}
        {knownUsers.length < 5 && (
          <div className="flex gap-2">
            <input
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              placeholder="Discord user ID"
              className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2"
            />
            <button type="button" onClick={addKnownUser} className="rounded bg-zinc-700 px-3 py-2">Add</button>
          </div>
        )}
      </section>
    </div>
  );
}
