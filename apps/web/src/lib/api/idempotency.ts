function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}

export function mutationFingerprint(method: string, path: string, body?: unknown): string {
  return `${method.toUpperCase()}:${path}:${canonical(body ?? null)}`;
}

export class IdempotencyRegistry {
  private readonly keys = new Map<string, string>();

  constructor(private readonly uuid: () => string = () => crypto.randomUUID()) {}

  keyFor(fingerprint: string): string {
    const existing = this.keys.get(fingerprint);
    if (existing) return existing;
    const created = this.uuid();
    this.keys.set(fingerprint, created);
    return created;
  }

  complete(fingerprint: string): void {
    this.keys.delete(fingerprint);
  }
}
