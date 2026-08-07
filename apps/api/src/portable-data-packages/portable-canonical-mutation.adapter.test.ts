import { describe, expect, it, vi } from "vitest";
import type { PortableRowEnvelopeContract } from "@naai-erp/contracts";
import { PortableCanonicalMutationAdapter } from "./portable-canonical-mutation.adapter.js";
import {
  portableMutationEntry,
  portableOperationHasAccountingEffect,
} from "./portable-resource-mutation-matrix.js";
import type { PortableDataPackageContext } from "./portable-data-package.types.js";

const context: PortableDataPackageContext = {
  organizationId: "org-a",
  actorId: "owner-1",
  roles: ["owner"],
  correlationId: "corr-1",
};
const row = (operation: PortableRowEnvelopeContract["operation"]): PortableRowEnvelopeContract => ({
  rowNumber: 2,
  operation,
  stableId: "doc-1",
  expectedResourceVersion: "2",
  externalReferences: [],
  relationships: { party_id: "party-1" },
  data: { document_number: "INV-EDIT", reason: "Correct imported workbook" },
});

const setup = (state = "draft", version = "2") => {
  const master = { dryRunImport: vi.fn(), mutate: vi.fn() };
  const documents = {
    get: vi.fn().mockResolvedValue({ data: { state, version } }),
    update: vi.fn().mockResolvedValue({ data: {} }),
    transition: vi.fn().mockResolvedValue({ data: {} }),
  };
  const expenses = {
    get: vi.fn().mockResolvedValue({ data: { state, version } }),
    update: vi.fn().mockResolvedValue({ data: {} }),
    transition: vi.fn().mockResolvedValue({ data: {} }),
  };
  return {
    master,
    documents,
    expenses,
    adapter: new PortableCanonicalMutationAdapter(
      master as never,
      documents as never,
      expenses as never,
    ),
  };
};

describe("PortableCanonicalMutationAdapter", () => {
  it("updates only draft commercial documents with optimistic version and idempotency", async () => {
    const { adapter, documents } = setup();
    expect(await adapter.validate(context, "commercial_documents", row("update"))).toMatchObject({
      disposition: "ready",
    });
    expect(
      await adapter.apply(context, "commercial_documents", row("update"), "import-row-1"),
    ).toEqual({
      applied: true,
      stableId: "doc-1",
    });
    expect(documents.update).toHaveBeenCalledWith(
      context,
      "doc-1",
      "2",
      expect.objectContaining({ documentNumber: "INV-EDIT", partyId: "party-1" }),
      "import-row-1",
    );
  });

  it("rejects draft updates after issue and rejects non-atomic reverse_replace", async () => {
    const { adapter } = setup("issued");
    expect(await adapter.validate(context, "commercial_documents", row("update"))).toMatchObject({
      disposition: "conflict",
      issues: [{ code: "STATE_CONFLICT" }],
    });
    expect(
      await adapter.validate(context, "commercial_documents", row("reverse_replace")),
    ).toMatchObject({
      disposition: "invalid",
      issues: [{ code: "ATOMIC_REVERSE_REPLACE_UNAVAILABLE" }],
    });
  });

  it("routes cancellation through the canonical lifecycle service", async () => {
    const { adapter, expenses } = setup("posted");
    expect(await adapter.apply(context, "expenses", row("cancel"), "cancel-row")).toEqual({
      applied: true,
      stableId: "doc-1",
    });
    expect(expenses.transition).toHaveBeenCalledWith(
      context,
      "doc-1",
      "cancel",
      { reason: "Correct imported workbook" },
      "cancel-row",
    );
  });

  it("classifies journal export as read-only and cancellation as an accounting-effect operation", () => {
    expect(portableMutationEntry("journal_entries")).toMatchObject({
      adapter: "journal",
      operations: [],
    });
    expect(portableOperationHasAccountingEffect("commercial_documents", "cancel")).toBe(true);
    expect(portableOperationHasAccountingEffect("parties", "update")).toBe(false);
  });
});
