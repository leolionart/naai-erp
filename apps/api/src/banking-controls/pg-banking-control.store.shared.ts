import { createHash } from "node:crypto";

export const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
