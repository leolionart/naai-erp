import { describe, expect, it } from "vitest";
import {
  TAX_RECONCILIATION_CONTRACT_VERSION,
  type TaxExpenseReviewContract,
  type VatReconciliationContract,
} from "./index.js";

describe("ERP-630 tax reconciliation contracts", () => {
  it("separates VAT and CIT axes with string money", () => {
    const vat = {
      schemaVersion: TAX_RECONCILIATION_CONTRACT_VERSION,
      organizationId: "org-naai",
      currency: "VND",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      formulaVersion: "vat-reconciliation-v1",
      policyId: "strict",
      policyVersion: 1,
      status: "review_required",
      outputVatMinor: "8",
      inputVatMinor: "7",
      eligibleInputVatMinor: "4",
      ineligibleInputVatMinor: "2",
      unreviewedInputVatMinor: "1",
      netVatPayableMinor: "4",
      outputVatLedgerMinor: "8",
      inputVatLedgerMinor: "6",
      outputDifferenceMinor: "0",
      inputDifferenceMinor: "1",
      missingEvidenceItemIds: ["purchase-2"],
      unreconciledItemIds: ["expense-2"],
      invalidTaxCodeItemIds: ["expense-2"],
      unreviewedItemIds: ["expense-2"],
      sourceIds: ["sale-1"],
      journalIds: ["j-sale"],
      confidenceFlags: [],
    } satisfies VatReconciliationContract;
    const expenses = {
      schemaVersion: 1,
      organizationId: "org-naai",
      currency: "VND",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      formulaVersion: "tax-expense-review-v1",
      status: "review_required",
      accountingBookedMinor: "40",
      citBasisMinor: "38",
      citEligibleMinor: "27",
      citIneligibleMinor: "6",
      citUnreviewedMinor: "5",
      vatBasisMinor: "2",
      vatEligibleMinor: "1",
      vatIneligibleMinor: "1",
      vatUnreviewedMinor: "0",
      missingEvidenceItemIds: ["expense-b"],
      unreviewedItemIds: ["expense-c"],
      sourceIds: ["a", "b", "c", "d"],
      confidenceFlags: [],
    } satisfies TaxExpenseReviewContract;
    expect(vat.netVatPayableMinor).toBe("4");
    expect(expenses.citEligibleMinor).toBe("27");
  });
});
