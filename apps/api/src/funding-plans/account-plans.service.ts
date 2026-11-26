import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import pg from "pg";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import { ExpenseService } from "../expenses/expense.service.js";
import { CommercialDocumentService } from "../commercial-documents/commercial-document.service.js";
import { FUNDING_PLAN_MAX_ITEMS } from "./funding-plans.types.js";

const READ_ROLES = new Set(["owner", "finance_admin", "accountant", "approver", "viewer"]);
const WRITE_ROLES = new Set(["owner", "finance_admin"]);

type Context = Readonly<{
  organizationId: string;
  actorId: string;
  roles: readonly string[];
  correlationId: string;
}>;

export type AccountPlanLinePatch = Readonly<{
  lineNumber: number;
  accountCode?: string;
  categoryCode?: string;
}>;

export type AccountPlanItemInput = Readonly<{
  kind: "expense" | "purchase_invoice" | "sales_invoice";
  id: string;
  lines: readonly AccountPlanLinePatch[];
  reason?: string;
}>;

@Injectable()
export class AccountPlansService {
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

  private async evaluate(organizationId: string, items: readonly AccountPlanItemInput[]) {
    if (!Array.isArray(items) || items.length === 0 || items.length > FUNDING_PLAN_MAX_ITEMS) {
      throw new Error("VALIDATION_FAILED");
    }

    const previews: Array<{
      kind: AccountPlanItemInput["kind"];
      id: string;
      version: string;
      status: "ready" | "blocked";
      blockedReason?: string;
      lines: readonly AccountPlanLinePatch[];
    }> = [];

    for (const item of items) {
      if (!Array.isArray(item.lines) || item.lines.length === 0) {
        previews.push({
          kind: item.kind,
          id: item.id,
          version: "0",
          status: "blocked",
          blockedReason: "INVALID_LINES",
          lines: [],
        });
        continue;
      }

      const allowedRoots =
        item.kind === "sales_invoice" ? ["revenue", "income", "liability"] : ["expense", "asset"];
      let invalidAccount = false;
      for (const patch of item.lines) {
        if (patch.accountCode) {
          const acct = await this.pool.query<{ root_type: string; is_active: boolean }>(
            `select root_type::text,is_active from accounts where organization_id=$1 and code=$2`,
            [organizationId, patch.accountCode.trim()],
          );
          const row = acct.rows[0];
          if (!row?.is_active || !allowedRoots.includes(row.root_type)) {
            invalidAccount = true;
            break;
          }
        }
      }
      if (invalidAccount) {
        previews.push({
          kind: item.kind,
          id: item.id,
          version: "0",
          status: "blocked",
          blockedReason: "INVALID_TARGET_ACCOUNT",
          lines: item.lines,
        });
        continue;
      }

      if (item.kind === "expense") {
        const res = await this.pool.query<{
          state: string;
          version: string;
          reconciled: boolean;
          period_state: string | null;
        }>(
          `select e.state::text, e.version::text,
                  exists(select 1 from reconciliation_allocations ra where ra.organization_id=e.organization_id and ra.expense_id=e.id) as reconciled,
                  (select fp.state::text from fiscal_periods fp
                    where fp.organization_id=e.organization_id
                      and e.expense_date >= fp.starts_on and e.expense_date <= fp.ends_on limit 1) as period_state
             from expenses e where e.organization_id=$1 and e.id=$2`,
          [organizationId, item.id],
        );
        const row = res.rows[0];
        if (!row) {
          previews.push({
            kind: item.kind,
            id: item.id,
            version: "0",
            status: "blocked",
            blockedReason: "NOT_FOUND",
            lines: item.lines,
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
        previews.push({
          kind: item.kind,
          id: item.id,
          version: row.version,
          status: blockedReason ? "blocked" : "ready",
          ...(blockedReason ? { blockedReason } : {}),
          lines: item.lines,
        });
      } else {
        const res = await this.pool.query<{
          type: string;
          state: string;
          version: string;
          reconciled: boolean;
          period_state: string | null;
        }>(
          `select d.type::text, d.state::text, d.version::text,
                  exists(select 1 from reconciliation_allocations ra where ra.organization_id=d.organization_id and ra.commercial_document_id=d.id) as reconciled,
                  (select fp.state::text from fiscal_periods fp
                    where fp.organization_id=d.organization_id
                      and d.document_date >= fp.starts_on and d.document_date <= fp.ends_on limit 1) as period_state
             from commercial_documents d where d.organization_id=$1 and d.id=$2`,
          [organizationId, item.id],
        );
        const row = res.rows[0];
        if (!row || row.type !== item.kind) {
          previews.push({
            kind: item.kind,
            id: item.id,
            version: "0",
            status: "blocked",
            blockedReason: "NOT_FOUND",
            lines: item.lines,
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
        previews.push({
          kind: item.kind,
          id: item.id,
          version: row.version,
          status: blockedReason ? "blocked" : "ready",
          ...(blockedReason ? { blockedReason } : {}),
          lines: item.lines,
        });
      }
    }

    const readySig = previews
      .filter((p) => p.status === "ready")
      .map((p) => `${p.kind}:${p.id}:${p.version}:${JSON.stringify(p.lines)}`)
      .sort();
    const planHash = createHash("sha256").update(JSON.stringify(readySig)).digest("hex");

    return {
      planHash,
      summary: {
        total: previews.length,
        readyCount: readySig.length,
        blockedCount: previews.length - readySig.length,
      },
      items: previews,
    };
  }

  async dryRun(context: Context, body: { items: readonly AccountPlanItemInput[] }) {
    if (!context.roles.some((r) => READ_ROLES.has(r))) throw new Error("FORBIDDEN");
    return this.envelope(context, await this.evaluate(context.organizationId, body.items));
  }

  async commit(
    context: Context,
    body: {
      planHash: string;
      items: readonly AccountPlanItemInput[];
      reason?: string;
      postReplacement?: boolean;
    },
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((r) => WRITE_ROLES.has(r))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!body.planHash?.trim()) throw new Error("VALIDATION_FAILED");

    const plan = await this.evaluate(context.organizationId, body.items);
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
        rawItem?.reason?.trim() || body.reason?.trim() || "Bulk account plan reclassification";
      const rowKey = `${idempotencyKey}:${preview.kind}:${preview.id}`;
      try {
        if (preview.kind === "expense") {
          const res = await this.expenses.reclassifyAccounts(
            context,
            preview.id,
            preview.version,
            {
              lines: preview.lines.map((l) => ({
                lineNumber: l.lineNumber,
                ...(l.accountCode ? { postingAccountCode: l.accountCode } : {}),
                ...(l.categoryCode ? { categoryCode: l.categoryCode } : {}),
              })),
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
          const res = await this.documents.reclassifyAccounts(
            context,
            preview.id,
            preview.version,
            {
              lines: preview.lines.map((l) => ({
                lineNumber: l.lineNumber,
                ...(l.accountCode ? { primaryAccountCode: l.accountCode } : {}),
                ...(l.categoryCode ? { categoryCode: l.categoryCode } : {}),
              })),
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
       values($1,$2,'account_plan',$3,'1','commit',$4,$5,$6)`,
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
