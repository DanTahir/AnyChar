"use client";

import { useState } from "react";

export default function AgeGate() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function choose(age18plus: boolean) {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/age", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ age18plus }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Something went wrong");
      setSubmitting(false);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0612]/95 p-6 backdrop-blur-sm">
      <div className="card max-w-md space-y-6 p-8 text-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-purple-400">
            One quick question
          </p>
          <h1 className="mt-2 text-2xl font-bold text-purple-50">Are you 18 or older?</h1>
          <p className="mt-3 text-sm text-purple-300/80">
            Your answer determines whether characters can produce mature content. If you&apos;re
            under 18, characters will keep everything appropriate for a general audience.
          </p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void choose(true)}
            className="btn-primary text-base disabled:opacity-50"
          >
            I&apos;m 18 or older
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void choose(false)}
            className="btn-secondary text-base disabled:opacity-50"
          >
            I&apos;m under 18
          </button>
        </div>

        <p className="text-xs text-purple-400/50">
          This choice is saved to your account.
        </p>
      </div>
    </div>
  );
}
