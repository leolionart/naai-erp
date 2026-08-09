import { describe, expect, it, vi } from "vitest";
import type { PortableRowEnvelopeContract } from "@naai-erp/contracts";
import { PortableCanonicalMutationAdapter } from "./portable-canonical-mutation.adapter.js";
import {
  portableBatchRequiresAtomicService,
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
    reverseReplace: vi.fn().mockResolvedValue({ data: { replacementDocumentId: "doc-2" } }),
    validatePortableInput: vi.fn(),
    create: vi.fn(),
  };
  const expenses = {
    get: vi.fn().mockResolvedValue({ data: { state, version } }),
    update: vi.fn().mockResolvedValue({ data: {} }),
    transition: vi.fn().mockResolvedValue({ data: {} }),
    reverseReplace: vi.fn().mockResolvedValue({ data: { replacementExpenseId: "expense-2" } }),
    validatePortableInput: vi.fn(),
    create: vi.fn(),
  };
  const subscriptions = {
    validatePortableInput: vi.fn().mockResolvedValue({ valid: true }),
    getPlan: vi.fn(),
    getSubscription: vi.fn(),
    createPlan: vi.fn(),
    updatePlan: vi.fn(),
    deactivatePlan: vi.fn(),
    createSubscription: vi.fn(),
    updateSubscription: vi.fn(),
    transition: vi.fn(),
  };
  return {
    master,
    documents,
    expenses,
    adapter: new PortableCanonicalMutationAdapter(
      master as never,
      documents as never,
      expenses as never,
      subscriptions as never,
    ),
    subscriptions,
  };
};

describe("PortableCanonicalMutationAdapter", () => {
  it("filters exported system columns and generates an id for master-data create rows", async () => {
    const { adapter, master } = setup();
    master.dryRunImport.mockReturnValue({
      data: { valid: true, rows: [{ index: 0, valid: true, errors: [] }] },
    });
    master.mutate.mockResolvedValue({ data: { resource: { id: "party-new" } } });
    const createRow: PortableRowEnvelopeContract = {
      rowNumber: 8,
      operation: "create",
      externalReferences: [{ system: "demo", externalId: "party-new" }],
      relationships: {},
      data: {
        display_name: "Portable customer",
        status: "active",
        created_at: "2026-08-07T00:00:00.000Z",
        updated_at: null,
      },
    };

    expect(await adapter.apply(context, "parties", createRow, "party-create")).toEqual({
      applied: true,
      stableId: "party-new",
    });
    expect(master.mutate).toHaveBeenCalledWith(
      "create",
      "parties",
      undefined,
      context,
      {
        data: {
          id: expect.any(String),
          display_name: "Portable customer",
          status: "active",
        },
      },
      "party-create",
    );
  });

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

  it("rejects draft updates after issue and delegates atomic reverse_replace", async () => {
    const { adapter, documents } = setup("issued");
    expect(await adapter.validate(context, "commercial_documents", row("update"))).toMatchObject({
      disposition: "conflict",
      issues: [{ code: "STATE_CONFLICT" }],
    });
    expect(
      await adapter.validate(context, "commercial_documents", row("reverse_replace")),
    ).toMatchObject({
      disposition: "ready",
    });
    await adapter.apply(context, "commercial_documents", row("reverse_replace"), "replace-row");
    expect(documents.reverseReplace).toHaveBeenCalledWith(
      context,
      "doc-1",
      "2",
      expect.any(Object),
      "Correct imported workbook",
      "replace-row",
    );
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
    expect(portableMutationEntry("expense-categories")).toMatchObject({
      adapter: "master_data",
      canonicalResource: "expense-categories",
      operations: ["create", "update", "deactivate"],
    });
    expect(portableMutationEntry("journal_entries")).toMatchObject({
      adapter: "journal",
      operations: [],
    });
    expect(portableMutationEntry("service_plans")).toMatchObject({
      adapter: "customer_subscription",
      operations: ["create", "update", "deactivate"],
    });
    expect(portableMutationEntry("customer_service_subscriptions")).toMatchObject({
      adapter: "customer_subscription",
      operations: ["create", "update", "cancel"],
    });
    expect(portableOperationHasAccountingEffect("commercial_documents", "cancel")).toBe(true);
    expect(portableOperationHasAccountingEffect("parties", "update")).toBe(false);
    expect(
      portableBatchRequiresAtomicService([
        { resourceType: "commercial_documents", operation: "cancel" },
        { resourceType: "parties", operation: "update" },
      ]),
    ).toBe(true);
    expect(
      portableBatchRequiresAtomicService([
        { resourceType: "parties", operation: "update" },
        { resourceType: "accounts", operation: "deactivate" },
      ]),
    ).toBe(false);
  });

  it("preflights subscription relationships without mutation during portable dry-run", async () => {
    const { adapter, subscriptions } = setup();
    const subscriptionRow: PortableRowEnvelopeContract = {
      rowNumber: 2,
      operation: "create",
      stableId: "subscription-1",
      externalReferences: [],
      relationships: {
        customer_party_id: "client-1",
        service_plan_id: "plan-1",
        project_id: "project-1",
      },
      data: {
        starts_on: "2026-08-01",
        ends_on: null,
        quantity: "1",
        unit_price_minor: "2500000",
        currency: "VND",
        recurrence_frequency: "month",
        recurrence_interval: "1",
        billing_day: "1",
        lifecycle: "active",
      },
    };
    expect(
      await adapter.validate(context, "customer_service_subscriptions", subscriptionRow),
    ).toMatchObject({ disposition: "ready" });
    expect(subscriptions.validatePortableInput).toHaveBeenCalledWith(
      context,
      "customer_service_subscriptions",
      expect.objectContaining({
        customerPartyId: "client-1",
        servicePlanId: "plan-1",
        projectId: "project-1",
      }),
    );
    expect(subscriptions.createSubscription).not.toHaveBeenCalled();
  });
});
