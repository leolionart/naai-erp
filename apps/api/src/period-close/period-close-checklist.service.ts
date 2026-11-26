import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import pg from "pg";
import {
  API_VERSION,
  type CloseChecklistItemCodeContract,
  type PeriodCloseChecklistContract,
  type PeriodCloseChecklistItemContract,
  type PeriodCloseChecklistNoteContract,
  type RecordCloseChecklistNoteRequestContract,
} from "@naai-erp/contracts";
import { AGING_STORE, type AgingStore } from "../aging/aging.types.js";
import { FundingPlansService } from "../funding-plans/funding-plans.service.js";
import { MasterDataService } from "../master-data/master-data.service.js";
import type { ActorContext } from "../master-data/master-data.types.js";
import { readLedgerLiquidityAndOwnerSnapshot } from "../operating-dashboard/owner-custody-ledger.js";
import { summarizePaymentEvidenceGaps } from "../payment-evidence/tax-report-enrichment.js";
import { buildNegativeCustodyAlert } from "./period-close-accounts.helper.js";

const READ_ROLES = new Set(["owner", "finance_admin", "accountant", "approver", "viewer"]);
const WRITE_ROLES = new Set(["owner", "finance_admin", "accountant"]);
const VALID_ITEM_CODES = new Set<CloseChecklistItemCodeContract>([
  "unlinked_funding",
  "payment_evidence_gaps",
  "ap_tied",
  "tax_finalization",
  "bank_reconciled",
  "owner_custody_non_negative",
]);

@Injectable()
export class PeriodCloseChecklistService {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  constructor(
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
    @Inject(FundingPlansService) private readonly fundingPlans: FundingPlansService,
    @Inject(AGING_STORE) private readonly aging: AgingStore,
  ) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }

  async listFiscalPeriods(context: ActorContext, fiscalYear?: number) {
    if (!context.roles.some((r) => READ_ROLES.has(r))) throw new Error("FORBIDDEN");
    const res = await this.pool.query<{
      fiscal_year: number;
      period_number: number;
      starts_on: string;
      ends_on: string;
      state: "open" | "soft_locked" | "hard_locked";
    }>(
      `select fiscal_year, period_number, starts_on::text as starts_on, ends_on::text as ends_on, state::text as state
         from fiscal_periods
        where organization_id = $1
          and ($2::int is null or fiscal_year = $2)
        order by fiscal_year desc, period_number asc`,
      [context.organizationId, fiscalYear ?? null],
    );
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: {
        items: res.rows.map((r) => ({
          fiscalYear: r.fiscal_year,
          periodNumber: r.period_number,
          startsOn: r.starts_on,
          endsOn: r.ends_on,
          state: r.state,
        })),
      },
    };
  }

  async evaluateChecklist(
    context: ActorContext,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<PeriodCloseChecklistContract> {
    if (!context.roles.some((r) => READ_ROLES.has(r))) throw new Error("FORBIDDEN");
    if (!Number.isInteger(fiscalYear) || !Number.isInteger(periodNumber) || periodNumber < 1) {
      throw new Error("VALIDATION_FAILED");
    }

    const [orgRes, periodRes, notesRes] = await Promise.all([
      this.pool.query<{ base_currency: string }>(
        `select base_currency from organizations where id = $1`,
        [context.organizationId],
      ),
      this.pool.query<{
        starts_on: string;
        ends_on: string;
        state: "open" | "soft_locked" | "hard_locked";
      }>(
        `select starts_on::text as starts_on, ends_on::text as ends_on, state::text as state
           from fiscal_periods
          where organization_id = $1 and fiscal_year = $2 and period_number = $3`,
        [context.organizationId, fiscalYear, periodNumber],
      ),
      this.pool.query<{
        item_code: CloseChecklistItemCodeContract;
        note: string;
        reason: string;
        noted_by: string;
        updated_at: Date;
      }>(
        `select item_code, note, reason, noted_by, updated_at
           from period_close_checklist_notes
          where organization_id = $1 and fiscal_year = $2 and period_number = $3`,
        [context.organizationId, fiscalYear, periodNumber],
      ),
    ]);

    if (!orgRes.rows[0] || !periodRes.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    const currency = orgRes.rows[0].base_currency;
    const period = periodRes.rows[0];
    const noteMap = new Map<CloseChecklistItemCodeContract, PeriodCloseChecklistNoteContract>();
    for (const n of notesRes.rows) {
      noteMap.set(n.item_code, {
        itemCode: n.item_code,
        note: n.note,
        reason: n.reason,
        notedBy: n.noted_by,
        updatedAt: n.updated_at.toISOString(),
      });
    }

    const [unlinkedRes, paymentGaps, apReport, taxRes, bankRes, liquidity, latestCashCount] =
      await Promise.all([
        this.fundingPlans.listUnlinked(context),
        summarizePaymentEvidenceGaps(
          this.pool,
          context.organizationId,
          period.starts_on,
          period.ends_on,
        ),
        this.aging.report(context.organizationId, "ap", {
          asOf: period.ends_on,
          limit: 100,
          includeSettled: false,
        }),
        this.pool.query<{
          unreviewed_non_gated_count: number;
          payment_gated_count: number;
        }>(
          `with candidate_lines as (
             select l.management_state::text, l.cit_state::text, l.vat_state::text,
                    coalesce(l.payment_evidence_missing, false) as gated
               from expenses e
               join expense_lines l on l.organization_id = e.organization_id and l.expense_id = e.id
              where e.organization_id = $1 and e.state = 'posted'
                and e.expense_date between $2::date and $3::date
             union all
             select l.management_state::text, l.cit_state::text, l.vat_state::text,
                    coalesce(l.payment_evidence_missing, false) as gated
               from commercial_documents d
               join commercial_document_lines l on l.organization_id = d.organization_id and l.document_id = d.id
              where d.organization_id = $1 and d.type = 'purchase_invoice'
                and d.state in ('posted', 'partially_paid', 'paid')
                and d.document_date between $2::date and $3::date
           )
           select
             count(*) filter (
               where (management_state = 'unreviewed' or cit_state = 'unreviewed' or vat_state = 'unreviewed')
                 and not gated
             )::int as unreviewed_non_gated_count,
             count(*) filter (
               where (management_state = 'unreviewed' or cit_state = 'unreviewed' or vat_state = 'unreviewed')
                 and gated
             )::int as payment_gated_count
           from candidate_lines`,
          [context.organizationId, period.starts_on, period.ends_on],
        ),
        this.pool.query<{
          unreconciled_tx_count: number;
          open_exception_count: number;
        }>(
          `select
             (select count(*)::int
                from bank_transactions bt
                join financial_accounts fa
                  on fa.organization_id = bt.organization_id and fa.id = bt.financial_account_id
               where bt.organization_id = $1
                 and fa.kind = 'bank' and fa.status = 'active'
                 and bt.booking_date between $2::date and $3::date
                 and bt.state not in ('reconciled', 'ignored')) as unreconciled_tx_count,
             (select count(*)::int
                from bank_control_exceptions bce
                join bank_statement_sessions bss
                  on bss.organization_id = bce.organization_id and bss.id = bce.session_id
               where bce.organization_id = $1
                 and bce.status = 'pending'
                 and bss.period_start <= $3::date and bss.period_end >= $2::date) as open_exception_count`,
          [context.organizationId, period.starts_on, period.ends_on],
        ),
        readLedgerLiquidityAndOwnerSnapshot(this.pool, context.organizationId, period.ends_on),
        this.pool.query<{
          id: string;
          counted_on: string;
          counted_balance_minor: string;
          difference_minor: string;
        }>(
          `select id, counted_on::text as counted_on, counted_balance_minor::text as counted_balance_minor,
                  difference_minor::text as difference_minor
             from owner_custody_cash_counts
            where organization_id = $1 and counted_on <= $2::date
            order by counted_on desc, created_at desc limit 1`,
          [context.organizationId, period.ends_on],
        ),
      ]);

    const unlinkedData = unlinkedRes.data as {
      items: ReadonlyArray<{ date: string; grossMinor: string }>;
    };
    const unlinkedThroughPeriod = unlinkedData.items.filter((i) => i.date <= period.ends_on);
    const unlinkedGross = unlinkedThroughPeriod.reduce((sum, i) => sum + BigInt(i.grossMinor), 0n);

    const gapCount = paymentGaps.summary.lineCount;
    const gapNote = noteMap.get("payment_evidence_gaps") ?? null;
    const taxRow = taxRes.rows[0] ?? { unreviewed_non_gated_count: 0, payment_gated_count: 0 };
    const bankRow = bankRes.rows[0] ?? { unreconciled_tx_count: 0, open_exception_count: 0 };
    const negativeCustodyAlert = buildNegativeCustodyAlert(liquidity.ownerCashCustodyMinor);

    const items: PeriodCloseChecklistItemContract[] = [
      {
        code: "unlinked_funding",
        label: "Khoản chi chưa xác định nguồn tiền",
        status: unlinkedThroughPeriod.length === 0 ? "passed" : "warning",
        summary:
          unlinkedThroughPeriod.length === 0
            ? "Tất cả khoản chi và hóa đơn mua đã gắn nguồn tiền."
            : `Còn ${unlinkedThroughPeriod.length} khoản chưa gắn tài khoản nguồn tiền.`,
        count: unlinkedThroughPeriod.length,
        amountMinor: unlinkedGross.toString(),
        actionHref: "/expenses",
        note: noteMap.get("unlinked_funding") ?? null,
        details: {
          unlinkedCount: unlinkedThroughPeriod.length,
          unlinkedGrossMinor: unlinkedGross.toString(),
          endpoint: `/api/v1/organizations/${context.organizationId}/funding-plans/unlinked`,
        },
      },
      {
        code: "payment_evidence_gaps",
        label: "Bằng chứng thanh toán không dùng tiền mặt",
        status: gapCount === 0 ? "passed" : gapNote ? "noted" : "warning",
        summary:
          gapCount === 0
            ? "Không có khoản chi thiếu chứng từ thanh toán không dùng tiền mặt."
            : gapNote
              ? `${gapCount} khoản thiếu bằng chứng đã được ghi chú khi đóng kỳ.`
              : `Còn ${gapCount} khoản từ ngưỡng thanh toán chưa có chứng từ không dùng tiền mặt hoặc ghi chú.`,
        count: gapCount,
        amountMinor: paymentGaps.summary.withheldVatMinor,
        actionHref: "/reports/tax/vat-reconciliation/current",
        note: gapNote,
        details: {
          lineCount: gapCount,
          withheldVatMinor: paymentGaps.summary.withheldVatMinor,
          withheldCitMinor: paymentGaps.summary.withheldCitMinor,
        },
      },
      {
        code: "ap_tied",
        label: "Đối chiếu công nợ phải trả nhà cung cấp (TK 331)",
        status: apReport.tieStatus === "tied" ? "passed" : "warning",
        summary:
          apReport.tieStatus === "tied"
            ? "Số dư sổ cái TK 331 khớp hoàn toàn với chi tiết công nợ phải trả."
            : `Sổ cái TK 331 lệch ${apReport.controlTies[0]?.differenceMinor ?? "0"} so với chi tiết AP aging.`,
        amountMinor: apReport.controlTies[0]?.differenceMinor ?? "0",
        actionHref: "/payables",
        note: noteMap.get("ap_tied") ?? null,
        details: {
          tieStatus: apReport.tieStatus,
          controlLedgerBalanceMinor: apReport.controlTies[0]?.ledgerBalanceMinor ?? "0",
          outstandingTotalMinor: apReport.outstandingTotalMinor,
          varianceMinor: apReport.controlTies[0]?.differenceMinor ?? "0",
        },
      },
      {
        code: "tax_finalization",
        label: "Hoàn tất rà soát thuế (CIT / VAT)",
        status: taxRow.unreviewed_non_gated_count === 0 ? "passed" : "warning",
        summary:
          taxRow.unreviewed_non_gated_count === 0
            ? "Tất cả dòng chi phí và hóa đơn đủ điều kiện trong kỳ đã được rà soát thuế."
            : `Còn ${taxRow.unreviewed_non_gated_count} dòng chi phí/hóa đơn chưa hoàn tất rà soát thuế.`,
        count: taxRow.unreviewed_non_gated_count,
        actionHref: "/reports/tax/expense-exceptions",
        note: noteMap.get("tax_finalization") ?? null,
        details: {
          unreviewedNonGatedCount: taxRow.unreviewed_non_gated_count,
          paymentGatedUnreviewedCount: taxRow.payment_gated_count,
        },
      },
      {
        code: "bank_reconciled",
        label: "Đối soát giao dịch ngân hàng",
        status:
          bankRow.unreconciled_tx_count === 0 && bankRow.open_exception_count === 0
            ? "passed"
            : "warning",
        summary:
          bankRow.unreconciled_tx_count === 0 && bankRow.open_exception_count === 0
            ? "Mọi giao dịch ngân hàng trong kỳ đã được đối soát."
            : `Còn ${bankRow.unreconciled_tx_count} giao dịch ngân hàng chưa đối soát và ${bankRow.open_exception_count} ngoại lệ sao kê mở.`,
        count: bankRow.unreconciled_tx_count + bankRow.open_exception_count,
        actionHref: "/banking",
        note: noteMap.get("bank_reconciled") ?? null,
        details: {
          unreconciledTransactionCount: bankRow.unreconciled_tx_count,
          openStatementExceptionCount: bankRow.open_exception_count,
        },
      },
      {
        code: "owner_custody_non_negative",
        label: "Quỹ tiền mặt do chủ giữ (111-OWNER-CUSTODY) không âm",
        status: liquidity.ownerCashCustodyMinor >= 0n ? "passed" : "warning",
        summary:
          liquidity.ownerCashCustodyMinor >= 0n
            ? `Số dư 111-OWNER-CUSTODY không âm (${liquidity.ownerCashCustodyMinor.toString()} ${currency}).`
            : negativeCustodyAlert!.message,
        amountMinor: liquidity.ownerCashCustodyMinor.toString(),
        actionHref: "/expenses",
        note: noteMap.get("owner_custody_non_negative") ?? null,
        details: {
          ownerCashCustodyMinor: liquidity.ownerCashCustodyMinor.toString(),
          suggestedTargetFunding: liquidity.ownerCashCustodyMinor < 0n ? "owner_paid" : null,
          latestCashCount: latestCashCount.rows[0] ?? null,
        },
      },
    ];

    const warnings = items.filter((i) => i.status === "warning").map((i) => i.code);
    return {
      schemaVersion: 1,
      fiscalYear,
      periodNumber,
      startsOn: period.starts_on,
      endsOn: period.ends_on,
      periodState: period.state,
      currency,
      readyWithoutWarnings: warnings.length === 0,
      canCloseWithReason: period.state !== "hard_locked",
      warningCount: warnings.length,
      items,
      warnings,
      negativeCustodyAlert,
    };
  }

  async getCloseChecklist(context: ActorContext, fiscalYear: number, periodNumber: number) {
    const data = await this.evaluateChecklist(context, fiscalYear, periodNumber);
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  async recordChecklistNote(
    context: ActorContext,
    fiscalYear: number,
    periodNumber: number,
    input: RecordCloseChecklistNoteRequestContract,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((r) => WRITE_ROLES.has(r))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (
      !Number.isInteger(fiscalYear) ||
      !Number.isInteger(periodNumber) ||
      !VALID_ITEM_CODES.has(input.itemCode) ||
      !input.note?.trim() ||
      !input.reason?.trim()
    ) {
      throw new Error("VALIDATION_FAILED");
    }

    const canonical = {
      fiscalYear,
      periodNumber,
      itemCode: input.itemCode,
      note: input.note.trim(),
      reason: input.reason.trim(),
    };
    const requestHash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${context.organizationId}:${idempotencyKey}`,
      ]);
      const replay = await client.query<{
        request_hash: string;
        response_body: Record<string, unknown>;
      }>(
        `select request_hash, response_body from api_idempotency_records
          where organization_id = $1 and idempotency_key = $2 for update`,
        [context.organizationId, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return {
          apiVersion: API_VERSION,
          requestId: context.correlationId,
          organizationId: context.organizationId,
          data: { ...replay.rows[0].response_body, idempotencyReplayed: true },
        };
      }

      const periodCheck = await client.query(
        `select 1 from fiscal_periods
          where organization_id = $1 and fiscal_year = $2 and period_number = $3`,
        [context.organizationId, fiscalYear, periodNumber],
      );
      if (!periodCheck.rows[0]) throw new Error("RESOURCE_NOT_FOUND");

      await client.query(
        `insert into period_close_checklist_notes
           (organization_id, fiscal_year, period_number, item_code, note, reason, noted_by, correlation_id, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now())
         on conflict (organization_id, fiscal_year, period_number, item_code)
         do update set
           note = excluded.note,
           reason = excluded.reason,
           noted_by = excluded.noted_by,
           correlation_id = excluded.correlation_id,
           updated_at = now()`,
        [
          context.organizationId,
          fiscalYear,
          periodNumber,
          canonical.itemCode,
          canonical.note,
          canonical.reason,
          context.actorId,
          context.correlationId,
        ],
      );

      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      const resourceKey = `${fiscalYear}:${periodNumber}:${canonical.itemCode}`;
      await client.query(
        `insert into resource_audit_events
           (organization_id, id, resource_type, resource_key, resource_version, action, actor_id, correlation_id, before_state, after_state)
         values ($1, $2, 'period_close_checklist_note', $3, '1', 'upsert', $4, $5, null, $6)`,
        [
          context.organizationId,
          auditEventId,
          resourceKey,
          context.actorId,
          context.correlationId,
          canonical,
        ],
      );
      await client.query(
        `insert into outbox_events
           (organization_id, id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id)
         values ($1, $2, 'period_close_checklist_note', $3, 'period_close_checklist.noted', 1, $4, $5)`,
        [context.organizationId, outboxEventId, resourceKey, canonical, context.correlationId],
      );
      await client.query("commit");

      const checklist = await this.evaluateChecklist(context, fiscalYear, periodNumber);
      const responseBody = {
        checklist,
        auditEventId,
        outboxEventId,
        resourceVersion: "1",
      };
      await this.pool.query(
        `insert into api_idempotency_records
           (organization_id, idempotency_key, operation, request_hash, response_body)
         values ($1, $2, 'period-close:checklist-note', $3, $4)
         on conflict (organization_id, idempotency_key) do nothing`,
        [context.organizationId, idempotencyKey, requestHash, responseBody],
      );

      return {
        apiVersion: API_VERSION,
        requestId: context.correlationId,
        organizationId: context.organizationId,
        data: { ...responseBody, idempotencyReplayed: false },
      };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
