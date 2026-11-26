import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import pg from "pg";
import {
  API_VERSION,
  type ExecuteOwnerSettlementRequestContract,
  type OwnerRepaymentDirectionContract,
  type OwnerSettlementOptionContract,
  type OwnerYearEndPositionReportContract,
  type OwnerYearEndSettlementRecordContract,
} from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import type { ActorContext } from "../master-data/master-data.types.js";
import {
  assertClosePostingPeriodAllowed,
  buildNegativeCustodyAlert,
  resolveOwnerPositionSnapshot,
} from "./period-close-accounts.helper.js";

const READ_ROLES = new Set(["owner", "finance_admin", "accountant", "approver", "viewer"]);
const WRITE_ROLES = new Set(["owner", "finance_admin"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const POS_INT = /^[1-9]\d*$/;

type SettlementRow = {
  id: string;
  fiscal_year: number;
  effective_on: string;
  settlement_option: OwnerSettlementOptionContract;
  repayment_direction: OwnerRepaymentDirectionContract | null;
  amount_minor: string;
  currency: string;
  debit_account_code: string;
  credit_account_code: string;
  financial_account_id: string | null;
  bank_transaction_id: string | null;
  journal_id: string;
  before_payable_3388_minor: string;
  before_receivable_1388_minor: string;
  before_custody_111_minor: string;
  after_payable_3388_minor: string;
  after_receivable_1388_minor: string;
  after_custody_111_minor: string;
  reference: string | null;
  description: string;
  reason: string;
  created_by: string;
  created_at: Date;
};

function mapSettlementRow(row: SettlementRow): OwnerYearEndSettlementRecordContract {
  return {
    id: row.id,
    fiscalYear: row.fiscal_year,
    effectiveOn: row.effective_on,
    option: row.settlement_option,
    repaymentDirection: row.repayment_direction,
    amountMinor: row.amount_minor,
    currency: row.currency,
    debitAccountCode: row.debit_account_code,
    creditAccountCode: row.credit_account_code,
    financialAccountId: row.financial_account_id,
    bankTransactionId: row.bank_transaction_id,
    journalId: row.journal_id,
    beforePayable3388Minor: row.before_payable_3388_minor,
    beforeReceivable1388Minor: row.before_receivable_1388_minor,
    beforeCustody111Minor: row.before_custody_111_minor,
    afterPayable3388Minor: row.after_payable_3388_minor,
    afterReceivable1388Minor: row.after_receivable_1388_minor,
    afterCustody111Minor: row.after_custody_111_minor,
    reference: row.reference,
    description: row.description,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

@Injectable()
export class OwnerSettlementService {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  constructor(@Inject(MasterDataService) private readonly masterData: MasterDataService) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }

  async getPosition(context: ActorContext, query: { fiscalYear?: number; asOf?: string }) {
    if (!context.roles.some((r) => READ_ROLES.has(r))) throw new Error("FORBIDDEN");
    const nowYear = Number(new Date().toISOString().slice(0, 4));
    const asOfTrimmed = query.asOf?.trim();
    const fiscalYear =
      query.fiscalYear ??
      (asOfTrimmed && ISO_DATE.test(asOfTrimmed) ? Number(asOfTrimmed.slice(0, 4)) : nowYear);
    if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2999) {
      throw new Error("VALIDATION_FAILED");
    }
    const asOf = asOfTrimmed && ISO_DATE.test(asOfTrimmed) ? asOfTrimmed : `${fiscalYear}-12-31`;

    const [pos, settlementsRes] = await Promise.all([
      resolveOwnerPositionSnapshot(this.pool, context.organizationId, asOf),
      this.pool.query<SettlementRow>(
        `select id, fiscal_year, effective_on::text as effective_on, settlement_option,
                repayment_direction, amount_minor::text as amount_minor, currency,
                debit_account_code, credit_account_code, financial_account_id, bank_transaction_id,
                journal_id,
                before_payable_3388_minor::text as before_payable_3388_minor,
                before_receivable_1388_minor::text as before_receivable_1388_minor,
                before_custody_111_minor::text as before_custody_111_minor,
                after_payable_3388_minor::text as after_payable_3388_minor,
                after_receivable_1388_minor::text as after_receivable_1388_minor,
                after_custody_111_minor::text as after_custody_111_minor,
                reference, description, reason, created_by, created_at
           from owner_year_end_settlements
          where organization_id = $1 and fiscal_year = $2
          order by effective_on desc, created_at desc, id desc`,
        [context.organizationId, fiscalYear],
      ),
    ]);

    const maxOffset =
      pos.payable3388Minor < pos.receivable1388Minor
        ? pos.payable3388Minor
        : pos.receivable1388Minor;
    const maxRepayment =
      pos.payable3388Minor > pos.receivable1388Minor
        ? pos.payable3388Minor
        : pos.receivable1388Minor;

    const report: OwnerYearEndPositionReportContract = {
      schemaVersion: 1,
      fiscalYear,
      asOf,
      currency: pos.currency,
      payable3388AccountCode: pos.payable3388AccountCode,
      receivable1388AccountCode: pos.receivable1388AccountCode,
      custody111AccountCode: pos.custody111AccountCode,
      retainedEarnings421AccountCode: pos.retainedEarnings421AccountCode,
      payable3388Minor: pos.payable3388Minor.toString(),
      receivable1388Minor: pos.receivable1388Minor.toString(),
      ownerCustody111Minor: pos.ownerCustody111Minor.toString(),
      retainedEarnings421Minor: pos.retainedEarnings421Minor.toString(),
      unclosedProfitMinor: pos.unclosedProfitMinor.toString(),
      netOwnerPositionMinor: pos.netOwnerPositionMinor.toString(),
      negativeCustodyAlert: buildNegativeCustodyAlert(
        pos.ownerCustody111Minor,
        pos.custody111AccountCode,
      ),
      options: [
        {
          option: "repayment",
          label: "Hoàn tiền qua tài khoản công ty (3388 hoặc 1388)",
          available: maxRepayment > 0n,
          maxEligibleMinor: maxRepayment.toString(),
          debitAccountPreview:
            pos.payable3388Minor >= pos.receivable1388Minor
              ? pos.payable3388AccountCode
              : "112 / 111-CASH",
          creditAccountPreview:
            pos.payable3388Minor >= pos.receivable1388Minor
              ? "112 / 111-CASH"
              : pos.receivable1388AccountCode,
          description:
            "Công ty hoàn trả nợ chủ (Nợ 3388 / Có 112-111) hoặc chủ hoàn tiền phải thu về công ty (Nợ 112-111 / Có 1388).",
        },
        {
          option: "offset_3388_1388",
          label: "Cấn trừ phải trả chủ (3388) với phải thu chủ (1388)",
          available: maxOffset > 0n,
          maxEligibleMinor: maxOffset.toString(),
          debitAccountPreview: pos.payable3388AccountCode,
          creditAccountPreview: pos.receivable1388AccountCode,
          description:
            "Bù trừ hai chiều giữa số công ty nợ chủ (3388) và số chủ nợ công ty (1388) bằng bút toán có kiểm toán.",
        },
        {
          option: "profit_distribution",
          label: "Chủ quyết định chia lợi nhuận giải quyết phải thu (Nợ 421 / Có 1388)",
          available: pos.receivable1388Minor > 0n,
          maxEligibleMinor: pos.receivable1388Minor.toString(),
          debitAccountPreview: pos.retainedEarnings421AccountCode,
          creditAccountPreview: pos.receivable1388AccountCode,
          description:
            "Chủ doanh nghiệp một thành viên quyết định phân phối lợi nhuận sau thuế để tất toán khoản phải thu chủ (Nợ 421 / Có 1388).",
        },
      ],
      settlements: settlementsRes.rows.map(mapSettlementRow),
    };

    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: report,
    };
  }

  async executeSettlement(
    context: ActorContext,
    input: ExecuteOwnerSettlementRequestContract,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((r) => WRITE_ROLES.has(r))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!Number.isInteger(input.fiscalYear) || !input.reason?.trim()) {
      throw new Error("VALIDATION_FAILED");
    }
    if (!["repayment", "offset_3388_1388", "profit_distribution"].includes(input.option)) {
      throw new Error("OWNER_SETTLEMENT_OPTION_INVALID");
    }
    const effectiveOn = input.effectiveOn?.trim() || `${input.fiscalYear}-12-31`;
    if (!ISO_DATE.test(effectiveOn)) throw new Error("VALIDATION_FAILED");
    if (input.amountMinor !== undefined && !POS_INT.test(String(input.amountMinor).trim())) {
      throw new Error("OWNER_SETTLEMENT_AMOUNT_INVALID");
    }

    const canonical = {
      id: input.id?.trim() || null,
      fiscalYear: input.fiscalYear,
      effectiveOn,
      option: input.option,
      repaymentDirection: input.repaymentDirection ?? null,
      financialAccountId: input.financialAccountId?.trim() || null,
      amountMinor: input.amountMinor ? String(input.amountMinor).trim() : null,
      reference: input.reference?.trim() || null,
      description: input.description?.trim() || null,
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

      const fyCheck = await client.query(
        `select 1 from fiscal_years where organization_id = $1 and year = $2`,
        [context.organizationId, canonical.fiscalYear],
      );
      if (!fyCheck.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      await assertClosePostingPeriodAllowed(client, context, effectiveOn);

      const before = await resolveOwnerPositionSnapshot(
        client,
        context.organizationId,
        effectiveOn,
      );

      let amount: bigint;
      let debitAccountCode: string;
      let creditAccountCode: string;
      let repaymentDirection: OwnerRepaymentDirectionContract | null = null;
      let financialAccountId: string | null = null;
      let bankTransactionId: string | null = null;
      let description = canonical.description ?? "";

      if (canonical.option === "repayment") {
        if (!canonical.financialAccountId) {
          throw new Error("OWNER_SETTLEMENT_FINANCIAL_ACCOUNT_REQUIRED");
        }
        const faRes = await client.query<{
          id: string;
          code: string;
          currency: string;
          status: string;
          ledger_account_code: string;
        }>(
          `select id, code, currency, status::text as status, ledger_account_code
             from financial_accounts
            where organization_id = $1 and id = $2`,
          [context.organizationId, canonical.financialAccountId],
        );
        const fa = faRes.rows[0];
        if (!fa) throw new Error("FINANCIAL_ACCOUNT_NOT_FOUND");
        if (fa.status !== "active") throw new Error("FINANCIAL_ACCOUNT_INACTIVE");
        if (fa.currency !== before.currency) throw new Error("BANK_TRANSACTION_CURRENCY_MISMATCH");
        if (fa.code === "CASH-OWNER-CUSTODY" || fa.ledger_account_code === "111-OWNER-CUSTODY") {
          throw new Error("OWNER_SETTLEMENT_CUSTODY_ACCOUNT_NOT_ALLOWED");
        }
        financialAccountId = fa.id;

        if (canonical.repaymentDirection) {
          repaymentDirection = canonical.repaymentDirection;
        } else if (before.payable3388Minor > 0n && before.receivable1388Minor === 0n) {
          repaymentDirection = "company_to_owner";
        } else if (before.receivable1388Minor > 0n && before.payable3388Minor === 0n) {
          repaymentDirection = "owner_to_company";
        } else if (before.payable3388Minor === 0n && before.receivable1388Minor === 0n) {
          throw new Error("OWNER_SETTLEMENT_NOTHING_TO_SETTLE");
        } else {
          throw new Error("OWNER_SETTLEMENT_DIRECTION_AMBIGUOUS");
        }

        const maxMinor =
          repaymentDirection === "company_to_owner"
            ? before.payable3388Minor
            : before.receivable1388Minor;
        if (maxMinor <= 0n) throw new Error("OWNER_SETTLEMENT_NOTHING_TO_SETTLE");
        amount = canonical.amountMinor ? BigInt(canonical.amountMinor) : maxMinor;
        if (amount > maxMinor) throw new Error("OWNER_SETTLEMENT_AMOUNT_EXCEEDS_BALANCE");

        if (repaymentDirection === "company_to_owner") {
          debitAccountCode = before.payable3388AccountCode;
          creditAccountCode = fa.ledger_account_code;
          description ||= `Quyết toán năm ${canonical.fiscalYear}: công ty hoàn trả nợ chủ doanh nghiệp`;
        } else {
          debitAccountCode = fa.ledger_account_code;
          creditAccountCode = before.receivable1388AccountCode;
          description ||= `Quyết toán năm ${canonical.fiscalYear}: chủ doanh nghiệp hoàn tiền phải thu 1388`;
        }

        bankTransactionId = randomUUID();
        const signedMinor = repaymentDirection === "company_to_owner" ? -amount : amount;
        const fingerprint = createHash("sha256")
          .update(
            JSON.stringify([
              "owner_year_end_settlement",
              idempotencyKey,
              financialAccountId,
              effectiveOn,
              signedMinor.toString(),
            ]),
          )
          .digest("hex");
        await client.query(
          `insert into bank_transactions
             (organization_id, id, financial_account_id, fingerprint, booking_date, amount_minor,
              currency, reference, description, counterparty_name, state)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, 'reconciled')`,
          [
            context.organizationId,
            bankTransactionId,
            financialAccountId,
            fingerprint,
            effectiveOn,
            signedMinor.toString(),
            before.currency,
            canonical.reference,
            description,
          ],
        );
      } else if (canonical.option === "offset_3388_1388") {
        if (canonical.financialAccountId || canonical.repaymentDirection) {
          throw new Error("VALIDATION_FAILED");
        }
        const maxOffset =
          before.payable3388Minor < before.receivable1388Minor
            ? before.payable3388Minor
            : before.receivable1388Minor;
        if (maxOffset <= 0n) throw new Error("OWNER_SETTLEMENT_NOTHING_TO_SETTLE");
        amount = canonical.amountMinor ? BigInt(canonical.amountMinor) : maxOffset;
        if (amount > maxOffset) throw new Error("OWNER_SETTLEMENT_AMOUNT_EXCEEDS_BALANCE");
        debitAccountCode = before.payable3388AccountCode;
        creditAccountCode = before.receivable1388AccountCode;
        description ||= `Quyết toán năm ${canonical.fiscalYear}: cấn trừ phải trả chủ (3388) với phải thu chủ (1388)`;
      } else {
        if (canonical.financialAccountId || canonical.repaymentDirection) {
          throw new Error("VALIDATION_FAILED");
        }
        if (before.receivable1388Minor <= 0n) {
          throw new Error("OWNER_SETTLEMENT_NOTHING_TO_SETTLE");
        }
        const reAccountCheck = await client.query<{ code: string }>(
          `select code from accounts
            where organization_id = $1 and code = $2 and is_active = true`,
          [context.organizationId, before.retainedEarnings421AccountCode],
        );
        if (!reAccountCheck.rows[0]) {
          throw new Error("OWNER_SETTLEMENT_RETAINED_EARNINGS_NOT_CONFIGURED");
        }
        amount = canonical.amountMinor ? BigInt(canonical.amountMinor) : before.receivable1388Minor;
        if (amount > before.receivable1388Minor) {
          throw new Error("OWNER_SETTLEMENT_AMOUNT_EXCEEDS_BALANCE");
        }
        debitAccountCode = before.retainedEarnings421AccountCode;
        creditAccountCode = before.receivable1388AccountCode;
        description ||= `Quyết toán năm ${canonical.fiscalYear}: phân phối lợi nhuận cấn trừ phải thu chủ sở hữu (Nợ 421 / Có 1388)`;
      }

      const acctCheck = await client.query<{ code: string }>(
        `select code from accounts
          where organization_id = $1 and is_active = true and code in ($2, $3)`,
        [context.organizationId, debitAccountCode, creditAccountCode],
      );
      if (acctCheck.rows.length < (debitAccountCode === creditAccountCode ? 1 : 2)) {
        throw new Error("OWNER_RECEIVABLE_ACCOUNT_NOT_CONFIGURED");
      }

      const journalId = randomUUID();
      await client.query(
        `insert into journal_entries
           (organization_id, id, journal_date, description, currency, state, version, created_by,
            approved_at, approved_by, approval_reason, posted_at, posted_by)
         values ($1, $2, $3, $4, $5, 'posted', 2, $6, now(), $6, $7, now(), $6)`,
        [
          context.organizationId,
          journalId,
          effectiveOn,
          description,
          before.currency,
          context.actorId,
          canonical.reason,
        ],
      );
      await client.query(
        `insert into journal_lines
           (organization_id, journal_id, line_number, account_code, debit_minor, credit_minor, description, dimensions)
         values ($1, $2, 1, $3, $4, null, $5, '{}'),
                ($1, $2, 2, $6, null, $4, $5, '{}')`,
        [
          context.organizationId,
          journalId,
          debitAccountCode,
          amount.toString(),
          description,
          creditAccountCode,
        ],
      );

      if (bankTransactionId) {
        await client.query(
          `insert into bank_transaction_events
             (organization_id, id, transaction_id, action, from_state, to_state, actor_id, reason, correlation_id, details)
           values ($1, $2, $3, 'record-owner-settlement', null, 'reconciled', $4, $5, $6, $7)`,
          [
            context.organizationId,
            randomUUID(),
            bankTransactionId,
            context.actorId,
            canonical.reason,
            context.correlationId,
            { journalId, option: canonical.option, repaymentDirection },
          ],
        );
      }

      const after = await resolveOwnerPositionSnapshot(client, context.organizationId, effectiveOn);
      const settlementId = canonical.id ?? randomUUID();
      const inserted = await client.query<SettlementRow>(
        `insert into owner_year_end_settlements
           (organization_id, id, fiscal_year, effective_on, settlement_option, repayment_direction,
            amount_minor, currency, debit_account_code, credit_account_code, financial_account_id,
            bank_transaction_id, journal_id,
            before_payable_3388_minor, before_receivable_1388_minor, before_custody_111_minor,
            after_payable_3388_minor, after_receivable_1388_minor, after_custody_111_minor,
            reference, description, reason, created_by, correlation_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
         returning id, fiscal_year, effective_on::text as effective_on, settlement_option,
                   repayment_direction, amount_minor::text as amount_minor, currency,
                   debit_account_code, credit_account_code, financial_account_id, bank_transaction_id,
                   journal_id,
                   before_payable_3388_minor::text as before_payable_3388_minor,
                   before_receivable_1388_minor::text as before_receivable_1388_minor,
                   before_custody_111_minor::text as before_custody_111_minor,
                   after_payable_3388_minor::text as after_payable_3388_minor,
                   after_receivable_1388_minor::text as after_receivable_1388_minor,
                   after_custody_111_minor::text as after_custody_111_minor,
                   reference, description, reason, created_by, created_at`,
        [
          context.organizationId,
          settlementId,
          canonical.fiscalYear,
          effectiveOn,
          canonical.option,
          repaymentDirection,
          amount.toString(),
          before.currency,
          debitAccountCode,
          creditAccountCode,
          financialAccountId,
          bankTransactionId,
          journalId,
          before.payable3388Minor.toString(),
          before.receivable1388Minor.toString(),
          before.ownerCustody111Minor.toString(),
          after.payable3388Minor.toString(),
          after.receivable1388Minor.toString(),
          after.ownerCustody111Minor.toString(),
          canonical.reference,
          description,
          canonical.reason,
          context.actorId,
          context.correlationId,
        ],
      );

      const record = mapSettlementRow(inserted.rows[0]!);
      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
           (organization_id, id, resource_type, resource_key, resource_version, action, actor_id, correlation_id, before_state, after_state)
         values ($1, $2, 'owner_year_end_settlement', $3, '1', 'create', $4, $5, $6, $7)`,
        [
          context.organizationId,
          auditEventId,
          settlementId,
          context.actorId,
          context.correlationId,
          {
            payable3388Minor: before.payable3388Minor.toString(),
            receivable1388Minor: before.receivable1388Minor.toString(),
            ownerCustody111Minor: before.ownerCustody111Minor.toString(),
          },
          record,
        ],
      );
      await client.query(
        `insert into outbox_events
           (organization_id, id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id)
         values ($1, $2, 'owner_year_end_settlement', $3, 'owner_year_end_settlement.recorded', 1, $4, $5)`,
        [context.organizationId, outboxEventId, settlementId, record, context.correlationId],
      );

      const responseBody = {
        ...record,
        resourceVersion: "1",
        auditEventId,
        outboxEventId,
        nextActions: ["get_owner_settlement_position", "get_journal"],
      };
      await client.query(
        `insert into api_idempotency_records
           (organization_id, idempotency_key, operation, request_hash, response_body)
         values ($1, $2, 'banking:owner-settlement:execute', $3, $4)`,
        [context.organizationId, idempotencyKey, requestHash, responseBody],
      );
      await client.query("commit");

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
