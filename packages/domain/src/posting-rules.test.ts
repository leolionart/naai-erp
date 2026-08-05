import { describe, expect, it } from "vitest";
import { journalTotals } from "./journal.js";
import {
  assertManualJournalAllowed,
  createPostingRule,
  mapDocumentToJournalDraft,
  selectPostingRule,
} from "./posting-rules.js";

function rule(overrides: Partial<Parameters<typeof createPostingRule>[0]> = {}) {
  return createPostingRule({
    organizationId: "org-naai",
    id: "expense-v1",
    version: 1,
    documentType: "expense",
    effectiveFrom: "2026-01-01",
    debitAccountId: "expense-account",
    creditAccountId: "payable-account",
    ...overrides,
  });
}

describe("ERP-210 posting rule engine", () => {
  it("selects by organization, document, effective date and most-specific criteria", () => {
    const rules = [
      rule(),
      rule({ id: "category", categoryCode: "hosting" }),
      rule({
        id: "account-category-tax",
        version: 2,
        sourceAccountId: "company-card",
        categoryCode: "hosting",
        taxCode: "VAT10",
      }),
      rule({
        organizationId: "org-other",
        id: "foreign",
        categoryCode: "hosting",
        taxCode: "VAT10",
      }),
    ];
    expect(
      selectPostingRule(rules, {
        organizationId: "org-naai",
        documentType: "expense",
        postingDate: "2026-08-05",
        sourceAccountId: "company-card",
        categoryCode: "hosting",
        taxCode: "VAT10",
      }).id,
    ).toBe("account-category-tax");
  });

  it("uses latest effective version without rewriting historical selection", () => {
    const rules = [
      rule({ id: "expense", version: 1, effectiveTo: "2026-06-30" }),
      rule({
        id: "expense",
        version: 2,
        effectiveFrom: "2026-07-01",
        debitAccountId: "new-expense",
      }),
    ];
    expect(
      selectPostingRule(rules, {
        organizationId: "org-naai",
        documentType: "expense",
        postingDate: "2026-06-30",
      }).version,
    ).toBe(1);
    expect(
      selectPostingRule(rules, {
        organizationId: "org-naai",
        documentType: "expense",
        postingDate: "2026-07-01",
      }).version,
    ).toBe(2);
    expect(() =>
      selectPostingRule(rules, {
        organizationId: "org-naai",
        documentType: "invoice",
        postingDate: "2026-07-01",
      }),
    ).toThrow("No effective posting rule");
  });

  it("breaks otherwise equal selection deterministically", () => {
    const rules = [rule({ id: "z-rule" }), rule({ id: "a-rule" })];
    for (let index = 0; index < 20; index += 1) {
      expect(
        selectPostingRule(index % 2 ? rules : [...rules].reverse(), {
          organizationId: "org-naai",
          documentType: "expense",
          postingDate: "2026-08-05",
        }).id,
      ).toBe("a-rule");
    }
  });

  it("maps source lines to balanced journal lines and discloses rule versions", () => {
    const result = mapDocumentToJournalDraft({
      organizationId: "org-naai",
      journalId: "journal-1",
      documentType: "expense",
      documentId: "expense-1",
      postingDate: "2026-08-05",
      baseCurrency: "VND",
      description: "Hosting expense",
      rules: [
        rule({
          version: 3,
          categoryCode: "hosting",
          taxCode: "VAT10",
          requiredDimensions: ["project", "client", "cost_center", "service_line", "tax"],
        }),
      ],
      sourceLines: [
        {
          id: "source-1",
          amountMinor: 1_000_000n,
          categoryCode: "hosting",
          taxCode: "VAT10",
          dimensions: {
            projectId: "project-1",
            clientId: "client-1",
            costCenterCode: "delivery",
            serviceLineCode: "web-app",
            taxCode: "VAT10",
          },
        },
      ],
    });
    expect(result.journal.lines).toHaveLength(2);
    expect(journalTotals(result.journal)).toEqual({
      debitMinor: 1_000_000n,
      creditMinor: 1_000_000n,
    });
    expect(result.appliedRules).toEqual([
      { sourceLineId: "source-1", ruleId: "expense-v1", ruleVersion: 3 },
    ]);
  });

  it("rejects missing required accounting dimensions", () => {
    expect(() =>
      mapDocumentToJournalDraft({
        organizationId: "org-naai",
        journalId: "journal-1",
        documentType: "expense",
        documentId: "expense-1",
        postingDate: "2026-08-05",
        baseCurrency: "VND",
        description: "Hosting expense",
        rules: [rule({ requiredDimensions: ["project", "tax"] })],
        sourceLines: [{ id: "source-1", amountMinor: 100n, dimensions: { projectId: "p1" } }],
      }),
    ).toThrow("Missing required posting dimensions: tax");
  });

  it("requires manual permission and enforces blocked/elevated control accounts", () => {
    const protectedAccounts = [
      { accountId: "ar", protection: "blocked" as const },
      { accountId: "bank", protection: "elevated" as const },
    ];
    expect(() =>
      assertManualJournalAllowed({
        accountIds: ["expense"],
        protectedAccounts,
        hasManualJournalPermission: false,
        hasElevatedProtectedAccountPermission: false,
      }),
    ).toThrow("Manual journal permission");
    expect(() =>
      assertManualJournalAllowed({
        accountIds: ["ar"],
        protectedAccounts,
        hasManualJournalPermission: true,
        hasElevatedProtectedAccountPermission: true,
      }),
    ).toThrow("is blocked");
    expect(() =>
      assertManualJournalAllowed({
        accountIds: ["bank"],
        protectedAccounts,
        hasManualJournalPermission: true,
        hasElevatedProtectedAccountPermission: false,
      }),
    ).toThrow("requires elevated");
    expect(() =>
      assertManualJournalAllowed({
        accountIds: ["bank"],
        protectedAccounts,
        hasManualJournalPermission: true,
        hasElevatedProtectedAccountPermission: true,
      }),
    ).not.toThrow();
  });
});
