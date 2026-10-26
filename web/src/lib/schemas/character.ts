import { z } from "zod";

export const replyStyles = ["one-liner", "semi-lit", "literate", "novella"] as const;
export const memoryLevels = ["short", "medium", "long"] as const;

export const characterSchema = z.object({
  displayName: z.string().min(1).max(100),
  // Things the character loves / hates (doing, having, talking or thinking about).
  // Replaces the legacy `good` / `bad` ("should do" / "never do") fields.
  loves: z.string().max(500).optional().default(""),
  hates: z.string().max(500).optional().default(""),
  description: z.string().max(2000).optional().default(""),
  replyStyle: z.enum(replyStyles).default("semi-lit"),
  memoryLevel: z.enum(memoryLevels).default("medium"),
  // Per-character opt-in to the permissive content policy. Only honoured (and
  // only writable) when the owner has adult content enabled in Settings.
  adultCharacter: z.boolean().optional(),
});

export const knownUserSchema = z.object({
  discordUserId: z.string().regex(/^\d+$/, "Must be a numeric Discord user ID"),
  content: z.string().max(2000),
});

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type CharacterLike = Record<string, unknown> | null | undefined;

/** `loves` with a fallback to the legacy `good` attribute on older characters. */
export function lovesOf(c: CharacterLike): string {
  const v = c?.loves ?? c?.good;
  return typeof v === "string" ? v : "";
}

/** `hates` with a fallback to the legacy `bad` attribute on older characters. */
export function hatesOf(c: CharacterLike): string {
  const v = c?.hates ?? c?.bad;
  return typeof v === "string" ? v : "";
}

export function knownUserMaxLength(count: number): number {
  return count <= 1 ? 2000 : 500;
}
