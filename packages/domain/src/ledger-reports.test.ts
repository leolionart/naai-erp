import { describe, expect, it } from "vitest";
import { approveJournal, createDraftJournal, postJournal, reverseJournal } from "./journal.js";
import {
  buildGeneralLedger,
  buildTrialBalance,
  validateOpeningBalances,
} from "./ledger-reports.js";

function posted(input: {
  id: string;
  entryDate: string;
  debitAccount: string;
  creditAccount: string;
  amount: bigint;
  sourceDocumentId?: string;
}) {
  const draft = createDraftJournal({
    organizationId: "org-naai",
    id: input.id,
    entryDate: input.entryDate,
    baseCurrency: "VND",
    description: input.id,
    lines: [
      { id: `${input.id}-dr`, accountId: input.debitAccount, debitMinor: input.amount },
      { id: `${input.id}-cr`, accountId: input.creditAccount, creditMinor: input.amount },
    ],
  });
  return {
    ...postJournal(
      approveJournal(draft, `${input.entryDate}T01:00:00Z`),
      `${input.entryDate}T02:00:00Z`,
    ),
    ...(input.sourceDocumentId ? { sourceDocumentId: input.sourceDocumentId } : {}),
  };
}

describe("ERP-240 core ledger reports", () => {
  it("matches the independently reviewed GF-LEDGER-001 closing balances", () => {
    const postDraft = (draft: ReturnType<typeof createDraftJournal>) =>
      postJournal(
        approveJournal(draft, `${draft.entryDate}T01:00:00Z`),
        `${draft.entryDate}T02:00:00Z`,
      );
    const opening = postDraft(
      createDraftJournal({
        organizationId: "org-naai",
        id: "OB-2026",
        entryDate: "2026-01-01",
        baseCurrency: "VND",
        description: "Opening balances",
        lines: [
          { id: "ob-bank", accountId: "111-BANK", debitMinor: 300_000_000n },
          { id: "ob-ar", accountId: "131-AR", debitMinor: 120_000_000n },
          { id: "ob-equipment", accountId: "211-EQUIPMENT", debitMinor: 80_000_000n },
          { id: "ob-ap", accountId: "331-AP", creditMinor: 50_000_000n },
          { id: "ob-capital", accountId: "411-CAPITAL", creditMinor: 450_000_000n },
        ],
      }),
    );
    const invoice = postDraft(
      createDraftJournal({
        organizationId: "org-naai",
        id: "J-025",
        entryDate: "2026-01-25",
        baseCurrency: "VND",
        description: "Service invoice",
        lines: [
          { id: "invoice-ar", accountId: "131-AR", debitMinor: 55_000_000n },
          { id: "invoice-revenue", accountId: "511-SERVICE-REVENUE", creditMinor: 50_000_000n },
          { id: "invoice-vat", accountId: "3331-VAT-OUTPUT", creditMinor: 5_000_000n },
        ],
      }),
    );
    const error = posted({
      id: "J-027-ERR",
      entryDate: "2026-01-27",
      debitAccount: "642-OPEX",
      creditAccount: "111-BANK",
      amount: 12_000_000n,
    });
    const reversed = reverseJournal(error, {
      reversalJournalId: "J-028-REV",
      reversalDate: "2026-01-28",
      reversedAt: "2026-01-28T01:00:00Z",
    });
    const report = buildTrialBalance({
      journals: [
        opening,
        posted({
          id: "J-010",
          entryDate: "2026-01-10",
          debitAccount: "642-OPEX",
          creditAccount: "111-BANK",
          amount: 30_000_000n,
        }),
        posted({
          id: "J-015",
          entryDate: "2026-01-15",
          debitAccount: "111-BANK",
          creditAccount: "131-AR",
          amount: 70_000_000n,
        }),
        posted({
          id: "J-020",
          entryDate: "2026-01-20",
          debitAccount: "331-AP",
          creditAccount: "111-BANK",
          amount: 20_000_000n,
        }),
        invoice,
        reversed.original,
        reversed.reversal,
        posted({
          id: "J-028-RPL",
          entryDate: "2026-01-28",
          debitAccount: "642-OPEX",
          creditAccount: "111-BANK",
          amount: 10_000_000n,
        }),
      ],
      organizationId: "org-naai",
      baseCurrency: "VND",
      startsOn: "2026-01-01",
      endsOn: "2026-01-31",
    });
    expect([report.debitMinor, report.creditMinor]).toEqual([709_000_000n, 709_000_000n]);
    expect(
      Object.fromEntries(report.rows.map((row) => [row.accountId, row.closingNetMinor])),
    ).toEqual({
      "111-BANK": 310_000_000n,
      "131-AR": 105_000_000n,
      "211-EQUIPMENT": 80_000_000n,
      "331-AP": -30_000_000n,
      "3331-VAT-OUTPUT": -5_000_000n,
      "411-CAPITAL": -450_000_000n,
      "511-SERVICE-REVENUE": -50_000_000n,
      "642-OPEX": 40_000_000n,
    });
    const closingDebit = report.rows.reduce(
      (sum, row) => sum + (row.closingNetMinor > 0n ? row.closingNetMinor : 0n),
      0n,
    );
    const closingCredit = report.rows.reduce(
      (sum, row) => sum + (row.closingNetMinor < 0n ? -row.closingNetMinor : 0n),
      0n,
    );
    expect([closingDebit, closingCredit]).toEqual([535_000_000n, 535_000_000n]);
  });

  it("builds an exact Trial Balance that balances to zero with drilldown", () => {
    const capital = posted({
      id: "capital",
      entryDate: "2026-01-01",
      debitAccount: "bank",
      creditAccount: "equity",
      amount: 500_000_000n,
      sourceDocumentId: "capital-doc",
    });
    const expense = posted({
      id: "expense",
      entryDate: "2026-02-01",
      debitAccount: "opex",
      creditAccount: "bank",
      amount: 1_100_000n,
      sourceDocumentId: "expense-doc",
    });
    const report = buildTrialBalance({
      journals: [capital, expense],
      organizationId: "org-naai",
      baseCurrency: "VND",
      startsOn: "2026-02-01",
      endsOn: "2026-02-28",
    });
    expect(report).toMatchObject({
      openingNetMinor: 0n,
      debitMinor: 1_100_000n,
      creditMinor: 1_100_000n,
      closingNetMinor: 0n,
    });
    expect(report.rows.find((row) => row.accountId === "bank")).toMatchObject({
      openingNetMinor: 500_000_000n,
      creditMinor: 1_100_000n,
      closingNetMinor: 498_900_000n,
    });
    expect(report.rows.find((row) => row.accountId === "opex")?.drilldown[0]).toMatchObject({
      sourceId: "expense-doc",
      sourceKind: "document",
      journalId: "expense",
    });
  });

  it("excludes draft/approved journals but retains reversed history plus its inverse", () => {
    const original = posted({
      id: "original",
      entryDate: "2026-03-01",
      debitAccount: "expense",
      creditAccount: "bank",
      amount: 900n,
    });
    const reversed = reverseJournal(original, {
      reversalJournalId: "reversal",
      reversalDate: "2026-03-02",
      reversedAt: "2026-03-02T01:00:00Z",
    });
    const draft = createDraftJournal({
      organizationId: "org-naai",
      id: "draft",
      entryDate: "2026-03-03",
      baseCurrency: "VND",
      description: "Not posted",
      lines: [
        { id: "draft-dr", accountId: "expense", debitMinor: 10_000n },
        { id: "draft-cr", accountId: "bank", creditMinor: 10_000n },
      ],
    });
    const report = buildTrialBalance({
      journals: [reversed.original, reversed.reversal, draft],
      organizationId: "org-naai",
      baseCurrency: "VND",
      startsOn: "2026-03-01",
      endsOn: "2026-03-31",
    });
    expect(report.debitMinor).toBe(1_800n);
    expect(report.creditMinor).toBe(1_800n);
    expect(report.rows.every((row) => row.closingNetMinor === 0n)).toBe(true);
  });

  it("builds deterministic General Ledger running balances with opening balance", () => {
    const report = buildGeneralLedger({
      journals: [
        posted({
          id: "opening",
          entryDate: "2026-01-01",
          debitAccount: "bank",
          creditAccount: "equity",
          amount: 1_000n,
        }),
        posted({
          id: "z-credit",
          entryDate: "2026-02-02",
          debitAccount: "expense",
          creditAccount: "bank",
          amount: 300n,
        }),
        posted({
          id: "a-debit",
          entryDate: "2026-02-01",
          debitAccount: "bank",
          creditAccount: "revenue",
          amount: 500n,
        }),
      ],
      organizationId: "org-naai",
      accountId: "bank",
      baseCurrency: "VND",
      startsOn: "2026-02-01",
      endsOn: "2026-02-28",
    });
    expect(report.openingBalanceMinor).toBe(1_000n);
    expect(report.entries.map((entry) => [entry.journalId, entry.runningBalanceMinor])).toEqual([
      ["a-debit", 1_500n],
      ["z-credit", 1_200n],
    ]);
    expect(report.closingBalanceMinor).toBe(1_200n);
  });

  it("validates approved opening control totals and preserves AR/AP detail", () => {
    const result = validateOpeningBalances({
      organizationId: "org-naai",
      baseCurrency: "VND",
      effectiveOn: "2026-01-01",
      approvedBy: "accountant",
      approvedAt: "2026-01-01T00:00:00Z",
      expectedDebitMinor: 500n,
      expectedCreditMinor: 500n,
      lines: [
        {
          id: "ar-1",
          accountId: "ar",
          debitMinor: 500n,
          controlAccount: "ar",
          partyId: "client-1",
          documentReference: "INV-001",
        },
        { id: "equity-1", accountId: "equity", creditMinor: 500n },
      ],
    });
    expect(result.lines[0]).toMatchObject({ partyId: "client-1", documentReference: "INV-001" });
  });

  it("rejects unexplained opening variance, hidden plugs and missing subledger detail", () => {
    const base = {
      organizationId: "org-naai",
      baseCurrency: "VND",
      effectiveOn: "2026-01-01",
      approvedBy: "accountant",
      approvedAt: "2026-01-01T00:00:00Z",
    } as const;
    expect(() =>
      validateOpeningBalances({
        ...base,
        expectedDebitMinor: 500n,
        expectedCreditMinor: 499n,
        lines: [
          { id: "a", accountId: "bank", debitMinor: 500n },
          { id: "b", accountId: "equity", creditMinor: 499n },
        ],
      }),
    ).toThrow("hidden balancing plugs");
    expect(() =>
      validateOpeningBalances({
        ...base,
        expectedDebitMinor: 500n,
        expectedCreditMinor: 500n,
        lines: [
          { id: "a", accountId: "bank", debitMinor: 499n },
          { id: "b", accountId: "equity", creditMinor: 499n },
        ],
      }),
    ).toThrow("do not match approved control totals");
    expect(() =>
      validateOpeningBalances({
        ...base,
        expectedDebitMinor: 500n,
        expectedCreditMinor: 500n,
        lines: [
          { id: "a", accountId: "ar", debitMinor: 500n, controlAccount: "ar" },
          { id: "b", accountId: "equity", creditMinor: 500n },
        ],
      }),
    ).toThrow("require party and document detail");
  });
});
