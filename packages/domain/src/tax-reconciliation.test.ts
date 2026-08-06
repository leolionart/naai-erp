import { describe, expect, it } from "vitest";
import {
  buildTaxExpenseReview,
  buildVatReconciliation,
  type TaxExpenseReviewItem,
  type VatSourceItem,
} from "./tax-reconciliation.js";

const vatItems: VatSourceItem[] = [
  {
    id: "sale-vat",
    sourceId: "sale-1",
    sourceType: "sales_invoice",
    taxKind: "output",
    taxMinor: 10n,
    direction: "normal",
    taxCode: "VAT10-OUT",
    taxCodeApproved: true,
    postedToLedger: true,
    journalId: "j-sale",
    requiredEvidenceTypes: ["invoice"],
    presentEvidenceTypes: ["invoice"],
  },
  {
    id: "credit-vat",
    sourceId: "credit-1",
    sourceType: "sales_credit_note",
    taxKind: "output",
    taxMinor: 2n,
    direction: "reversal",
    taxCode: "VAT10-OUT",
    taxCodeApproved: true,
    postedToLedger: true,
    journalId: "j-credit",
    requiredEvidenceTypes: ["credit_note"],
    presentEvidenceTypes: ["credit_note"],
  },
  {
    id: "purchase-eligible",
    sourceId: "purchase-1",
    sourceType: "purchase_invoice",
    taxKind: "input",
    taxMinor: 3n,
    direction: "normal",
    reviewState: "eligible",
    taxCode: "VAT10-IN",
    taxCodeApproved: true,
    postedToLedger: true,
    journalId: "j-purchase-1",
    requiredEvidenceTypes: ["invoice", "payment"],
    presentEvidenceTypes: ["invoice", "payment"],
  },
  {
    id: "purchase-partial",
    sourceId: "purchase-2",
    sourceType: "purchase_invoice",
    taxKind: "input",
    taxMinor: 2n,
    direction: "normal",
    reviewState: "partially_eligible",
    eligibleMinor: 1n,
    taxCode: "VAT10-IN",
    taxCodeApproved: true,
    postedToLedger: true,
    journalId: "j-purchase-2",
    requiredEvidenceTypes: ["invoice"],
    presentEvidenceTypes: [],
  },
  {
    id: "expense-ineligible",
    sourceId: "expense-1",
    sourceType: "expense",
    taxKind: "input",
    taxMinor: 1n,
    direction: "normal",
    reviewState: "ineligible",
    taxCode: "VAT-NONDEDUCTIBLE",
    taxCodeApproved: true,
    postedToLedger: true,
    journalId: "j-expense-1",
    requiredEvidenceTypes: [],
    presentEvidenceTypes: [],
  },
  {
    id: "expense-unreviewed",
    sourceId: "expense-2",
    sourceType: "expense",
    taxKind: "input",
    taxMinor: 1n,
    direction: "normal",
    reviewState: "unreviewed",
    taxCodeApproved: false,
    postedToLedger: false,
    requiredEvidenceTypes: ["invoice"],
    presentEvidenceTypes: [],
  },
];

describe("ERP-630 VAT and tax expense review", () => {
  it("keeps output, input, eligible, ineligible and unreviewed VAT distinct", () => {
    const report = buildVatReconciliation({
      organizationId: "org-naai",
      currency: "vnd",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      policy: {
        id: "strict-vat",
        version: 1,
        maxLedgerDifferenceMinor: 0n,
        maxUnreviewedInputMinor: 0n,
        maxUnresolvedItemCount: 0,
        maxMissingEvidenceCount: 0,
      },
      outputVatLedgerMinor: 8n,
      inputVatLedgerMinor: 6n,
      items: vatItems,
    });
    expect(report).toMatchObject({
      currency: "VND",
      status: "review_required",
      outputVatMinor: 8n,
      inputVatMinor: 7n,
      eligibleInputVatMinor: 4n,
      ineligibleInputVatMinor: 2n,
      unreviewedInputVatMinor: 1n,
      netVatPayableMinor: 4n,
      outputDifferenceMinor: 0n,
      inputDifferenceMinor: 1n,
    });
    expect(report.confidenceFlags.map((flag) => flag.code)).toEqual(
      expect.arrayContaining([
        "vat_ledger_difference",
        "vat_missing_evidence",
        "vat_unreconciled_source",
        "vat_tax_code_invalid",
        "vat_input_unreviewed",
      ]),
    );
  });

  it("requires exact bounded partial and accountant override metadata", () => {
    expect(() =>
      buildVatReconciliation({
        organizationId: "org-naai",
        currency: "VND",
        startsOn: "2026-08-01",
        endsOn: "2026-08-31",
        policy: {
          id: "strict-vat",
          version: 1,
          maxLedgerDifferenceMinor: 0n,
          maxUnreviewedInputMinor: 0n,
          maxUnresolvedItemCount: 0,
          maxMissingEvidenceCount: 0,
        },
        outputVatLedgerMinor: 0n,
        inputVatLedgerMinor: 0n,
        items: [
          {
            ...vatItems[2]!,
            reviewState: "partially_eligible",
            eligibleMinor: 4n,
          },
        ],
      }),
    ).toThrow("bounded eligible amount");
  });

  it("summarizes accounting, CIT and VAT review axes without conflating them", () => {
    const items: TaxExpenseReviewItem[] = [
      {
        id: "expense-a",
        sourceId: "a",
        accountingBookedMinor: 21n,
        citBasisMinor: 20n,
        citReviewState: "eligible",
        vatBasisMinor: 1n,
        vatReviewState: "eligible",
        requiredEvidenceTypes: ["invoice"],
        presentEvidenceTypes: ["invoice"],
      },
      {
        id: "expense-b",
        sourceId: "b",
        accountingBookedMinor: 11n,
        citBasisMinor: 10n,
        citReviewState: "partially_eligible",
        citEligibleMinor: 6n,
        vatBasisMinor: 1n,
        vatReviewState: "ineligible",
        requiredEvidenceTypes: ["invoice", "payment"],
        presentEvidenceTypes: ["invoice"],
      },
      {
        id: "expense-c",
        sourceId: "c",
        accountingBookedMinor: 5n,
        citBasisMinor: 5n,
        citReviewState: "unreviewed",
        vatBasisMinor: 0n,
        vatReviewState: "unreviewed",
        requiredEvidenceTypes: ["receipt"],
        presentEvidenceTypes: [],
      },
      {
        id: "expense-d",
        sourceId: "d",
        accountingBookedMinor: 3n,
        citBasisMinor: 3n,
        citReviewState: "accountant_override",
        citEligibleMinor: 1n,
        vatBasisMinor: 0n,
        vatReviewState: "ineligible",
        reviewerId: "accountant",
        reviewReason: "Reviewed exception",
        reviewReferenceId: "memo-1",
        requiredEvidenceTypes: [],
        presentEvidenceTypes: [],
      },
    ];
    const report = buildTaxExpenseReview({
      organizationId: "org-naai",
      currency: "VND",
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      items,
    });
    expect(report).toMatchObject({
      status: "review_required",
      accountingBookedMinor: 40n,
      citBasisMinor: 38n,
      citEligibleMinor: 27n,
      citIneligibleMinor: 6n,
      citUnreviewedMinor: 5n,
      vatBasisMinor: 2n,
      vatEligibleMinor: 1n,
      vatIneligibleMinor: 1n,
      vatUnreviewedMinor: 0n,
    });
    expect(report.missingEvidenceItemIds).toEqual(["expense-b", "expense-c"]);
  });
});
