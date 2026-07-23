"use client";

import { useEffect, useState } from "react";

type ModelOption = {
  id: string;
  name: string;
  promptPrice: number;
  completionPrice: number;
  supportsCaching: boolean;
  starred: boolean;
};

function priceLabel(model: ModelOption): string {
  const fmt = (p: number) => `$${(p * 1_000_000).toFixed(2)}`;
  return `${fmt(model.promptPrice)}/${fmt(model.completionPrice)} per 1M`;
}

function optionLabel(model: ModelOption): string {
  const star = model.starred ? "\u2605 " : "";
  const cache = model.supportsCaching ? " \u26a1 caches" : "";
  return `${star}${model.name} — ${priceLabel(model)}${cache}`;
}

export default function ModelSelector({ currentModel }: { currentModel: string }) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selected, setSelected] = useState(currentModel);
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">(
    "loading",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/models");
        if (!res.ok) throw new Error("Failed to load models");
        const data = (await res.json()) as { models: ModelOption[] };
        if (!cancelled) {
          setModels(data.models);
          setStatus("idle");
        }
      } catch {
        if (!cancelled) {
          setError("Could not load model list.");
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onChange(modelId: string) {
    setSelected(modelId);
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/user/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to save model");
      }
      setStatus("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save model");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-purple-100" htmlFor="model-selector">
        Text model
      </label>
      <select
        id="model-selector"
        value={selected}
        onChange={(e) => void onChange(e.target.value)}
        disabled={status === "loading"}
        className="w-full max-w-md rounded border border-purple-800/50 bg-[#160f24] px-3 py-2 text-sm text-purple-100"
      >
        {!models.some((m) => m.id === selected) && (
          <option value={selected}>{selected}</option>
        )}
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {optionLabel(m)}
          </option>
        ))}
      </select>
      <p className="text-xs text-purple-300/60">
        {status === "loading" && "Loading models…"}
        {status === "saving" && "Saving…"}
        {status === "saved" && "Saved."}
        {status === "error" && error}
        {status === "idle" &&
          "Applies to all of your characters' text replies. \u26a1 = supports token caching."}
      </p>
    </div>
  );
}
