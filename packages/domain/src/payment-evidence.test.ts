import { describe, expect, it } from "vitest";
import {
  DEFAULT_NON_CASH_THRESHOLD_MINOR,
  computeSameDaySupplierTotals,
  evaluatePaymentDeductibility,
  hasQualifyingNonCashPayment,
  normalizePaymentEvidenceInput,
  resolveEffectivePaymentState,
} from "./payment-evidence.js";

describe("T-UNIT-PAY-003 payment evidence and same-day supplier VAT aggregation", () => {
  it("defaults optional payment evidence fields to unpaid and none and validates inputs", () => {
    expect(normalizePaymentEvidenceInput()).toEqual({
      paymentMethod: "unpaid",
      paidOn: null,
      paymentEvidenceRef: null,
      transactionEvidence: "none",
    });

    expect(
      normalizePaymentEvidenceInput({
        payment_method: "bank_transfer",
        paid_on: "2026-08-15",
        payment_evidence_ref: "  UNC-2026-0815  ",
        transaction_evidence: "contract",
      }),
    ).toEqual({
      paymentMethod: "bank_transfer",
      paidOn: "2026-08-15",
      paymentEvidenceRef: "UNC-2026-0815",
      transactionEvidence: "contract",
    });

    expect(() => normalizePaymentEvidenceInput({ paymentMethod: "crypto" })).toThrow(
      "VALIDATION_FAILED",
    );
    expect(() =>
      normalizePaymentEvidenceInput({ paymentMethod: "unpaid", paidOn: "2026-08-15" }),
    ).toThrow("VALIDATION_FAILED");
    expect(() =>
      normalizePaymentEvidenceInput({ paymentMethod: "card", paidOn: "2026-02-30" }),
    ).toThrow("VALIDATION_FAILED");
  });

  it("enforces exact 4,999,999 vs 5,000,000 VND threshold boundaries and owner_paid evidence rules", () => {
    expect(DEFAULT_NON_CASH_THRESHOLD_MINOR).toBe(5_000_000n);

    const belowThresholdCash = evaluatePaymentDeductibility({
      grossMinor: 4_999_999n,
      hasInputVat: true,
      paymentMethod: "cash",
      paidOn: "2026-08-10",
      isOwnerPaid: false,
    });
    expect(belowThresholdCash.citGatedByPayment).toBe(false);
    expect(belowThresholdCash.vatGatedByPayment).toBe(false);
    expect(belowThresholdCash.paymentEvidenceMissing).toBe(false);

    const atThresholdCash = evaluatePaymentDeductibility({
      grossMinor: 5_000_000n,
      hasInputVat: true,
      paymentMethod: "cash",
      paidOn: "2026-08-10",
      isOwnerPaid: false,
    });
    expect(atThresholdCash.citGatedByPayment).toBe(true);
    expect(atThresholdCash.vatGatedByPayment).toBe(true);
    expect(atThresholdCash.paymentEvidenceMissing).toBe(true);
    expect(atThresholdCash.gapReasons).toContain("non_cash_payment_required");

    const ownerCardMissingRef = evaluatePaymentDeductibility({
      grossMinor: 5_000_000n,
      hasInputVat: true,
      paymentMethod: "card",
      paidOn: "2026-08-10",
      paymentEvidenceRef: null,
      isOwnerPaid: true,
    });
    expect(ownerCardMissingRef.qualifyingNonCash).toBe(false);
    expect(ownerCardMissingRef.paymentEvidenceMissing).toBe(true);
    expect(ownerCardMissingRef.gapReasons).toContain("owner_paid_evidence_ref_missing");

    const ownerCardWithRef = evaluatePaymentDeductibility({
      grossMinor: 5_000_000n,
      hasInputVat: true,
      paymentMethod: "card",
      paidOn: "2026-08-10",
      paymentEvidenceRef: "PERSONAL-CARD-SLIP-01",
      isOwnerPaid: true,
    });
    expect(ownerCardWithRef.qualifyingNonCash).toBe(true);
    expect(ownerCardWithRef.citGatedByPayment).toBe(false);
    expect(ownerCardWithRef.vatGatedByPayment).toBe(false);
    expect(ownerCardWithRef.paymentEvidenceMissing).toBe(false);
  });

  it("aggregates same-day same-supplier invoices for VAT threshold while keeping CIT per-transaction", () => {
    const slices = [
      {
        sourceType: "purchase_invoice" as const,
        sourceId: "inv-1",
        partyId: "SUP-01",
        date: "2026-08-15",
        grossMinor: 2_800_000n,
        paymentMethod: "cash" as const,
        paidOn: "2026-08-15",
        paymentEvidenceRef: null,
        isOwnerPaid: false,
      },
      {
        sourceType: "purchase_invoice" as const,
        sourceId: "inv-2",
        partyId: "SUP-01",
        date: "2026-08-15",
        grossMinor: 2_500_000n,
        paymentMethod: "bank_transfer" as const,
        paidOn: "2026-08-15",
        paymentEvidenceRef: "UNC-02",
        isOwnerPaid: false,
      },
      {
        sourceType: "purchase_invoice" as const,
        sourceId: "inv-other-day",
        partyId: "SUP-01",
        date: "2026-08-16",
        grossMinor: 3_000_000n,
        paymentMethod: "cash" as const,
        paidOn: "2026-08-16",
        paymentEvidenceRef: null,
        isOwnerPaid: false,
      },
      {
        sourceType: "purchase_invoice" as const,
        sourceId: "inv-other-supplier",
        partyId: "SUP-02",
        date: "2026-08-15",
        grossMinor: 3_000_000n,
        paymentMethod: "cash" as const,
        paidOn: "2026-08-15",
        paymentEvidenceRef: null,
        isOwnerPaid: false,
      },
    ];

    const totals = computeSameDaySupplierTotals(slices);
    expect(totals.get("SUP-01::2026-08-15")).toBe(5_300_000n);
    expect(totals.get("SUP-01::2026-08-16")).toBe(3_000_000n);
    expect(totals.get("SUP-02::2026-08-15")).toBe(3_000_000n);

    // Cash invoice in the >= 5M same-day same-supplier group loses VAT default, keeps CIT (< 5M individually)
    const inv1Decision = evaluatePaymentDeductibility({
      grossMinor: 2_800_000n,
      hasInputVat: true,
      paymentMethod: "cash",
      paidOn: "2026-08-15",
      isOwnerPaid: false,
      sameDaySupplierGrossMinor: totals.get("SUP-01::2026-08-15"),
    });
    expect(inv1Decision.citGatedByPayment).toBe(false);
    expect(inv1Decision.vatGatedByPayment).toBe(true);
    expect(inv1Decision.paymentEvidenceMissing).toBe(true);
    expect(inv1Decision.gapReasons).toContain("same_day_supplier_vat_threshold");

    // Bank-transfer invoice in the same >= 5M group keeps both CIT and VAT eligible
    const inv2Decision = evaluatePaymentDeductibility({
      grossMinor: 2_500_000n,
      hasInputVat: true,
      paymentMethod: "bank_transfer",
      paidOn: "2026-08-15",
      paymentEvidenceRef: "UNC-02",
      isOwnerPaid: false,
      sameDaySupplierGrossMinor: totals.get("SUP-01::2026-08-15"),
    });
    expect(inv2Decision.citGatedByPayment).toBe(false);
    expect(inv2Decision.vatGatedByPayment).toBe(false);
    expect(inv2Decision.paymentEvidenceMissing).toBe(false);

    // Different day or different supplier stays < 5M
    const otherDayDecision = evaluatePaymentDeductibility({
      grossMinor: 3_000_000n,
      hasInputVat: true,
      paymentMethod: "cash",
      paidOn: "2026-08-16",
      isOwnerPaid: false,
      sameDaySupplierGrossMinor: totals.get("SUP-01::2026-08-16"),
    });
    expect(otherDayDecision.paymentEvidenceMissing).toBe(false);
  });

  it("infers bank_transfer and paid_on from bank reconciliation", () => {
    expect(
      resolveEffectivePaymentState({
        paymentMethod: "unpaid",
        paidOn: null,
        reconciledBankPaidOn: "2026-08-20",
      }),
    ).toEqual({
      effectivePaymentMethod: "bank_transfer",
      effectivePaidOn: "2026-08-20",
      inferredFromReconciliation: true,
    });
    expect(
      hasQualifyingNonCashPayment({
        paymentMethod: "unpaid",
        isOwnerPaid: true,
        isBankReconciled: true,
      }),
    ).toBe(true);
  });
});
