import { describe, expect, it } from "vitest";
import {
  detectEvidenceMediaType,
  nextEvidenceVersion,
  reviewEvidence,
  validateEvidenceUpload,
} from "./evidence.js";

const pdf = Uint8Array.from("%PDF-1.7\nfixture", (character) => character.charCodeAt(0));

describe("ERP-320 evidence domain", () => {
  it("detects allowlisted content signatures and rejects MIME spoofing", () => {
    expect(detectEvidenceMediaType(pdf)).toBe("application/pdf");
    expect(() => validateEvidenceUpload(pdf, "image/png", "invoice.pdf")).toThrow(
      "EVIDENCE_MEDIA_MISMATCH",
    );
    expect(() => validateEvidenceUpload(new Uint8Array(), "application/pdf", "empty.pdf")).toThrow(
      "EVIDENCE_EMPTY",
    );
  });

  it("creates opaque sequential versions without exposing the filename in the key", () => {
    const first = nextEvidenceVersion({
      organizationId: "org",
      evidenceId: "ev",
      current: [],
      generatedKeySuffix: "opaque",
    });
    const second = nextEvidenceVersion({
      organizationId: "org",
      evidenceId: "ev",
      current: [{ version: 1, status: "active" }],
    });
    expect(first.version).toBe(1);
    expect(second).toMatchObject({ version: 2, supersedesVersion: 1 });
    expect(first.objectKey).not.toContain("invoice");
  });

  it("requires review reason and keeps review separate from file status", () => {
    expect(
      reviewEvidence({ status: "active", reviewState: "pending" }, "accepted", "Checked", "u1"),
    ).toMatchObject({ status: "active", reviewState: "accepted", reviewedBy: "u1" });
    expect(() =>
      reviewEvidence({ status: "active", reviewState: "pending" }, "rejected", "", "u1"),
    ).toThrow("EVIDENCE_REVIEW_REASON_REQUIRED");
  });
});
