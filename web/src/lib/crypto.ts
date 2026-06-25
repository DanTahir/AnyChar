import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

import { config } from "./config";

function key(): Buffer {
  if (!config.encryptionSecret) {
    throw new Error("ENCRYPTION_SECRET is not set");
  }
  return createHash("sha256").update(config.encryptionSecret).digest();
}

export function encryptApiKey(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
}

export function decryptApiKey(stored: string): string {
  if (!stored) return "";
  if (!stored.startsWith("enc:")) return stored;
  const raw = Buffer.from(stored.slice(4), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
