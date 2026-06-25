"use client";

import Image from "next/image";
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

function ImageUploadField({
  label,
  help,
  previewUrl,
  hasImage,
  onUpload,
}: {
  label: string;
  help: string;
  previewUrl: string;
  hasImage: boolean;
  onUpload: (file: File) => Promise<string | null>;
}) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [cacheKey, setCacheKey] = useState(0);

  async function handleChange(file: File) {
    setUploading(true);
    setMessage("");
    const err = await onUpload(file);
    setUploading(false);
    if (err) {
      setMessage(err);
      return;
    }
    setCacheKey((k) => k + 1);
    setMessage("Image saved.");
  }

  return (
    <div className="card space-y-3 p-4">
      <div>
        <h3 className="font-medium text-purple-100">{label}</h3>
        <p className="mt-1 text-sm text-purple-300/70">{help}</p>
      </div>
      {hasImage && (
        <div className="relative h-40 w-40 overflow-hidden rounded-xl ring-2 ring-purple-700/40">
          <Image
            src={`${previewUrl}?v=${cacheKey}`}
            alt=""
            fill
            unoptimized
            className="object-cover"
          />
        </div>
      )}
      <label className="btn-secondary inline-flex cursor-pointer items-center gap-2">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleChange(file);
            e.target.value = "";
          }}
        />
        {uploading ? "Uploading…" : hasImage ? "Replace image" : "Upload image"}
      </label>
      <p className="text-xs text-purple-400/50">JPEG, PNG, WebP, or GIF · max 2MB</p>
      {message && (
        <p className={`text-sm ${message === "Image saved." ? "text-green-400" : "text-red-400"}`}>
          {message}
        </p>
      )}
    </div>
  );
}

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

  async function uploadCharacterImage(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.set("image", file);
    const res = await fetch(`/api/characters/${slug}/image`, { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) return data.error ?? "Upload failed";
    setCharacter((c) => (c ? { ...c, imageS3Key: data.key } : c));
    return null;
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

  async function uploadKnownImage(knownUserId: string, file: File): Promise<string | null> {
    const fd = new FormData();
    fd.set("image", file);
    const res = await fetch(`/api/characters/${slug}/known/${knownUserId}/image`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) return data.error ?? "Upload failed";
    setKnownUsers((prev) =>
      prev.map((k) =>
        k.knownUserId === knownUserId ? { ...k, imageS3Key: data.key } : k,
      ),
    );
    return null;
  }

  if (!character) return <p className="text-purple-400/50">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Edit {character.displayName}</h1>
      {error && <p className="text-red-400">{error}</p>}

      <form onSubmit={saveCharacter} className="space-y-4">
        <input
          name="displayName"
          defaultValue={character.displayName}
          maxLength={100}
          className="input-field"
        />
        <textarea name="good" defaultValue={character.good} maxLength={500} rows={2} className="input-field" placeholder="Good" />
        <textarea name="bad" defaultValue={character.bad} maxLength={500} rows={2} className="input-field" placeholder="Bad" />
        <textarea name="description" defaultValue={character.description} maxLength={2000} rows={6} className="input-field" placeholder="Description" />
        <select name="replyStyle" defaultValue={character.replyStyle} className="input-field">
          {replyStyles.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="submit" className="btn-primary">Save character</button>
      </form>

      <ImageUploadField
        label="Character appearance"
        help="Always shown to the AI when this character is active — use a portrait or reference of how the character looks."
        previewUrl={`/api/characters/${slug}/image`}
        hasImage={Boolean(character.imageS3Key)}
        onUpload={uploadCharacterImage}
      />

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-purple-100">Known Users (max 5)</h2>
          <p className="mt-1 text-sm text-purple-300/70">
            Known-user images are only sent when that Discord user speaks. Enable Developer Mode
            → right-click user → Copy User ID.
          </p>
        </div>
        {knownUsers.map((ku) => (
          <div key={ku.knownUserId} className="card space-y-3 p-4">
            <p className="text-sm text-purple-300/70">User ID: {ku.knownUserId}</p>
            <textarea
              defaultValue={ku.content}
              maxLength={knownUsers.length <= 1 ? 2000 : 500}
              rows={3}
              className="input-field"
              onBlur={(e) => saveKnownUser(ku.knownUserId, e.target.value)}
            />
            <ImageUploadField
              label="Known user appearance"
              help="Only included when this user sends a message."
              previewUrl={`/api/characters/${slug}/known/${ku.knownUserId}/image`}
              hasImage={Boolean(ku.imageS3Key)}
              onUpload={(file) => uploadKnownImage(ku.knownUserId, file)}
            />
          </div>
        ))}
        {knownUsers.length < 5 && (
          <div className="flex gap-2">
            <input
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              placeholder="Discord user ID"
              className="input-field flex-1"
            />
            <button type="button" onClick={addKnownUser} className="btn-secondary">Add</button>
          </div>
        )}
      </section>
    </div>
  );
}
