// Starred/pinned models shown at the top of the dashboard's model dropdown, in
// order. Which list applies depends on the user's "adult content" setting.
// Mirrored in bot/config.py — keep both in sync.

// Adult content OFF (the default): the best frontier models available,
// regardless of whether they will produce adult content.
export const DEFAULT_STARRED_MODEL_IDS = [
  "anthropic/claude-opus-5.5",
  "anthropic/claude-sonnet-5.5",
  "openai/gpt-6.1-sol",
  "google/gemini-4-argon",
  "x-ai/grok-4.7",
  "moonshotai/kimi-k3.1-pro",
  "deepseek/deepseek-v4-pro-0813",
];

// Adult content ON: the strongest models that will actually produce adult
// content. Every entry must be (a) unmoderated on OpenRouter
// (top_provider.is_moderated === false) and (b) permissive at the model level.
// That rules out Anthropic/OpenAI (moderated by OpenRouter) and Google (the
// model itself refuses explicit content even though it is unmoderated).
export const ADULT_STARRED_MODEL_IDS = [
  "aion-labs/aion-3.5",
  "deepseek/deepseek-v4-pro-0813",
  "x-ai/grok-4.7",
  "mistralai/mistral-large-4-0",
  "z-ai/glm-5.3",
];

export function starredModelIds(adultContentEnabled: boolean): string[] {
  return adultContentEnabled ? ADULT_STARRED_MODEL_IDS : DEFAULT_STARRED_MODEL_IDS;
}

// Default text model for users who haven't picked one yet (adult content off).
// Mirrors OPENROUTER_DEFAULT_TEXT_MODEL in bot/config.py.
export const DEFAULT_TEXT_MODEL = "anthropic/claude-sonnet-5.5";

// Default for users with adult content enabled who haven't picked a model.
// Must satisfy the same rules as ADULT_STARRED_MODEL_IDS. Mirrors
// OPENROUTER_DEFAULT_ADULT_TEXT_MODEL in bot/config.py.
export const DEFAULT_ADULT_TEXT_MODEL = "mistralai/mistral-large-4-0";

export function defaultTextModel(adultContentEnabled: boolean): string {
  return adultContentEnabled ? DEFAULT_ADULT_TEXT_MODEL : DEFAULT_TEXT_MODEL;
}

// Vision is always Llama 4 Maverick — not user-selectable.
export const VISION_MODEL =
  process.env.OPENROUTER_VISION_MODEL ?? "meta-llama/llama-4-maverick";

// Fallbacks sent in OpenRouter's `models` array after VISION_MODEL so a
// rate-limited or down provider fails over in the same request. Mirrors
// OPENROUTER_VISION_FALLBACK_MODELS in bot/config.py.
export const VISION_FALLBACK_MODELS = ["deepseek/deepseek-v4.1-flash"];

export type OpenRouterModel = {
  id: string;
  name: string;
  promptPrice: number;
  completionPrice: number;
  cacheReadPrice: number | null;
  cacheWritePrice: number | null;
  supportsCaching: boolean;
  starred: boolean;
  // OpenRouter applies its own content moderation to this model.
  moderated: boolean;
  contextLength: number;
};

type RawOpenRouterModel = {
  id?: string;
  name?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  top_provider?: { is_moderated?: boolean };
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
 *
 * `adultContent` selects which starred list is pinned to the top. In adult
 * mode a starred model is additionally dropped from the pinned set if
 * OpenRouter reports it as moderated, so a catalog change can never pin a
 * model that would refuse adult content.
 */
export async function fetchOpenRouterModels(
  { adultContent = false }: { adultContent?: boolean } = {},
): Promise<OpenRouterModel[]> {
  const starredIds = starredModelIds(adultContent);
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
      const moderated = Boolean(m.top_provider?.is_moderated);
      return {
        id,
        name: String(m.name ?? id),
        promptPrice: toNumber(pricing.prompt),
        completionPrice: toNumber(pricing.completion),
        cacheReadPrice,
        cacheWritePrice: toOptionalNumber(pricing.input_cache_write),
        supportsCaching: cacheReadPrice !== null,
        starred: starredIds.includes(id) && !(adultContent && moderated),
        moderated,
        contextLength: Number(m.context_length ?? 0),
      };
    })
    .filter((m) => m.id);

  models.sort((a, b) => {
    if (a.starred && b.starred) {
      return starredIds.indexOf(a.id) - starredIds.indexOf(b.id);
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
