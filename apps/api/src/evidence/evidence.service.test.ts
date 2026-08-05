import { describe, expect, it, vi } from "vitest";
import { EvidenceService } from "./evidence.service.js";

const context = {
  organizationId: "org-a",
  actorId: "u1",
  roles: ["accountant"],
  correlationId: "corr",
};

describe("ERP-320 evidence service", () => {
  it("rejects spoofed media before object storage or database mutation", async () => {
    const store = { prepareUpload: vi.fn() };
    const objects = { put: vi.fn() };
    const service = new EvidenceService(store as never, objects as never, {} as never);
    await expect(
      service.upload(
        context,
        {
          subjectType: "expense",
          subjectId: "e1",
          evidenceType: "invoice",
          originalFilename: "invoice.png",
          declaredMediaType: "image/png",
          contentBase64: Buffer.from("%PDF-1.7\nfixture").toString("base64"),
          source: "api",
        },
        "key",
      ),
    ).rejects.toThrow("EVIDENCE_MEDIA_MISMATCH");
    expect(store.prepareUpload).not.toHaveBeenCalled();
    expect(objects.put).not.toHaveBeenCalled();
  });

  it("caps signed download lifetime", async () => {
    const service = new EvidenceService({} as never, {} as never, {} as never);
    await expect(
      service.download(context, "ev", { reason: "Audit", expiresInSeconds: 301 }, "key"),
    ).rejects.toThrow("EVIDENCE_DOWNLOAD_TTL_INVALID");
  });
});
