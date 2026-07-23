// Starred/pinned models shown at the top of the dashboard's model dropdown, in
// order. Mirrored in bot/config.py's STARRED_MODEL_IDS — keep both in sync.
export const STARRED_MODEL_IDS = [
  "mistralai/mistral-small-2603",
  "deepseek/deepseek-v4-pro",
  "aion-labs/aion-3.0",
  "meta-llama/llama-4-maverick",
];

// Default text model for users who haven't picked one yet.
export const DEFAULT_TEXT_MODEL = "mistralai/mistral-small-2603";

// Vision is always Llama 4 Maverick — not user-selectable.
export const VISION_MODEL =
  process.env.OPENROUTER_VISION_MODEL ?? "meta-llama/llama-4-maverick";

export type OpenRouterModel = {
  id: string;
  name: string;
  promptPrice: number;
  completionPrice: number;
  cacheReadPrice: number | null;
  cacheWritePrice: number | null;
  supportsCaching: boolean;
  starred: boolean;
  contextLength: number;
};

type RawOpenRouterModel = {
  id?: string;
  name?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
    input_cache_read?: string | number | null;
    input_cache_write?: string | number | null;
  };
};

function toNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toOptionalNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetches the live OpenRouter model catalog, mapped to the fields the
 * dashboard's model selector needs. Uses OpenRouter's aggregate top-provider
 * pricing (including cache pricing) as a proxy for "does the cheapest
 * provider for this model support caching" without needing a separate
 * /models/{author}/{slug}/endpoints call per model.
 */
export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const resp = await fetch("https://openrouter.ai/api/v1/models", {
    next: { revalidate: 600 },
  });
  if (!resp.ok) {
    throw new Error(`Failed to fetch OpenRouter models: ${resp.status}`);
  }
  const data = (await resp.json()) as { data?: RawOpenRouterModel[] };
  const raw = data.data ?? [];

  const models: OpenRouterModel[] = raw
    .filter((m) => {
      const outputs = m.architecture?.output_modalities;
      // Exclude embeddings-only/non-text-output models from the text-model dropdown.
      return !outputs || outputs.includes("text");
    })
    .map((m) => {
      const id = String(m.id ?? "");
      const pricing = m.pricing ?? {};
      const cacheReadPrice = toOptionalNumber(pricing.input_cache_read);
      return {
        id,
        name: String(m.name ?? id),
        promptPrice: toNumber(pricing.prompt),
        completionPrice: toNumber(pricing.completion),
        cacheReadPrice,
        cacheWritePrice: toOptionalNumber(pricing.input_cache_write),
        supportsCaching: cacheReadPrice !== null,
        starred: STARRED_MODEL_IDS.includes(id),
        contextLength: Number(m.context_length ?? 0),
      };
    })
    .filter((m) => m.id);

  models.sort((a, b) => {
    if (a.starred && b.starred) {
      return STARRED_MODEL_IDS.indexOf(a.id) - STARRED_MODEL_IDS.indexOf(b.id);
    }
    if (a.starred) return -1;
    if (b.starred) return 1;
    return a.name.localeCompare(b.name);
  });

  return models;
}

export function formatPricePerMillion(price: number): string {
  return `$${(price * 1_000_000).toFixed(price >= 0.000_01 ? 2 : 4)}`;
}
