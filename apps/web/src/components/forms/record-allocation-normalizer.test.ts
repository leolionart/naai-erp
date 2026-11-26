import { describe, expect, it } from "vitest";
import { normalizeExistingAllocations } from "./record-allocation-normalizer";

describe("normalizeExistingAllocations", () => {
  it("extracts allocationId from PostgreSQL snake_case allocation rows for draft PATCH", () => {
    const normalized = normalizeExistingAllocations(
      [
        {
          organization_id: "org-ui",
          expense_id: "exp-draft-1",
          line_number: 1,
          allocation_number: 1,
          amount_minor: 500000,
          dimensions: { allocationId: "exp-draft-1-alloc", costCenter: "ADMIN" },
        },
      ],
      "650000",
      (dims) => ({ ...(dims ?? {}), category: "TRAVEL" }),
    );

    expect(normalized).toEqual([
      {
        id: "exp-draft-1-alloc",
        amountMinor: "650000",
        dimensions: { costCenter: "ADMIN", category: "TRAVEL" },
      },
    ]);
  });

  it("preserves individual amounts when multiple allocations exist", () => {
    const normalized = normalizeExistingAllocations(
      [
        { allocation_number: 1, amount_minor: "300000", dimensions: { costCenter: "A" } },
        { id: "custom-2", amountMinor: "200000", dimensions: { costCenter: "B" } },
      ],
      "500000",
      (dims) => ({ ...(dims ?? {}) }),
    );

    expect(normalized).toEqual([
      { id: "alloc-1", amountMinor: "300000", dimensions: { costCenter: "A" } },
      { id: "custom-2", amountMinor: "200000", dimensions: { costCenter: "B" } },
    ]);
  });
});
