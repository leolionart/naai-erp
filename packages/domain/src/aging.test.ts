import { describe, expect, it } from "vitest";
import {
  UnsupportedAgingFxError,
  buildAgingReport,
  classifyAgingBucket,
  deriveAgingPaymentStatus,
  type AgingSourceItem,
} from "./aging.js";

const movement = (
  id: string,
  role: "origin" | "settlement" | "adjustment" | "reversal",
  debitMinor: bigint,
  creditMinor: bigint,
  state: "posted" | "matched_reservation" = "posted",
  postedOn = "2026-08-31",
) => ({
  id,
  role,
  state,
  effectiveOn: postedOn,
  postedOn,
  debitMinor,
  creditMinor,
  journalId: `journal-${id}`,
  ...(role === "settlement" ? { reconciliationId: `rec-${id}` } : {}),
});

const receivable = (overrides: Partial<AgingSourceItem> = {}): AgingSourceItem => ({
  organizationId: "org-1",
  id: "ar-1",
  side: "ar",
  balanceKind: "receivable",
  sourceType: "commercial_document",
  sourceId: "invoice-1",
  partyId: "client-1",
  partyName: "Client One",
  controlAccountCode: "131",
  documentNumber: "INV-001",
  documentDate: "2026-07-01",
  dueDate: "2026-07-31",
  currency: "VND",
  movements: [movement("origin", "origin", 100n, 0n)],
  ...overrides,
});

describe("AR/AP aging domain", () => {
  it.each([
    ["2026-09-01", "current", 0],
    ["2026-08-31", "current", 0],
    ["2026-08-30", "1_30", 1],
    ["2026-08-01", "1_30", 30],
    ["2026-07-31", "31_60", 31],
    ["2026-07-01", "61_90", 61],
    ["2026-06-30", "61_90", 62],
    ["2026-06-01", "over_90", 91],
  ])("classifies due date %s into %s", (dueDate, bucket, daysOverdue) => {
    expect(classifyAgingBucket(dueDate, "2026-08-31")).toEqual({ bucket, daysOverdue });
  });

  it("keeps missing due dates loud in an unclassified bucket", () => {
    expect(classifyAgingBucket(undefined, "2026-08-31")).toEqual({ bucket: "unclassified" });
  });

  it("derives unpaid partial and paid status from exact balances", () => {
    expect(deriveAgingPaymentStatus(100n, 100n)).toBe("unpaid");
    expect(deriveAgingPaymentStatus(100n, 40n)).toBe("partially_paid");
    expect(deriveAgingPaymentStatus(100n, 0n)).toBe("paid");
  });

  it("uses posted movements through as-of and ignores matched reservations and later payments", () => {
    const report = buildAgingReport({
      organizationId: "org-1",
      side: "ar",
      asOf: "2026-08-31",
      timezone: "Asia/Ho_Chi_Minh",
      baseCurrency: "VND",
      items: [
        receivable({
          movements: [
            movement("origin", "origin", 100n, 0n),
            movement("matched", "settlement", 0n, 30n, "matched_reservation"),
            movement("later", "settlement", 0n, 60n, "posted", "2026-09-01"),
            movement("paid", "settlement", 0n, 20n),
          ],
        }),
      ],
      controlBalances: [
        { controlAccountCode: "131", currency: "VND", balanceMinor: 80n, baseBalanceMinor: 80n },
      ],
    });
    expect(report.items[0]).toMatchObject({
      originalMinor: 100n,
      settledMinor: 20n,
      outstandingMinor: 80n,
      paymentStatus: "partially_paid",
    });
    expect(report.items[0]?.reconciliationIds).toEqual(["rec-paid"]);
    expect(report.tieStatus).toBe("tied");
  });

  it("excludes a source whose origin journal was not posted by the as-of cutoff", () => {
    const report = buildAgingReport({
      organizationId: "org-1",
      side: "ar",
      asOf: "2026-08-31",
      timezone: "Asia/Ho_Chi_Minh",
      baseCurrency: "VND",
      items: [
        receivable({
          movements: [movement("future-origin", "origin", 100n, 0n, "posted", "2026-09-01")],
        }),
      ],
      controlBalances: [],
    });
    expect(report.items).toEqual([]);
    expect(report.tieStatus).toBe("tied");
  });

  it("shows customer credits separately without hiding overdue receivables", () => {
    const credit = receivable({
      id: "credit-1",
      sourceId: "credit-1",
      documentNumber: "CN-001",
      balanceKind: "customer_credit",
      movements: [movement("credit", "origin", 0n, 25n)],
    });
    const report = buildAgingReport({
      organizationId: "org-1",
      side: "ar",
      asOf: "2026-08-31",
      timezone: "Asia/Ho_Chi_Minh",
      baseCurrency: "VND",
      items: [receivable(), credit],
      controlBalances: [
        { controlAccountCode: "131", currency: "VND", balanceMinor: 75n, baseBalanceMinor: 75n },
      ],
    });
    expect(report.bucketTotals["31_60"]).toBe(100n);
    expect(report.creditOrAdvanceTotalMinor).toBe(25n);
    expect(report.outstandingTotalMinor).toBe(100n);
    expect(report.controlTies[0]).toMatchObject({
      subledgerBalanceMinor: 75n,
      status: "tied",
    });
  });

  it("keeps supplier advances separate and reports control-account mismatches loudly", () => {
    const bill: AgingSourceItem = {
      ...receivable(),
      id: "ap-1",
      side: "ap",
      balanceKind: "payable",
      partyId: "supplier-1",
      controlAccountCode: "331",
      movements: [movement("bill", "origin", 0n, 100n)],
    };
    const advance: AgingSourceItem = {
      ...bill,
      id: "advance-1",
      balanceKind: "supplier_advance",
      movements: [movement("advance", "origin", 30n, 0n)],
    };
    const report = buildAgingReport({
      organizationId: "org-1",
      side: "ap",
      asOf: "2026-08-31",
      timezone: "Asia/Ho_Chi_Minh",
      baseCurrency: "VND",
      items: [bill, advance],
      controlBalances: [
        { controlAccountCode: "331", currency: "VND", balanceMinor: 69n, baseBalanceMinor: 70n },
      ],
    });
    expect(report.creditOrAdvanceTotalMinor).toBe(30n);
    expect(report.controlTies[0]).toMatchObject({
      subledgerBalanceMinor: 70n,
      differenceMinor: 1n,
      status: "out_of_balance",
    });
    expect(report.tieStatus).toBe("out_of_balance");
  });

  it("requires explicit base amounts for foreign-currency movements", () => {
    expect(() =>
      buildAgingReport({
        organizationId: "org-1",
        side: "ar",
        asOf: "2026-08-31",
        timezone: "Asia/Ho_Chi_Minh",
        baseCurrency: "VND",
        items: [receivable({ currency: "USD" })],
        controlBalances: [],
      }),
    ).toThrow(UnsupportedAgingFxError);
  });

  it("keeps deterministic due-date party and item ordering and can include settled rows", () => {
    const paid = receivable({
      id: "paid",
      dueDate: "2026-07-01",
      movements: [
        movement("origin-paid", "origin", 100n, 0n),
        movement("settled", "settlement", 0n, 100n),
      ],
    });
    const report = buildAgingReport({
      organizationId: "org-1",
      side: "ar",
      asOf: "2026-08-31",
      timezone: "Asia/Ho_Chi_Minh",
      baseCurrency: "VND",
      items: [
        receivable({ id: "b", partyId: "client-b" }),
        receivable({ id: "a", partyId: "client-a" }),
        paid,
      ],
      controlBalances: [
        { controlAccountCode: "131", currency: "VND", balanceMinor: 200n, baseBalanceMinor: 200n },
      ],
      includeSettled: true,
    });
    expect(report.items.map((item) => item.id)).toEqual(["paid", "a", "b"]);
  });
});
