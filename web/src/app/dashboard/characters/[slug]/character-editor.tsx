"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { replyStyles } from "@/lib/schemas/character";

type KnownUser = {
  knownUserId: string;
  content: string;
  imageS3Key?: string;
  displayName?: string;
};

type Character = {
  slug: string;
  displayName: string;
  good?: string;
  bad?: string;
  description?: string;
  replyStyle?: string;
  memoryLevel?: string;
  imageS3Key?: string;
};

function FieldShell({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-purple-100">{label}</span>
      <span className="mt-0.5 block text-xs text-purple-300/60">{help}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function UpdatedToast({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="fixed bottom-6 right-6 z-50 rounded-lg border border-purple-700/50 bg-[#140d24] px-4 py-2 text-sm font-medium text-green-400 shadow-lg shadow-purple-900/40"
      role="status"
    >
      Updated
    </div>
  );
}

function ImageUploadField({
  label,
  help,
  previewUrl,
  hasImage,
  onUpload,
  onSaved,
}: {
  label: string;
  help: string;
  previewUrl: string;
  hasImage: boolean;
  onUpload: (file: File) => Promise<string | null>;
  onSaved?: () => void;
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
    onSaved?.();
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
  const [newKnownId, setNewKnownId] = useState("");
  const [showUpdated, setShowUpdated] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashUpdated = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setShowUpdated(true);
    toastTimer.current = setTimeout(() => setShowUpdated(false), 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    fetch(`/api/characters/${slug}`)
      .then((r) => r.json())
      .then((d) => {
        setCharacter(d.character);
        setOwnerId(d.ownerId ?? "");
        setKnownUsers(
          (d.knownUsers ?? []).map((k: KnownUser & { sk: string }) => ({
            knownUserId: k.knownUserId ?? k.sk.split("#KNOWN#")[1],
            content: k.content ?? "",
            imageS3Key: k.imageS3Key,
            displayName: k.displayName,
          })),
        );
      });
  }, [slug]);

  async function saveCharacterFields(fields: Partial<Character>) {
    const res = await fetch(`/api/characters/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: fields.displayName ?? character?.displayName,
        good: fields.good ?? character?.good ?? "",
        bad: fields.bad ?? character?.bad ?? "",
        description: fields.description ?? character?.description ?? "",
        replyStyle: fields.replyStyle ?? character?.replyStyle ?? "semi-lit",
      }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Save failed");
      return false;
    }
    setError("");
    setCharacter((c) => (c ? { ...c, ...fields } : c));
    flashUpdated();
    return true;
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
    const res = await fetch(`/api/characters/${slug}/known/${knownUserId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordUserId: knownUserId, content }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Save failed");
      return;
    }
    setKnownUsers((prev) =>
      prev.map((k) => (k.knownUserId === knownUserId ? { ...k, content } : k)),
    );
    flashUpdated();
  }

  async function addKnownUser() {
    if (!newKnownId.match(/^\d+$/)) {
      setError("Enter a numeric Discord user ID");
      return;
    }
    const res = await fetch(`/api/characters/${slug}/known/${newKnownId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordUserId: newKnownId, content: "" }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to add");
      return;
    }
    setKnownUsers((prev) => [...prev, { knownUserId: newKnownId, content: "" }]);
    setNewKnownId("");
    flashUpdated();
  }

  async function deleteKnownUser(knownUserId: string) {
    const res = await fetch(`/api/characters/${slug}/known/${knownUserId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to delete");
      return;
    }
    setKnownUsers((prev) => prev.filter((k) => k.knownUserId !== knownUserId));
    setError("");
    flashUpdated();
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
      <UpdatedToast visible={showUpdated} />
      <div>
        <h1 className="text-2xl font-bold">Edit {character.displayName}</h1>
        <p className="mt-1 text-sm text-purple-300/70">Changes save automatically.</p>
      </div>
      {error && <p className="text-red-400">{error}</p>}

      <div className="space-y-4">
        <FieldShell
          label="Name"
          help="The character's name. Shown in Discord and used as the bot's nickname."
        >
          <input
            defaultValue={character.displayName}
            maxLength={100}
            className="input-field"
            placeholder="Character name"
            onBlur={(e) => {
              if (e.target.value !== character.displayName) {
                void saveCharacterFields({ displayName: e.target.value });
              }
            }}
          />
        </FieldShell>
        <FieldShell
          label="Good (do whenever possible)"
          help="Things the character should try to do whenever it fits the scene."
        >
          <textarea
            defaultValue={character.good}
            maxLength={500}
            rows={2}
            className="input-field"
            onBlur={(e) => {
              if (e.target.value !== (character.good ?? "")) {
                void saveCharacterFields({ good: e.target.value });
              }
            }}
          />
        </FieldShell>
        <FieldShell
          label="Bad (never do)"
          help="Hard limits — things the character must never do or say."
        >
          <textarea
            defaultValue={character.bad}
            maxLength={500}
            rows={2}
            className="input-field"
            onBlur={(e) => {
              if (e.target.value !== (character.bad ?? "")) {
                void saveCharacterFields({ bad: e.target.value });
              }
            }}
          />
        </FieldShell>
        <FieldShell
          label="Description"
          help="Personality, background, appearance, and voice. The more detail, the more consistent the character."
        >
          <textarea
            defaultValue={character.description}
            maxLength={2000}
            rows={6}
            className="input-field"
            onBlur={(e) => {
              if (e.target.value !== (character.description ?? "")) {
                void saveCharacterFields({ description: e.target.value });
              }
            }}
          />
        </FieldShell>
        <FieldShell
          label="Reply style"
          help="How long the character's replies tend to be."
        >
          <select
            defaultValue={character.replyStyle}
            className="input-field"
            onChange={(e) => void saveCharacterFields({ replyStyle: e.target.value })}
          >
            {replyStyles.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </FieldShell>
        <FieldShell
          label="Memory level"
          help="How much this character remembers across sessions."
        >
          <select
            defaultValue={character.memoryLevel ?? "medium"}
            className="input-field"
            onChange={(e) => void saveCharacterFields({ memoryLevel: e.target.value })}
          >
            <option value="short">short — Less expensive</option>
            <option value="medium">medium — Average cost</option>
            <option value="long">long — More expensive</option>
          </select>
          <Link
            href={`/dashboard/characters/${slug}/memories`}
            className="link-accent mt-2 inline-block text-sm"
          >
            View memories
          </Link>
        </FieldShell>
      </div>

      <ImageUploadField
        label="Character appearance"
        help="Always shown to the AI when this character is active — use a portrait or reference of how the character looks."
        previewUrl={`/api/characters/${slug}/image`}
        hasImage={Boolean(character.imageS3Key)}
        onUpload={uploadCharacterImage}
        onSaved={flashUpdated}
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
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-purple-300/70">
                <span className="font-medium text-purple-100">
                  {ku.displayName ??
                    (ku.knownUserId === ownerId
                      ? "You (character creator)"
                      : `User ${ku.knownUserId}`)}
                </span>
                {ku.knownUserId === ownerId && (
                  <span className="ml-2 rounded bg-purple-800/50 px-1.5 py-0.5 text-xs text-purple-200">
                    Character creator
                  </span>
                )}
                <span className="mt-0.5 block text-xs text-purple-300/50">
                  ID: {ku.knownUserId}
                </span>
              </div>
              {ku.knownUserId !== ownerId && (
                <button
                  type="button"
                  onClick={() => void deleteKnownUser(ku.knownUserId)}
                  className="text-sm font-medium text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              )}
            </div>
            <textarea
              defaultValue={ku.content}
              maxLength={knownUsers.length <= 1 ? 2000 : 500}
              rows={3}
              className="input-field"
              onBlur={(e) => {
                if (e.target.value !== ku.content) {
                  void saveKnownUser(ku.knownUserId, e.target.value);
                }
              }}
            />
            <ImageUploadField
              label="Known user appearance"
              help="Only included when this user sends a message."
              previewUrl={`/api/characters/${slug}/known/${ku.knownUserId}/image`}
              hasImage={Boolean(ku.imageS3Key)}
              onUpload={(file) => uploadKnownImage(ku.knownUserId, file)}
              onSaved={flashUpdated}
            />
          </div>
        ))}
        {knownUsers.length < 5 && (
          <div className="flex gap-2">
            <input
              value={newKnownId}
              onChange={(e) => setNewKnownId(e.target.value)}
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
