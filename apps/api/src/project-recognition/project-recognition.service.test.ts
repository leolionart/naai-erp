import { describe, expect, it, vi } from "vitest";
import { ProjectRecognitionService } from "./project-recognition.service.js";
const context = {
  organizationId: "org",
  actorId: "maker",
  roles: ["project_manager"],
  correlationId: "corr",
};
describe("ERP-520 project recognition service", () => {
  it("requires idempotency and validates transition versions", async () => {
    const store = {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      transition: vi.fn(),
      revenuePosition: vi.fn(),
    };
    const service = new ProjectRecognitionService(store, {} as never);
    await expect(
      service.create(context, "scope-changes", { schemaVersion: 1, reason: "x" }),
    ).rejects.toThrow("IDEMPOTENCY_KEY_REQUIRED");
    await expect(
      service.transition(
        context,
        "scope-changes",
        "x",
        "submit",
        { schemaVersion: 1, expectedResourceVersion: "bad", reason: "x" },
        "key",
      ),
    ).rejects.toThrow("VALIDATION_FAILED");
  });
  it("keeps approval roles separate from maker writes", async () => {
    const store = {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      transition: vi.fn(),
      revenuePosition: vi.fn(),
    };
    const service = new ProjectRecognitionService(store, {} as never);
    await expect(
      service.transition(
        context,
        "project-budgets",
        "x",
        "approve",
        { schemaVersion: 1, expectedResourceVersion: "2", reason: "approve" },
        "key",
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
});
