import { randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import pg from "pg";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import { ExpenseService } from "../expenses/expense.service.js";
import { CommercialDocumentService } from "../commercial-documents/commercial-document.service.js";
import { FundingRulesService } from "../funding-rules/funding-rules.service.js";
import {
  type FundingPlanCommitRequest,
  type FundingPlanDryRunRequest,
  type FundingPlanExportRow,
} from "./funding-plans.types.js";
import { classifyFundingBucket, formatFundingPlanCsv } from "./funding-plans.helpers.js";
import {
  type Context,
  READ_ROLES,
  type ResolvedTarget,
  WRITE_ROLES,
} from "./funding-plans.service.shared.js";
import { evaluatePlanOperation } from "./funding-plans-service-evaluate-plan.operation.js";
import { listUnlinkedOperation } from "./funding-plans-service-list-unlinked.operation.js";

@Injectable()
export class FundingPlansService {
  readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  constructor(
    @Inject(MasterDataService) readonly masterData: MasterDataService,
    @Inject(ExpenseService) readonly expenses: ExpenseService,
    @Inject(CommercialDocumentService) readonly documents: CommercialDocumentService,
    @Optional() @Inject(FundingRulesService) readonly fundingRules?: FundingRulesService,
  ) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }

  envelope(context: Context, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  classifyBucket(
    accountCode: string,
    financialAccountCode: string | null,
    financialKind: string | null,
  ) {
    return classifyFundingBucket(accountCode, financialAccountCode, financialKind);
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

  async resolveTarget(
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

  evaluatePlan = evaluatePlanOperation;

  async dryRun(context: Context, body: FundingPlanDryRunRequest) {
    if (!context.roles.some((r) => READ_ROLES.has(r))) throw new Error("FORBIDDEN");
    return this.envelope(context, await this.evaluatePlan(context.organizationId, body.items));
  }

  listUnlinked = listUnlinkedOperation;

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
