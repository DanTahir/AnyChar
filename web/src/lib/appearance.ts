import { config } from "./config";
import { decryptApiKey } from "./crypto";
import { updateItem, userSk } from "./dynamo";

const CHARACTER_SYSTEM =
  "You write extremely detailed physical appearance descriptions for roleplay characters. " +
  "Describe the person in the image in second person, beginning with the words 'You are'. " +
  "Be exhaustive: face shape and features, eyes, eyebrows, nose, lips, skin tone and texture, " +
  "hair color/style/length, body type and build, height impression, posture, clothing and fabrics, " +
  "colors, accessories, jewelry, expression, mood, art style if illustrated, lighting, and any " +
  "distinguishing marks. Aim for roughly 1000–1500 tokens. Write only the description, no preamble.";

const KNOWN_USER_SYSTEM =
  "You write extremely detailed physical appearance descriptions for roleplay. " +
  "Describe the person in the image in third person. Your output must begin with the lowercase " +
  "word 'is ' (as it will follow a name like 'Alice (user:123) is ...'). " +
  "Be exhaustive: face, hair, body, clothing, colors, expression, art style, and distinguishing " +
  "details. Aim for roughly 1000–1500 tokens. Write only the description starting with 'is ', " +
  "no preamble.";

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

async function visionCompletion(
  apiKey: string,
  system: string,
  content: ContentPart[],
  maxTokens: number,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openRouterVisionModel,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenRouter vision failed: ${err}`);
  }
  const data = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: (data.choices?.[0]?.message?.content ?? "").trim(),
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

export async function updateUsage(discordId: string, inputTokens: number, outputTokens: number) {
  await updateItem(
    "USERS",
    userSk(discordId),
    "ADD usageInputTokens :i, usageOutputTokens :o",
    { ":i": inputTokens, ":o": outputTokens },
  );
}

function imagePart(dataUrl: string): ContentPart {
  return { type: "image_url", image_url: { url: dataUrl } };
}

export async function describeCharacterPortrait(
  ownerDiscordId: string,
  encryptedApiKey: string,
  dataUrl: string,
): Promise<string> {
  const apiKey = decryptApiKey(encryptedApiKey);
  if (!apiKey) throw new Error("No OpenRouter API key");
  const { text, inputTokens, outputTokens } = await visionCompletion(
    apiKey,
    CHARACTER_SYSTEM,
    [{ type: "text", text: "Describe this character portrait." }, imagePart(dataUrl)],
    2000,
  );
  await updateUsage(ownerDiscordId, inputTokens, outputTokens);
  return text;
}

export async function describeKnownUserPortrait(
  ownerDiscordId: string,
  encryptedApiKey: string,
  dataUrl: string,
): Promise<string> {
  const apiKey = decryptApiKey(encryptedApiKey);
  if (!apiKey) throw new Error("No OpenRouter API key");
  const { text, inputTokens, outputTokens } = await visionCompletion(
    apiKey,
    KNOWN_USER_SYSTEM,
    [{ type: "text", text: "Describe this person's appearance." }, imagePart(dataUrl)],
    2000,
  );
  await updateUsage(ownerDiscordId, inputTokens, outputTokens);
  let appearance = text;
  if (appearance && !appearance.toLowerCase().startsWith("is ")) {
    appearance = `is ${appearance.replace(/^\s+/, "")}`;
  }
  return appearance;
}

export function bufferToDataUrl(buf: Buffer, contentType: string): string {
  return `data:${contentType};base64,${buf.toString("base64")}`;
}
