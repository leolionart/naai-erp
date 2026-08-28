import { describe, expect, it, vi } from "vitest";
import { CommercialDocumentService } from "./commercial-document.service.js";

const context = {
  organizationId: "org-a",
  actorId: "owner-a",
  roles: ["owner"],
  correlationId: "corr-a",
} as const;

describe("commercial-document funding reclassification", () => {
  it("trims the target account and reason before delegating the atomic store command", async () => {
    const store = {
      reclassifyFunding: vi.fn().mockResolvedValue({
        documentId: "invoice-1",
        replacementDocumentId: "invoice-2",
        reversalJournalId: "journal-reversal-1",
        state: "cancelled",
      }),
    };
    const service = new CommercialDocumentService(store as never, {} as never);

    const response = await service.reclassifyFunding(
      context,
      "invoice-1",
      "7",
      { targetControlAccountCode: " 3388-OWNER ", reason: "  Owner paid personally  " },
      "funding-reclassify-1",
    );

    expect(store.reclassifyFunding).toHaveBeenCalledOnce();
    expect(store.reclassifyFunding).toHaveBeenCalledWith(
      context,
      "invoice-1",
      "7",
      "3388-OWNER",
      "Owner paid personally",
      "funding-reclassify-1",
    );
    expect(response.data).toMatchObject({
      documentId: "invoice-1",
      replacementDocumentId: "invoice-2",
      reversalJournalId: "journal-reversal-1",
    });
  });

  it.each([
    [
      "viewer is not authorized",
      { ...context, roles: ["viewer"] },
      "invoice-1",
      "1",
      { targetControlAccountCode: "3388-OWNER", reason: "Owner paid" },
      "key-1",
      "FORBIDDEN",
    ],
    [
      "missing idempotency key",
      context,
      "invoice-1",
      "1",
      { targetControlAccountCode: "3388-OWNER", reason: "Owner paid" },
      undefined,
      "IDEMPOTENCY_KEY_REQUIRED",
    ],
    [
      "missing version",
      context,
      "invoice-1",
      "",
      { targetControlAccountCode: "3388-OWNER", reason: "Owner paid" },
      "key-2",
      "VALIDATION_FAILED",
    ],
    [
      "missing target account",
      context,
      "invoice-1",
      "1",
      { targetControlAccountCode: "", reason: "Owner paid" },
      "key-3",
      "VALIDATION_FAILED",
    ],
    [
      "missing reason",
      context,
      "invoice-1",
      "1",
      { targetControlAccountCode: "3388-OWNER", reason: "  " },
      "key-4",
      "VALIDATION_FAILED",
    ],
  ] as const)(
    "rejects when %s",
    async (_label, actorContext, id, version, input, key, errorCode) => {
      const store = { reclassifyFunding: vi.fn() };
      const service = new CommercialDocumentService(store as never, {} as never);

      await expect(
        service.reclassifyFunding(actorContext, id, version, input, key),
      ).rejects.toThrow(errorCode);
      expect(store.reclassifyFunding).not.toHaveBeenCalled();
    },
  );
});
