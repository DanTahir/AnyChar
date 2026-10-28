"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function DeleteCharacterButton({
  slug,
  displayName,
  isPublic,
}: {
  slug: string;
  displayName: string;
  isPublic: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  function openDialog() {
    setError("");
    setOpen(true);
  }

  async function confirmDelete() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/characters/${encodeURIComponent(slug)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      setError(data.error ?? "Failed to delete character");
      return;
    }
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="text-sm font-medium text-red-400 hover:text-red-300"
      >
        Delete
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="card max-w-md space-y-4 p-6"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`delete-${slug}-title`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={`delete-${slug}-title`} className="text-lg font-semibold text-purple-100">
              Delete {displayName}?
            </h2>
            <p className="text-sm text-purple-300/80">
              This permanently deletes{" "}
              <span className="font-medium text-purple-100">{displayName}</span> and everything
              tied to it:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-purple-300/80">
              <li>Its profile, description, and settings</li>
              <li>Its portrait and all known-user images</li>
              <li>All known users (relationships)</li>
              <li>All short- and long-term memories in every server and DM</li>
              <li>Its place in any server where it&apos;s active, and your DM character choice</li>
            </ul>
            {isPublic && (
              <p className="text-sm text-purple-300/80">
                The public version on the Public characters page won&apos;t be affected. It stays
                available to everyone.
              </p>
            )}
            <p className="rounded-lg bg-red-950/50 px-3 py-2 text-sm font-medium text-red-300">
              This action is irreversible. Once deleted, the character and its data cannot be
              recovered.
            </p>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-secondary"
                disabled={busy}
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
                disabled={busy}
              >
                {busy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
