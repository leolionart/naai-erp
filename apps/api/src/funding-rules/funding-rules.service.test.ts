import { describe, expect, it } from "vitest";
import { matchFundingRule } from "./funding-rules.types.js";
import type { FundingRuleContract, OrganizationFundingDefaultContract } from "@naai-erp/contracts";

const rules: readonly FundingRuleContract[] = [
  {
    id: "r-low",
    name: "Default keyword",
    priority: 200,
    isActive: true,
    match: { keyword: "grab" },
    target: { type: "owner_paid" },
    version: "1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "r-high",
    name: "Parking n8n to custody",
    priority: 10,
    isActive: true,
    match: { externalSystem: "n8n", categoryCode: "PARKING", maxAmountMinor: "500000" },
    target: { type: "owner_custody_cash", financialAccountId: "cash-owner-custody" },
    version: "1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "r-tax",
    name: "Supplier tax ID to bank",
    priority: 50,
    isActive: true,
    match: { supplierTaxId: "0110660175" },
    target: { type: "company_bank", financialAccountId: "bank-main" },
    version: "1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "r-inactive",
    name: "Inactive rule",
    priority: 1,
    isActive: false,
    match: { categoryCode: "PARKING" },
    target: { type: "company_cash", financialAccountId: "cash-company" },
    version: "1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const orgDefault: OrganizationFundingDefaultContract = {
  defaultFunding: { type: "company_cash", financialAccountId: "cash-company" },
  version: "1",
};

describe("matchFundingRule", () => {
  it("always prefers explicit funding in the payload", () => {
    const res = matchFundingRule(rules, orgDefault, {
      externalSystem: "n8n",
      categoryCode: "PARKING",
      grossMinor: "10000",
      explicitFunding: { type: "owner_paid" },
    });
    expect(res).toEqual({
      resolvedFunding: { type: "owner_paid" },
      source: "explicit",
      matchedRule: null,
    });
  });

  it("matches active rules by priority order and ignores inactive rules", () => {
    const res = matchFundingRule(rules, orgDefault, {
      externalSystem: "N8N",
      categoryCode: "parking",
      description: "Grab parking",
      grossMinor: "50000",
    });
    expect(res.source).toBe("rule");
    expect(res.matchedRule?.id).toBe("r-high");
    expect(res.resolvedFunding).toEqual({
      type: "owner_custody_cash",
      financialAccountId: "cash-owner-custody",
    });
  });

  it("matches by supplierTaxId and falls back to lower-priority keyword or org default", () => {
    const byTax = matchFundingRule(rules, orgDefault, { supplierTaxId: "0110660175" });
    expect(byTax.matchedRule?.id).toBe("r-tax");

    const byDefault = matchFundingRule(rules, orgDefault, {
      description: "Office supplies",
      grossMinor: "100000",
    });
    expect(byDefault).toEqual({
      resolvedFunding: { type: "company_cash", financialAccountId: "cash-company" },
      source: "organization_default",
      matchedRule: null,
    });
  });
});
