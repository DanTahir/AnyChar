"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { MemoryListItem, MemoryServerOption } from "@/lib/schemas/memory";

type MemoriesResponse = {
  servers: MemoryServerOption[];
  memories: MemoryListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  error?: string;
};

function formatTimestamp(createdAt: string | null): string {
  if (!createdAt) return "—";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function PurgeConfirmDialog({
  open,
  serverLabel,
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
  serverLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card max-w-md space-y-4 p-6" role="dialog" aria-modal="true">
        <h2 className="text-lg font-semibold text-purple-100">Purge all memories?</h2>
        <p className="text-sm text-purple-300/80">
          This permanently deletes every memory for this character in{" "}
          <span className="font-medium text-purple-100">{serverLabel}</span>. This cannot be
          undone.
        </p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary" disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
            disabled={busy}
          >
            {busy ? "Purging…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MemoryViewerPage({ slug }: { slug: string }) {
  const [characterName, setCharacterName] = useState("");
  const [servers, setServers] = useState<MemoryServerOption[]>([]);
  const [serverId, setServerId] = useState("");
  const [memories, setMemories] = useState<MemoryListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedSk, setExpandedSk] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purging, setPurging] = useState(false);

  const selectedServerLabel =
    servers.find((s) => s.id === serverId)?.label ?? serverId;

  const loadMemories = useCallback(
    async (selectedServerId: string, pageNum: number) => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (selectedServerId) params.set("serverId", selectedServerId);
      params.set("page", String(pageNum));

      const res = await fetch(`/api/characters/${slug}/memories?${params}`);
      const data = (await res.json()) as MemoriesResponse;
      setLoading(false);

      if (!res.ok) {
        setError(data.error ?? "Failed to load memories");
        return;
      }

      setServers(data.servers ?? []);
      setMemories(data.memories ?? []);
      setPage(data.page ?? 1);
      setTotalPages(data.totalPages ?? 0);
      setTotalCount(data.totalCount ?? 0);
    },
    [slug],
  );

  useEffect(() => {
    fetch(`/api/characters/${slug}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.character?.displayName) setCharacterName(d.character.displayName);
      });
  }, [slug]);

  useEffect(() => {
    void loadMemories(serverId, page);
  }, [loadMemories, serverId, page]);

  useEffect(() => {
    if (servers.length > 0 && !serverId) {
      setServerId(servers[0].id);
      setPage(1);
    }
  }, [servers, serverId]);

  async function deleteMemory(sk: string) {
    setError("");
    const res = await fetch(`/api/characters/${slug}/memories`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sk }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Failed to delete memory");
      return;
    }
    if (expandedSk === sk) setExpandedSk(null);
    await loadMemories(serverId, page);
  }

  async function purgeAll() {
    if (!serverId) return;
    setPurging(true);
    setError("");
    const res = await fetch(`/api/characters/${slug}/memories`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purge: true, serverId }),
    });
    setPurging(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Failed to purge memories");
      return;
    }
    setPurgeOpen(false);
    setExpandedSk(null);
    setPage(1);
    await loadMemories(serverId, 1);
  }

  return (
    <div className="max-w-2xl space-y-8">
      <PurgeConfirmDialog
        open={purgeOpen}
        serverLabel={selectedServerLabel}
        onCancel={() => setPurgeOpen(false)}
        onConfirm={() => void purgeAll()}
        busy={purging}
      />

      <div>
        <Link href={`/dashboard/characters/${slug}`} className="link-accent text-sm">
          ← Back to edit
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          {characterName ? `${characterName} — Memories` : "Character memories"}
        </h1>
        <p className="mt-1 text-sm text-purple-300/70">
          Short-term memories appear first, then long-term. Newest within each tier first.
        </p>
      </div>

      {error && <p className="text-red-400">{error}</p>}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="block min-w-[12rem] flex-1">
          <span className="text-sm font-medium text-purple-100">Server</span>
          <select
            value={serverId}
            onChange={(e) => {
              setServerId(e.target.value);
              setPage(1);
              setExpandedSk(null);
            }}
            className="input-field mt-1.5"
            disabled={servers.length === 0}
          >
            {servers.length === 0 ? (
              <option value="">No memories yet</option>
            ) : (
              servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))
            )}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setPurgeOpen(true)}
          disabled={!serverId || totalCount === 0}
          className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-400 transition hover:border-red-700 hover:bg-red-950/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Purge All
        </button>
      </div>

      {loading ? (
        <p className="text-purple-400/50">Loading…</p>
      ) : servers.length === 0 ? (
        <p className="text-purple-400/50">This character has no stored memories yet.</p>
      ) : memories.length === 0 ? (
        <p className="text-purple-400/50">No memories for this server.</p>
      ) : (
        <ul className="space-y-3">
          {memories.map((mem) => {
            const expanded = expandedSk === mem.sk;
            return (
              <li key={mem.sk} className="card overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  <button
                    type="button"
                    onClick={() => setExpandedSk(expanded ? null : mem.sk)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          mem.tier === "short"
                            ? "bg-purple-800/50 text-purple-200"
                            : "bg-indigo-900/50 text-indigo-200"
                        }`}
                      >
                        {mem.tier === "short" ? "Short-term" : "Long-term"}
                      </span>
                      <span className="text-sm font-medium text-purple-100">
                        {formatTimestamp(mem.createdAt)}
                      </span>
                    </div>
                    <dl className="mt-2 grid gap-1 text-xs text-purple-300/70 sm:grid-cols-2">
                      <div>
                        <dt className="inline text-purple-400/60">Root message: </dt>
                        <dd className="inline font-mono text-purple-200/90">
                          {mem.threadRootMessageId ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline text-purple-400/60">Final user: </dt>
                        <dd className="inline font-mono text-purple-200/90">
                          {mem.lastHumanUserId ?? "—"}
                        </dd>
                      </div>
                    </dl>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteMemory(mem.sk);
                    }}
                    className="shrink-0 text-sm font-medium text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
                {expanded && (
                  <div className="border-t border-purple-900/40 bg-[#0f0819]/50 px-4 py-3">
                    <p className="whitespace-pre-wrap text-sm text-purple-100/90">{mem.content}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="btn-secondary disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-purple-300/70">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="btn-secondary disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
