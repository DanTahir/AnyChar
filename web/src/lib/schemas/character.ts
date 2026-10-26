import { z } from "zod";

export const replyStyles = ["one-liner", "semi-lit", "literate", "novella"] as const;
export const memoryLevels = ["short", "medium", "long"] as const;

export const characterSchema = z.object({
  displayName: z.string().min(1).max(100),
  good: z.string().max(500).optional().default(""),
  bad: z.string().max(500).optional().default(""),
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

export function knownUserMaxLength(count: number): number {
  return count <= 1 ? 2000 : 500;
}
