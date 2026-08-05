import { describe, expect, it } from "vitest";
import { IdempotencyRegistry, mutationFingerprint } from "./idempotency";

describe("ERP-345 idempotency helpers", () => {
  it("canonicalizes object key order and retains a key until completion", () => {
    expect(mutationFingerprint("post", "journals", { b: 2, a: 1 })).toBe(
      mutationFingerprint("POST", "journals", { a: 1, b: 2 }),
    );
    let sequence = 0;
    const registry = new IdempotencyRegistry(() => `key-${++sequence}`);
    expect(registry.keyFor("operation")).toBe("key-1");
    expect(registry.keyFor("operation")).toBe("key-1");
    registry.complete("operation");
    expect(registry.keyFor("operation")).toBe("key-2");
  });
});
