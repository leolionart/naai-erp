import { createHash } from "node:crypto";

export const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
export type Idempotency = { request_hash: string; response_body: Record<string, unknown> };
