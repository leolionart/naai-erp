import { formatFundingPlanCsv } from "./funding-plans.helpers.js";

export const READ_ROLES = new Set(["owner", "finance_admin", "accountant", "approver", "viewer"]);
export const WRITE_ROLES = new Set(["owner", "finance_admin"]);

export type Context = Readonly<{
  organizationId: string;
  actorId: string;
  roles: readonly string[];
  correlationId: string;
}>;

export type ResolvedTarget = Readonly<{
  bucket: "owner_paid" | "owner_custody_cash" | "company_cash" | "company_bank";
  financialAccountId?: string;
  ledgerAccountCode: string;
}>;

export { formatFundingPlanCsv };
