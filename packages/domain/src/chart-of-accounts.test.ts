import { describe, expect, it } from "vitest";

import {
  assertNonOverlappingVersions,
  assertValidAccountParent,
  createAccount,
  createStatutoryAccountMapping,
  createTaxCodeVersion,
  resolveEffectiveVersion,
  updateAccount,
} from "./chart-of-accounts.js";

describe("ERP-110 chart of accounts", () => {
  it("defaults control accounts to blocked manual posting", () => {
    const account = createAccount({
      organizationId: "org-naai",
      code: "131",
      name: "Phải thu khách hàng",
      rootType: "asset",
      isControlAccount: true,
    });
    expect(account.allowManualPosting).toBe(false);
    expect(() =>
      createAccount({
        ...account,
        organizationId: account.organizationId,
        allowManualPosting: true,
      }),
    ).toThrow();
  });

  it("preserves root type after ledger history and allows deactivation", () => {
    const account = createAccount({
      organizationId: "org-naai",
      code: "511",
      name: "Doanh thu dịch vụ",
      rootType: "revenue",
    });
    expect(() => updateAccount(account, { rootType: "asset" }, true)).toThrow("cannot change");
    expect(updateAccount(account, { isActive: false }, true).isActive).toBe(false);
  });

  it("rejects cross-organization and root-mismatched parents", () => {
    const child = createAccount({
      organizationId: "org-naai",
      code: "1111",
      name: "Bank",
      rootType: "asset",
    });
    const foreignParent = createAccount({
      organizationId: "org-other",
      code: "111",
      name: "Cash",
      rootType: "asset",
    });
    const wrongRoot = createAccount({
      organizationId: "org-naai",
      code: "511",
      name: "Revenue",
      rootType: "revenue",
    });
    expect(() => assertValidAccountParent(child, foreignParent)).toThrow("same organization");
    expect(() => assertValidAccountParent(child, wrongRoot)).toThrow("same root type");
  });

  it("creates dated TT133 and TT200 mappings", () => {
    expect(
      createStatutoryAccountMapping({
        organizationId: "org-naai",
        accountCode: "511",
        framework: "TT133",
        statutoryCode: "5111",
        effectiveFrom: "2026-01-01",
      }).framework,
    ).toBe("TT133");
    expect(() =>
      createStatutoryAccountMapping({
        organizationId: "org-naai",
        accountCode: "511",
        framework: "TT200",
        statutoryCode: "5113",
        effectiveFrom: "2026-02-01",
        effectiveTo: "2026-01-01",
      }),
    ).toThrow("cannot precede");
  });

  it("keeps tax policy draft until explicitly accountant approved", () => {
    const tax = createTaxCodeVersion({
      organizationId: "org-naai",
      code: "VAT-IN-10",
      name: "VAT đầu vào 10%",
      kind: "vat_input",
      rate: "10.000000",
      effectiveFrom: "2026-01-01",
      requiredEvidence: ["supplier_invoice", "payment_evidence", "supplier_invoice"],
    });
    expect(tax.reviewState).toBe("draft");
    expect(tax.requiredEvidence).toEqual(["supplier_invoice", "payment_evidence"]);
  });

  it("resolves half-open effective ranges and rejects overlaps", () => {
    const versions = [
      { effectiveFrom: "2026-01-01", effectiveTo: "2026-07-01", value: "old" },
      { effectiveFrom: "2026-07-01", value: "new" },
    ];
    assertNonOverlappingVersions(versions);
    expect(resolveEffectiveVersion(versions, "2026-06-30")?.value).toBe("old");
    expect(resolveEffectiveVersion(versions, "2026-07-01")?.value).toBe("new");
    expect(() =>
      assertNonOverlappingVersions([
        { effectiveFrom: "2026-01-01", effectiveTo: "2026-08-01" },
        { effectiveFrom: "2026-07-01" },
      ]),
    ).toThrow("cannot overlap");
  });
});
