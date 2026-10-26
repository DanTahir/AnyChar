"use client";

import { useEffect, useState } from "react";

export default function AdultContentSetting({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save(next: boolean, confirmedAdult = false): Promise<boolean> {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/user/adult-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next, confirmedAdult }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to save setting");
      }
      setEnabled(next);
      setNotice(
        next
          ? "Adult content enabled. Your starred models now show adult-capable picks."
          : "Adult content disabled. Characters will keep things appropriate for a general audience.",
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save setting");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function onToggle() {
    if (saving) return;
    if (enabled) {
      void save(false);
      return;
    }
    setConfirmChecked(false);
    setError("");
    setConfirmOpen(true);
  }

  async function onConfirm() {
    if (!confirmChecked || saving) return;
    if (await save(true, true)) setConfirmOpen(false);
  }

  useEffect(() => {
    if (!confirmOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) setConfirmOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, saving]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 id="adult-content-label" className="font-semibold text-purple-100">
            Adult content
          </h2>
          <p className="mt-1 text-sm text-purple-300/70">
            Allow your characters to produce mature content, including sexual and violent themes,
            when it fits the character and scene. When enabled, the starred models in your model
            list switch to top models that support adult content. Characters described as under 18
            will never produce sexual content, regardless of this setting.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="adult-content-label"
          disabled={saving}
          onClick={onToggle}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition disabled:opacity-50 ${
            enabled
              ? "border-purple-500 bg-purple-600"
              : "border-purple-800/60 bg-purple-950/60"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {!confirmOpen && error && <p className="text-sm text-red-400">{error}</p>}
      {notice && <p className="text-sm text-purple-300/70">{notice}</p>}

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0612]/95 p-6 backdrop-blur-sm"
          onClick={() => !saving && setConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="adult-confirm-title"
            className="card max-w-md space-y-6 p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-purple-400">
                Age confirmation
              </p>
              <h1 id="adult-confirm-title" className="mt-2 text-2xl font-bold text-purple-50">
                Enable adult content?
              </h1>
              <p className="mt-3 text-sm text-purple-300/80">
                Adult content may include sexual themes, graphic violence, and other mature
                material. You may only enable it if you are at least 18 years old{" "}
                <span className="font-semibold text-purple-100">and</span> have reached the legal
                age of majority where you live, which in some places is older than 18.
              </p>
            </div>

            <label className="flex cursor-pointer items-start gap-3 text-left text-sm text-purple-100">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-purple-600"
              />
              <span>
                I confirm that I am at least 18 years old and have reached the legal age of
                majority in my jurisdiction.
              </span>
            </label>

            {error && <p className="text-center text-sm text-red-400">{error}</p>}

            <div className="flex flex-col gap-3">
              <button
                type="button"
                disabled={!confirmChecked || saving}
                onClick={() => void onConfirm()}
                className="btn-primary text-base disabled:opacity-50"
              >
                {saving ? "Enabling…" : "Enable adult content"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirmOpen(false)}
                className="btn-secondary text-base disabled:opacity-50"
              >
                Cancel
              </button>
            </div>

            <p className="text-center text-xs text-purple-400/50">
              This confirmation is saved to your account. You can turn adult content off at any
              time.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
