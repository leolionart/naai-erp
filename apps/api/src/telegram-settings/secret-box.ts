import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope for secrets stored in business tables (e.g. the Telegram bot token).
 * The key is derived from SESSION_SECRET and a purpose label. Keep byte-compatible with
 * apps/api/src/telegram-settings/secret-box.ts (the worker image does not bundle shared packages).
 */
function key(secret: string, purpose: string) {
  if (secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return createHash("sha256").update(`${purpose}:${secret}`, "utf8").digest();
}

export function sealSecret(plaintext: string, secret: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret, purpose), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export function openSecret(value: string, secret: string, purpose: string): string {
  const [version, iv, encrypted, tag, extra] = value.split(".");
  if (version !== "v1" || !iv || !encrypted || !tag || extra) throw new Error("SECRET_INVALID");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(secret, purpose),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
