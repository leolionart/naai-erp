import { createHash } from "node:crypto";
import {
  FUNDING_PLAN_MAX_ITEMS,
  type FundingPlanItemInput,
  type FundingPlanPreviewItem,
} from "./funding-plans.types.js";
import type { FundingPlansService } from "./funding-plans.service.js";

export async function evaluatePlanOperation(
  this: FundingPlansService,
  organizationId: string,
  items: readonly FundingPlanItemInput[],
) {
  if (!Array.isArray(items) || items.length === 0 || items.length > FUNDING_PLAN_MAX_ITEMS) {
    throw new Error("VALIDATION_FAILED");
  }
  const ownerLine = await this.pool.query<{ account_code: string }>(
    `select l.account_code
       from financial_statement_mapping_versions v
       join financial_statement_mapping_lines l
         on l.organization_id=v.organization_id and l.mapping_id=v.id and l.mapping_version=v.version
      where v.organization_id=$1 and l.line_code='owner_current'
      order by v.effective_from desc, v.version desc limit 1`,
    [organizationId],
  );
  const ownerCurrentCode = ownerLine.rows[0]?.account_code ?? "3388-OWNER";

  const previews: FundingPlanPreviewItem[] = [];
  const delta = {
    owner_paid: 0n,
    owner_custody_cash: 0n,
    company_cash: 0n,
    company_bank: 0n,
  };

  for (const item of items) {
    const target = await this.resolveTarget(organizationId, item.targetFunding, ownerCurrentCode);
    if (!target) {
      previews.push({
        kind: item.kind,
        id: item.id,
        version: "0",
        targetFunding: item.targetFunding,
        status: "blocked",
        blockedReason: "INVALID_TARGET",
      });
      continue;
    }

    if (item.kind === "expense") {
      const res = await this.pool.query<{
        state: string;
        version: string;
        gross_minor: string;
        counter_account_code: string;
        expense_date: string;
        fa_code: string | null;
        fa_kind: string | null;
        reconciled: boolean;
        period_state: string | null;
      }>(
        `select e.state::text, e.version::text, e.gross_minor::text, e.counter_account_code,
                e.expense_date::text, fa.code as fa_code, fa.kind::text as fa_kind,
                exists(select 1 from reconciliation_allocations ra where ra.organization_id=e.organization_id and ra.expense_id=e.id) as reconciled,
                (select fp.state::text from fiscal_periods fp
                  where fp.organization_id=e.organization_id
                    and e.expense_date >= fp.starts_on and e.expense_date <= fp.ends_on limit 1) as period_state
           from expenses e
           left join financial_accounts fa on fa.organization_id=e.organization_id and fa.id=e.funding_financial_account_id
          where e.organization_id=$1 and e.id=$2`,
        [organizationId, item.id],
      );
      const row = res.rows[0];
      if (!row) {
        previews.push({
          kind: item.kind,
          id: item.id,
          version: "0",
          targetFunding: item.targetFunding,
          status: "blocked",
          blockedReason: "NOT_FOUND",
        });
        continue;
      }
      const blockedReason =
        row.state !== "posted"
          ? "INVALID_STATE"
          : row.reconciled
            ? "ALREADY_RECONCILED"
            : row.period_state && row.period_state !== "open"
              ? "CLOSED_PERIOD"
              : undefined;
      if (blockedReason) {
        previews.push({
          kind: item.kind,
          id: item.id,
          version: row.version,
          targetFunding: item.targetFunding,
          status: "blocked",
          blockedReason,
        });
        continue;
      }
      const currentBucket = this.classifyBucket(row.counter_account_code, row.fa_code, row.fa_kind);
      const amt = BigInt(row.gross_minor);
      delta[currentBucket] -= amt;
      delta[target.bucket] += amt;
      previews.push({
        kind: item.kind,
        id: item.id,
        version: row.version,
        targetFunding: item.targetFunding,
        status: "ready",
        beforeAccount: row.counter_account_code,
        afterAccount: target.ledgerAccountCode,
        ...(target.financialAccountId
          ? { targetFinancialAccountId: target.financialAccountId }
          : {}),
        grossMinor: row.gross_minor,
      });
    } else {
      const res = await this.pool.query<{
        type: string;
        state: string;
        version: string;
        gross_minor: string;
        control_account_code: string;
        fa_code: string | null;
        fa_kind: string | null;
        reconciled: boolean;
        period_state: string | null;
      }>(
        `select d.type::text, d.state::text, d.version::text, d.gross_minor::text, d.control_account_code,
                fa.code as fa_code, fa.kind::text as fa_kind,
                exists(select 1 from reconciliation_allocations ra where ra.organization_id=d.organization_id and ra.commercial_document_id=d.id) as reconciled,
                (select fp.state::text from fiscal_periods fp
                  where fp.organization_id=d.organization_id
                    and d.document_date >= fp.starts_on and d.document_date <= fp.ends_on limit 1) as period_state
           from commercial_documents d
           left join financial_accounts fa on fa.organization_id=d.organization_id and fa.id=d.funding_financial_account_id
          where d.organization_id=$1 and d.id=$2`,
        [organizationId, item.id],
      );
      const row = res.rows[0];
      if (!row || row.type !== "purchase_invoice") {
        previews.push({
          kind: item.kind,
          id: item.id,
          version: "0",
          targetFunding: item.targetFunding,
          status: "blocked",
          blockedReason: "NOT_FOUND",
        });
        continue;
      }
      const blockedReason =
        row.state === "paid" || row.state === "partially_paid"
          ? "ALREADY_PAID"
          : !["posted", "issued"].includes(row.state)
            ? "INVALID_STATE"
            : row.reconciled
              ? "ALREADY_RECONCILED"
              : row.period_state && row.period_state !== "open"
                ? "CLOSED_PERIOD"
                : undefined;
      if (blockedReason) {
        previews.push({
          kind: item.kind,
          id: item.id,
          version: row.version,
          targetFunding: item.targetFunding,
          status: "blocked",
          blockedReason,
        });
        continue;
      }
      const currentBucket = this.classifyBucket(row.control_account_code, row.fa_code, row.fa_kind);
      const amt = BigInt(row.gross_minor);
      delta[currentBucket] -= amt;
      delta[target.bucket] += amt;
      previews.push({
        kind: item.kind,
        id: item.id,
        version: row.version,
        targetFunding: item.targetFunding,
        status: "ready",
        beforeAccount: row.control_account_code,
        afterAccount: target.ledgerAccountCode,
        ...(target.financialAccountId
          ? { targetFinancialAccountId: target.financialAccountId }
          : {}),
        grossMinor: row.gross_minor,
      });
    }
  }

  const readyItems = previews
    .filter((p) => p.status === "ready")
    .map((p) => `${p.kind}:${p.id}:${p.version}:${p.targetFunding}`)
    .sort();
  const planHash = createHash("sha256").update(JSON.stringify(readyItems)).digest("hex");

  return {
    planHash,
    summary: {
      total: previews.length,
      readyCount: readyItems.length,
      blockedCount: previews.length - readyItems.length,
      dashboardImpact: {
        ownerDebtDeltaMinor: delta.owner_paid.toString(),
        ownerCustodyDeltaMinor: (-delta.owner_custody_cash).toString(),
        companyCashDeltaMinor: (-delta.company_cash).toString(),
        companyBankDeltaMinor: (-delta.company_bank).toString(),
      },
    },
    items: previews,
  };
}
