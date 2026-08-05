import { describe, expect, it } from "vitest";
import {
  approveJournal,
  createDraftJournal,
  journalTotals,
  postJournal,
  reverseJournal,
} from "./journal.js";

function balancedDraft(amount: bigint) {
  return createDraftJournal({
    organizationId: "org-naai",
    id: `journal-${amount}`,
    entryDate: "2026-08-05",
    baseCurrency: "VND",
    description: "Balanced journal",
    lines: [
      { id: "line-debit", accountId: "expense", debitMinor: amount },
      { id: "line-credit", accountId: "bank", creditMinor: amount },
    ],
  });
}

describe("ERP-200 journal aggregate", () => {
  it("uses exact minor-unit bigint amounts beyond Number safe integer range", () => {
    const amount = 90_071_992_547_409_931n;
    const journal = postJournal(
      approveJournal(balancedDraft(amount), "2026-08-05T01:00:00Z"),
      "2026-08-05T02:00:00Z",
    );
    expect(journalTotals(journal)).toEqual({ debitMinor: amount, creditMinor: amount });
  });

  it("requires every line to have exactly one positive debit or credit", () => {
    const base = {
      organizationId: "org-naai",
      id: "invalid",
      entryDate: "2026-08-05",
      baseCurrency: "VND",
      description: "Invalid",
    } as const;
    expect(() =>
      createDraftJournal({
        ...base,
        lines: [
          { id: "a", accountId: "1", debitMinor: 1n, creditMinor: 1n },
          { id: "b", accountId: "2", creditMinor: 1n },
        ],
      }),
    ).toThrow("exactly one positive");
    expect(() =>
      createDraftJournal({
        ...base,
        lines: [
          { id: "a", accountId: "1", debitMinor: 0n, creditMinor: 0n },
          { id: "b", accountId: "2", creditMinor: 1n },
        ],
      }),
    ).toThrow("exactly one positive");
    expect(() =>
      createDraftJournal({
        ...base,
        lines: [
          { id: "a", accountId: "1", debitMinor: -1n },
          { id: "b", accountId: "2", creditMinor: 1n },
        ],
      }),
    ).toThrow("cannot be negative");
  });

  it("rejects an unbalanced journal atomically at posting", () => {
    const draft = createDraftJournal({
      organizationId: "org-naai",
      id: "unbalanced",
      entryDate: "2026-08-05",
      baseCurrency: "VND",
      description: "Unbalanced",
      lines: [
        { id: "a", accountId: "expense", debitMinor: 100n },
        { id: "b", accountId: "bank", creditMinor: 99n },
      ],
    });
    const approved = approveJournal(draft, "2026-08-05T01:00:00Z");
    expect(() => postJournal(approved, "2026-08-05T02:00:00Z")).toThrow("not balanced");
    expect(approved.state).toBe("approved");
    expect(approved).not.toHaveProperty("postedAt");
  });

  it("enforces the draft to approved to posted lifecycle", () => {
    const draft = balancedDraft(100n);
    expect(() => postJournal(draft, "2026-08-05T02:00:00Z")).toThrow("Only approved");
    const approved = approveJournal(draft, "2026-08-05T01:00:00Z");
    expect(() => approveJournal(approved, "2026-08-05T01:30:00Z")).toThrow("Only draft");
    const posted = postJournal(approved, "2026-08-05T02:00:00Z");
    expect(posted).toMatchObject({ state: "posted", version: 3 });
  });

  it("deep-freezes posted records so lines and dimensions cannot mutate", () => {
    const posted = postJournal(
      approveJournal(balancedDraft(100n), "2026-08-05T01:00:00Z"),
      "2026-08-05T02:00:00Z",
    );
    expect(Object.isFrozen(posted)).toBe(true);
    expect(Object.isFrozen(posted.lines)).toBe(true);
    expect(Object.isFrozen(posted.lines[0])).toBe(true);
    expect(Object.isFrozen(posted.lines[0]!.dimensions)).toBe(true);
    expect(() => ((posted.lines[0] as { debitMinor: bigint }).debitMinor = 7n)).toThrow();
    expect(() => (posted.lines as unknown as JournalEntryForMutation[]).push(posted)).toThrow();
  });

  it("creates a linked reversal whose net effect with the original is zero", () => {
    const posted = postJournal(
      approveJournal(balancedDraft(750n), "2026-08-05T01:00:00Z"),
      "2026-08-05T02:00:00Z",
    );
    const result = reverseJournal(posted, {
      reversalJournalId: "reversal-1",
      reversalDate: "2026-08-06",
      reversedAt: "2026-08-06T01:00:00Z",
    });
    const originalTotals = journalTotals(posted);
    const reversalTotals = journalTotals(result.reversal);
    expect(result.original).toMatchObject({ state: "reversed", reversedByJournalId: "reversal-1" });
    expect(result.reversal).toMatchObject({ state: "posted", reversalOfJournalId: posted.id });
    expect(
      originalTotals.debitMinor -
        originalTotals.creditMinor +
        reversalTotals.debitMinor -
        reversalTotals.creditMinor,
    ).toBe(0n);
    for (let index = 0; index < posted.lines.length; index += 1) {
      expect(result.reversal.lines[index]!.debitMinor).toBe(posted.lines[index]!.creditMinor);
      expect(result.reversal.lines[index]!.creditMinor).toBe(posted.lines[index]!.debitMinor);
    }
    expect(() =>
      reverseJournal(result.original, {
        reversalJournalId: "reversal-2",
        reversalDate: "2026-08-07",
        reversedAt: "2026-08-07T01:00:00Z",
      }),
    ).toThrow("Only posted");
  });

  it("preserves balance and reversal-zero properties across deterministic generated cases", () => {
    let seed = 0x5eedn;
    for (let caseNumber = 0; caseNumber < 1_000; caseNumber += 1) {
      seed = (seed * 1_103_515_245n + 12_345n) % 2_147_483_648n;
      const amount = seed + 1n;
      const posted = postJournal(
        approveJournal(balancedDraft(amount), "2026-08-05T01:00:00Z"),
        "2026-08-05T02:00:00Z",
      );
      const reversal = reverseJournal(posted, {
        reversalJournalId: `reversal-${caseNumber}`,
        reversalDate: "2026-08-06",
        reversedAt: "2026-08-06T01:00:00Z",
      }).reversal;
      expect(journalTotals(posted).debitMinor).toBe(journalTotals(posted).creditMinor);
      expect(journalTotals(reversal).debitMinor).toBe(journalTotals(reversal).creditMinor);
      expect(posted.lines[0]!.debitMinor + reversal.lines[0]!.creditMinor).toBe(amount * 2n);
      expect(posted.lines[0]!.debitMinor - reversal.lines[0]!.creditMinor).toBe(0n);
    }
  });
});

type JournalEntryForMutation = ReturnType<typeof balancedDraft>;
