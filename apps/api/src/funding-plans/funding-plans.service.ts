import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import pg from "pg";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import { ExpenseService } from "../expenses/expense.service.js";
import { CommercialDocumentService } from "../commercial-documents/commercial-document.service.js";
import {
  FUNDING_PLAN_MAX_ITEMS,
  type FundingPlanCommitRequest,
  type FundingPlanDryRunRequest,
  type FundingPlanExportRow,
  type FundingPlanItemInput,
  type FundingPlanPreviewItem,
} from "./funding-plans.types.js";

const READ_ROLES = new Set(["owner", "finance_admin", "accountant", "approver", "viewer"]);
const WRITE_ROLES = new Set(["owner", "finance_admin"]);

type Context = Readonly<{
  organizationId: string;
  actorId: string;
  roles: readonly string[];
  correlationId: string;
}>;

type ResolvedTarget = Readonly<{
  bucket: "owner_paid" | "owner_custody_cash" | "company_cash" | "company_bank";
  financialAccountId?: string;
  ledgerAccountCode: string;
}>;

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function formatFundingPlanCsv(rows: readonly FundingPlanExportRow[]): string {
  const header = [
    "kind",
    "id",
    "externalId",
    "date",
    "payee",
    "description",
    "grossMinor",
    "currentFunding",
    "currentAccount",
    "targetFunding",
  ].join(",");
  const lines = rows.map((r) =>
    [
      r.kind,
      r.id,
      r.externalId,
      r.date,
      r.payee,
      r.description,
      r.grossMinor,
      r.currentFunding,
      r.currentAccount,
      r.targetFunding,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header, ...lines].join("\n");
}

@Injectable()
export class FundingPlansService {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  constructor(
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
    @Inject(ExpenseService) private readonly expenses: ExpenseService,
    @Inject(CommercialDocumentService) private readonly documents: CommercialDocumentService,
  ) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }

  private envelope(context: Context, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  private classifyBucket(
    accountCode: string,
    financialAccountCode: string | null,
    financialKind: string | null,
  ): "owner_paid" | "owner_custody_cash" | "company_cash" | "company_bank" {
    if (financialAccountCode === "CASH-OWNER-CUSTODY") return "owner_custody_cash";
    if (financialKind === "cash") return "company_cash";
    if (financialKind === "bank" || accountCode.startsWith("112")) return "company_bank";
    if (accountCode.startsWith("111")) return "company_cash";
    return "owner_paid";
  }

  async exportPlan(context: Context, filters: { from?: string; to?: string; format?: string }) {
    if (!context.roles.some((r) => READ_ROLES.has(r))) throw new Error("FORBIDDEN");
    const from = filters.from?.trim() || "1900-01-01";
    const to = filters.to?.trim() || "2999-12-31";
    const [expRes, docRes] = await Promise.all([
      this.pool.query<{
        id: string;
        external_id: string | null;
        dt: string;
        payee: string | null;
        description: string;
        gross_minor: string;
        counter_account_code: string;
        fa_code: string | null;
        fa_kind: string | null;
      }>(
        `select e.id, er.external_id, e.expense_date::text as dt,
                coalesce(p.display_name, e.payee_party_id, '') as payee,
                e.business_purpose as description, e.gross_minor::text,
                e.counter_account_code, fa.code as fa_code, fa.kind::text as fa_kind
           from expenses e
           left join parties p on p.organization_id=e.organization_id and p.id=e.payee_party_id
           left join financial_accounts fa on fa.organization_id=e.organization_id and fa.id=e.funding_financial_account_id
           left join external_references er on er.organization_id=e.organization_id and er.expense_id=e.id
          where e.organization_id=$1 and e.state='posted'
            and e.expense_date >= $2::date and e.expense_date <= $3::date
          order by e.expense_date asc, e.id asc`,
        [context.organizationId, from, to],
      ),
      this.pool.query<{
        id: string;
        external_id: string | null;
        dt: string;
        payee: string | null;
        description: string;
        gross_minor: string;
        control_account_code: string;
        fa_code: string | null;
        fa_kind: string | null;
      }>(
        `select d.id, er.external_id, d.document_date::text as dt,
                coalesce(p.display_name, d.party_id, '') as payee,
                d.document_number as description, d.gross_minor::text,
                d.control_account_code, fa.code as fa_code, fa.kind::text as fa_kind
           from commercial_documents d
           left join parties p on p.organization_id=d.organization_id and p.id=d.party_id
           left join financial_accounts fa on fa.organization_id=d.organization_id and fa.id=d.funding_financial_account_id
           left join external_references er on er.organization_id=d.organization_id and er.document_id=d.id
          where d.organization_id=$1 and d.type='purchase_invoice'
            and d.state in ('posted','issued')
            and d.document_date >= $2::date and d.document_date <= $3::date
          order by d.document_date asc, d.id asc`,
        [context.organizationId, from, to],
      ),
    ]);

    const rows: FundingPlanExportRow[] = [
      ...expRes.rows.map((r) => ({
        kind: "expense" as const,
        id: r.id,
        externalId: r.external_id ?? "",
        date: r.dt,
        payee: r.payee ?? "",
        description: r.description,
        grossMinor: r.gross_minor,
        currentFunding: this.classifyBucket(r.counter_account_code, r.fa_code, r.fa_kind),
        currentAccount: r.fa_code
          ? `${r.counter_account_code} (${r.fa_code})`
          : r.counter_account_code,
        targetFunding: "",
      })),
      ...docRes.rows.map((r) => ({
        kind: "purchase_invoice" as const,
        id: r.id,
        externalId: r.external_id ?? "",
        date: r.dt,
        payee: r.payee ?? "",
        description: r.description,
        grossMinor: r.gross_minor,
        currentFunding: this.classifyBucket(r.control_account_code, r.fa_code, r.fa_kind),
        currentAccount: r.fa_code
          ? `${r.control_account_code} (${r.fa_code})`
          : r.control_account_code,
        targetFunding: "",
      })),
    ];

    if (filters.format === "csv") {
      return this.envelope(context, { format: "csv", csv: formatFundingPlanCsv(rows), rows });
    }
    return this.envelope(context, { format: "json", rows });
  }

  private async resolveTarget(
    organizationId: string,
    targetFunding: string,
    ownerCurrentCode: string | null,
  ): Promise<ResolvedTarget | undefined> {
    const raw = targetFunding.trim();
    if (!raw) return undefined;
    if (raw === "owner_paid") {
      return {
        bucket: "owner_paid",
        ledgerAccountCode: ownerCurrentCode ?? "3388-OWNER",
      };
    }
    const [kind, explicitRef] = raw.split(":", 2);
    if (kind === "owner_custody_cash") {
      const fa = await this.pool.query<{ id: string; ledger_account_code: string }>(
        `select id,ledger_account_code from financial_accounts
          where organization_id=$1 and status='active' and (id=$2 or code=$2)
          limit 1`,
        [organizationId, explicitRef?.trim() || "CASH-OWNER-CUSTODY"],
      );
      if (!fa.rows[0]) return undefined;
      return {
        bucket: "owner_custody_cash",
        financialAccountId: fa.rows[0].id,
        ledgerAccountCode: fa.rows[0].ledger_account_code,
      };
    }
    if (kind === "company_cash") {
      const fa = await this.pool.query<{ id: string; ledger_account_code: string }>(
        `select id,ledger_account_code from financial_accounts
          where organization_id=$1 and status='active' and kind='cash'
            and ($2::text is null and code <> 'CASH-OWNER-CUSTODY' or id=$2 or code=$2)
          order by created_at asc limit 1`,
        [organizationId, explicitRef?.trim() || null],
      );
      if (!fa.rows[0]) return undefined;
      return {
        bucket: "company_cash",
        financialAccountId: fa.rows[0].id,
        ledgerAccountCode: fa.rows[0].ledger_account_code,
      };
    }
    if (kind === "company_bank") {
      const fa = await this.pool.query<{ id: string; ledger_account_code: string }>(
        `select id,ledger_account_code from financial_accounts
          where organization_id=$1 and status='active' and kind='bank'
            and ($2::text is null or id=$2 or code=$2)
          order by created_at asc limit 1`,
        [organizationId, explicitRef?.trim() || null],
      );
      if (!fa.rows[0]) return undefined;
      return {
        bucket: "company_bank",
        financialAccountId: fa.rows[0].id,
        ledgerAccountCode: fa.rows[0].ledger_account_code,
      };
    }
    return undefined;
  }

  private async evaluatePlan(organizationId: string, items: readonly FundingPlanItemInput[]) {
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
        const currentBucket = this.classifyBucket(
          row.counter_account_code,
          row.fa_code,
          row.fa_kind,
        );
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
        const currentBucket = this.classifyBucket(
          row.control_account_code,
          row.fa_code,
          row.fa_kind,
        );
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

  async dryRun(context: Context, body: FundingPlanDryRunRequest) {
    if (!context.roles.some((r) => READ_ROLES.has(r))) throw new Error("FORBIDDEN");
    return this.envelope(context, await this.evaluatePlan(context.organizationId, body.items));
  }

  async commit(context: Context, body: FundingPlanCommitRequest, idempotencyKey?: string) {
    if (!context.roles.some((r) => WRITE_ROLES.has(r))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!body.planHash?.trim()) throw new Error("VALIDATION_FAILED");

    const plan = await this.evaluatePlan(context.organizationId, body.items);
    if (plan.planHash !== body.planHash.trim()) {
      throw new Error("FUNDING_PLAN_HASH_MISMATCH");
    }

    const results: Array<{
      kind: string;
      id: string;
      status: "succeeded" | "blocked" | "failed";
      reason?: string;
      replacementId?: string;
      replacementState?: string;
    }> = [];

    for (let i = 0; i < plan.items.length; i++) {
      const preview = plan.items[i]!;
      const rawItem = body.items[i];
      if (preview.status === "blocked") {
        results.push({
          kind: preview.kind,
          id: preview.id,
          status: "blocked",
          ...(preview.blockedReason ? { reason: preview.blockedReason } : {}),
        });
        continue;
      }
      const reason =
        rawItem?.reason?.trim() || body.reason?.trim() || "Bulk funding plan reclassification";
      const rowKey = `${idempotencyKey}:${preview.kind}:${preview.id}:${preview.targetFunding}`;
      try {
        if (preview.kind === "expense") {
          const res = await this.expenses.reclassifyFunding(
            context,
            preview.id,
            preview.version,
            {
              ...(preview.targetFinancialAccountId
                ? { financialAccountId: preview.targetFinancialAccountId }
                : { counterAccountCode: preview.afterAccount! }),
              ...(body.postReplacement !== undefined
                ? { postReplacement: body.postReplacement }
                : {}),
              reason,
            },
            rowKey,
          );
          const data = res.data as { replacementExpenseId?: string; replacementState?: string };
          results.push({
            kind: preview.kind,
            id: preview.id,
            status: "succeeded",
            ...(data.replacementExpenseId ? { replacementId: data.replacementExpenseId } : {}),
            ...(data.replacementState ? { replacementState: data.replacementState } : {}),
          });
        } else {
          const res = await this.documents.reclassifyFunding(
            context,
            preview.id,
            preview.version,
            {
              ...(preview.targetFinancialAccountId
                ? { financialAccountId: preview.targetFinancialAccountId }
                : { targetControlAccountCode: preview.afterAccount! }),
              ...(body.postReplacement !== undefined
                ? { postReplacement: body.postReplacement }
                : {}),
              reason,
            },
            rowKey,
          );
          const data = res.data as { replacementDocumentId?: string; replacementState?: string };
          results.push({
            kind: preview.kind,
            id: preview.id,
            status: "succeeded",
            ...(data.replacementDocumentId ? { replacementId: data.replacementDocumentId } : {}),
            ...(data.replacementState ? { replacementState: data.replacementState } : {}),
          });
        }
      } catch (err) {
        results.push({
          kind: preview.kind,
          id: preview.id,
          status: "failed",
          reason: err instanceof Error ? err.message : "UNKNOWN_ERROR",
        });
      }
    }

    await this.pool.query(
      `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
       values($1,$2,'funding_plan',$3,'1','commit',$4,$5,$6)`,
      [
        context.organizationId,
        randomUUID(),
        plan.planHash,
        context.actorId,
        context.correlationId,
        {
          total: results.length,
          succeeded: results.filter((r) => r.status === "succeeded").length,
          blocked: results.filter((r) => r.status === "blocked").length,
          failed: results.filter((r) => r.status === "failed").length,
        },
      ],
    );

    return this.envelope(context, {
      planHash: plan.planHash,
      summary: {
        total: results.length,
        succeeded: results.filter((r) => r.status === "succeeded").length,
        blocked: results.filter((r) => r.status === "blocked").length,
        failed: results.filter((r) => r.status === "failed").length,
      },
      results,
    });
  }
}
