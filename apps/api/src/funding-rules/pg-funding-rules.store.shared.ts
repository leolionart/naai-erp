import type {
  FundingInputContract,
  FundingRuleContract,
  OrganizationFundingDefaultContract,
} from "@naai-erp/contracts";

export type DefaultRow = {
  default_funding_type: FundingInputContract["type"];
  default_financial_account_id: string | null;
  version: string;
  updated_at: Date;
};

export type RuleRow = {
  id: string;
  name: string;
  priority: number;
  is_active: boolean;
  match_external_system: string | null;
  match_supplier_tax_id: string | null;
  match_category_code: string | null;
  match_keyword: string | null;
  match_min_amount_minor: string | null;
  match_max_amount_minor: string | null;
  target_funding_type: FundingInputContract["type"];
  target_financial_account_id: string | null;
  version: string;
  created_at: Date;
  updated_at: Date;
};

export function toDefaultView(row?: DefaultRow): OrganizationFundingDefaultContract {
  if (!row) {
    return {
      defaultFunding: { type: "owner_paid" },
      version: "0",
    };
  }
  return {
    defaultFunding: {
      type: row.default_funding_type,
      ...(row.default_financial_account_id
        ? { financialAccountId: row.default_financial_account_id }
        : {}),
    },
    version: row.version,
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toRuleView(row: RuleRow): FundingRuleContract {
  return {
    id: row.id,
    name: row.name,
    priority: row.priority,
    isActive: row.is_active,
    match: {
      externalSystem: row.match_external_system,
      supplierTaxId: row.match_supplier_tax_id,
      categoryCode: row.match_category_code,
      keyword: row.match_keyword,
      minAmountMinor: row.match_min_amount_minor,
      maxAmountMinor: row.match_max_amount_minor,
    },
    target: {
      type: row.target_funding_type,
      ...(row.target_financial_account_id
        ? { financialAccountId: row.target_financial_account_id }
        : {}),
    },
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
