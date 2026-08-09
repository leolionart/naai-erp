import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "__Host-naai_erp_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type PersistentSession = Readonly<{
  organizationId: string;
  apiToken: string;
  issuedAt: number;
  expiresAt: number;
}>;

function key(secret: string) {
  if (secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return createHash("sha256").update(secret, "utf8").digest();
}

export function createPersistentSession(
  input: Readonly<{ organizationId: string; apiToken: string }>,
  now = Date.now(),
): PersistentSession {
  if (!input.organizationId.trim() || !input.apiToken.trim())
    throw new Error("Session organization and API token are required");
  const issuedAt = Math.floor(now / 1000);
  return {
    organizationId: input.organizationId.trim(),
    apiToken: input.apiToken.trim(),
    issuedAt,
    expiresAt: issuedAt + SESSION_TTL_SECONDS,
  };
}

export function sealPersistentSession(session: PersistentSession, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export function openPersistentSession(
  value: string,
  secret: string,
  now = Date.now(),
): PersistentSession {
  const [version, ivValue, encryptedValue, tagValue, extra] = value.split(".");
  if (version !== "v1" || !ivValue || !encryptedValue || !tagValue || extra)
    throw new Error("SESSION_INVALID");
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const parsed = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    ) as Partial<PersistentSession>;
    if (
      typeof parsed.organizationId !== "string" ||
      typeof parsed.apiToken !== "string" ||
      typeof parsed.issuedAt !== "number" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Math.floor(now / 1000)
    )
      throw new Error("SESSION_EXPIRED");
    return parsed as PersistentSession;
  } catch (error) {
    if (error instanceof Error && error.message === "SESSION_EXPIRED") throw error;
    throw new Error("SESSION_INVALID");
  }
}

export function sessionCookieFromHeader(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE_NAME) return value.join("=");
  }
  return undefined;
}
