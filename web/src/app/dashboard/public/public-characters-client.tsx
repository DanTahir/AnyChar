"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { PublicCharacter } from "@/lib/public-characters";

type DownloadState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "conflict"; error: string; name: string }
  | { kind: "done"; slug: string; displayName: string }
  | { kind: "error"; error: string };

function PublicCharacterCard({
  character,
  canRemove,
  onRemoved,
}: {
  character: PublicCharacter;
  canRemove: boolean;
  onRemoved: (publicId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<DownloadState>({ kind: "idle" });
  const [downloads, setDownloads] = useState(character.downloads);
  const [removing, setRemoving] = useState(false);

  async function download(displayName?: string) {
    setState({ kind: "working" });
    const res = await fetch(`/api/public-characters/${character.publicId}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(displayName ? { displayName } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) {
      setState({
        kind: "conflict",
        error: data.error ?? "You already have a character with this name.",
        name: data.suggestedName ?? `${character.displayName} 2`,
      });
      return;
    }
    if (!res.ok) {
      setState({ kind: "error", error: data.error ?? "Download failed" });
      return;
    }
    setDownloads((d) => d + 1);
    setState({ kind: "done", slug: data.slug, displayName: data.displayName });
  }

  async function remove() {
    if (!window.confirm(`Remove "${character.displayName}" from public characters?`)) return;
    setRemoving(true);
    const res = await fetch(`/api/public-characters/${character.publicId}`, { method: "DELETE" });
    setRemoving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setState({ kind: "error", error: data.error ?? "Remove failed" });
      return;
    }
    onRemoved(character.publicId);
  }

  const longText =
    character.description.length > 220 || character.loves.length + character.hates.length > 160;

  return (
    <li className="card flex flex-col gap-4 p-4">
      <div className="flex gap-4">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-purple-950/60 ring-2 ring-purple-700/40">
          {character.hasImage ? (
            <Image
              src={`/api/public-characters/${character.publicId}/image?v=${encodeURIComponent(character.updatedAt)}`}
              alt={character.displayName}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-purple-300/60">
              {character.displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-purple-50">
            {character.displayName}
          </h2>
          <p className="text-xs text-purple-300/60">
            by {character.authorName} · {character.replyStyle} · {downloads}{" "}
            {downloads === 1 ? "download" : "downloads"}
          </p>
          <p
            className={`mt-2 whitespace-pre-line text-sm text-purple-200/80 ${expanded ? "" : "line-clamp-3"}`}
          >
            {character.description || <span className="italic text-purple-300/50">No description.</span>}
          </p>
        </div>
      </div>

      {(character.loves || character.hates) && (
        <dl className={`space-y-1 text-sm ${expanded ? "" : "line-clamp-3"}`}>
          {character.loves && (
            <div>
              <dt className="inline font-medium text-green-300">Loves: </dt>
              <dd className="inline text-purple-200/80">{character.loves}</dd>
            </div>
          )}
          {character.hates && (
            <div>
              <dt className="inline font-medium text-red-300">Hates: </dt>
              <dd className="inline text-purple-200/80">{character.hates}</dd>
            </div>
          )}
        </dl>
      )}

      {longText && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-xs font-medium text-purple-300 hover:text-purple-100"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}

      <div className="mt-auto space-y-2">
        {state.kind === "conflict" ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = state.name.trim();
              if (name) void download(name);
            }}
          >
            <p className="text-sm text-amber-300">{state.error}</p>
            <div className="flex gap-2">
              <input
                value={state.name}
                maxLength={100}
                onChange={(e) => setState({ ...state, name: e.target.value })}
                className="input-field flex-1"
                aria-label="New character name"
              />
              <button type="submit" className="btn-primary px-3 py-1.5 text-sm">
                Add
              </button>
              <button
                type="button"
                onClick={() => setState({ kind: "idle" })}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : state.kind === "done" ? (
          <p className="text-sm text-green-400">
            Added as {state.displayName}.{" "}
            <Link href={`/dashboard/characters/${state.slug}`} className="link-accent">
              Open it
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={state.kind === "working"}
              onClick={() => void download()}
              className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
            >
              {state.kind === "working" ? "Adding…" : "Add to my characters"}
            </button>
            {canRemove && (
              <button
                type="button"
                disabled={removing}
                onClick={() => void remove()}
                className="text-sm font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                {removing ? "Removing…" : "Remove"}
              </button>
            )}
          </div>
        )}
        {state.kind === "error" && <p className="text-sm text-red-400">{state.error}</p>}
      </div>
    </li>
  );
}

export default function PublicCharactersClient({
  characters: initial,
  currentUserId,
  isAdmin,
}: {
  characters: PublicCharacter[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [characters, setCharacters] = useState(initial);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter((c) =>
      [c.displayName, c.description, c.loves, c.hates, c.authorName]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [characters, query]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Public characters</h1>
        <p className="mt-1 text-purple-300/70">
          Characters shared by the community. Add one to your profile to get your own copy, with
          its portrait. You can then edit it however you like. To share one of yours, open it and
          use &ldquo;Make public&rdquo;. Adult characters can&apos;t be shared.
        </p>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, description, loves, hates, or author"
        className="input-field"
      />

      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-purple-300/70">
          {characters.length === 0 ? "No public characters yet." : "No characters match your search."}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {filtered.map((c) => (
            <PublicCharacterCard
              key={c.publicId}
              character={c}
              canRemove={isAdmin || c.authorDiscordId === currentUserId}
              onRemoved={(id) => setCharacters((prev) => prev.filter((p) => p.publicId !== id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
