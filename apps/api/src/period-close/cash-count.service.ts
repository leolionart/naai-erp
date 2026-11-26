import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import pg from "pg";
import {
  API_VERSION,
  type CashCountStatusContract,
  type OwnerCustodyCashCountContract,
  type RecordCashCountRequestContract,
} from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import type { ActorContext } from "../master-data/master-data.types.js";
import {
  assertClosePostingPeriodAllowed,
  buildNegativeCustodyAlert,
  readLedgerAccountBalanceMinor,
  resolveCashAdjustmentAccount,
  resolveCustodyAccountCode,
} from "./period-close-accounts.helper.js";

const READ_ROLES = new Set(["owner", "finance_admin", "accountant", "approver", "viewer"]);
const WRITE_ROLES = new Set(["owner", "finance_admin", "accountant"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const INT_STR = /^\d+$/;

type CashCountRow = {
  id: string;
  counted_on: string;
  custody_account_code: string;
  book_balance_minor: string;
  counted_balance_minor: string;
  difference_minor: string;
  adjustment_account_code: string | null;
  journal_id: string | null;
  currency: string;
  reason: string;
  note: string | null;
  counted_by: string;
  created_at: Date;
};

function mapCashCountRow(row: CashCountRow): OwnerCustodyCashCountContract {
  const diff = BigInt(row.difference_minor);
  const status: CashCountStatusContract =
    diff === 0n ? "matched" : diff > 0n ? "overage" : "shortage";
  return {
    id: row.id,
    countedOn: row.counted_on,
    custodyAccountCode: row.custody_account_code,
    bookBalanceMinor: row.book_balance_minor,
    countedBalanceMinor: row.counted_balance_minor,
    differenceMinor: row.difference_minor,
    afterCustodyBalanceMinor: row.counted_balance_minor,
    status,
    adjustmentAccountCode: row.adjustment_account_code,
    journalId: row.journal_id,
    currency: row.currency,
    reason: row.reason,
    note: row.note,
    countedBy: row.counted_by,
    createdAt: row.created_at.toISOString(),
  };
}

@Injectable()
export class CashCountService {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  constructor(@Inject(MasterDataService) private readonly masterData: MasterDataService) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }

  async list(context: ActorContext, filters: { from?: string; to?: string; asOf?: string }) {
    if (!context.roles.some((r) => READ_ROLES.has(r))) throw new Error("FORBIDDEN");
    const asOf =
      filters.asOf?.trim() && ISO_DATE.test(filters.asOf.trim())
        ? filters.asOf.trim()
        : new Date().toISOString().slice(0, 10);

    const orgRes = await this.pool.query<{ base_currency: string }>(
      `select base_currency from organizations where id = $1`,
      [context.organizationId],
    );
    if (!orgRes.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    const custodyAccountCode = await resolveCustodyAccountCode(this.pool, context.organizationId);
    const currentBookBalanceMinor = await readLedgerAccountBalanceMinor(
      this.pool,
      context.organizationId,
      [custodyAccountCode],
      asOf,
      "debit",
    );

    const rowsRes = await this.pool.query<CashCountRow>(
      `select id, counted_on::text as counted_on, custody_account_code,
              book_balance_minor::text as book_balance_minor,
              counted_balance_minor::text as counted_balance_minor,
              difference_minor::text as difference_minor,
              adjustment_account_code, journal_id, currency, reason, note, counted_by, created_at
         from owner_custody_cash_counts
        where organization_id = $1
          and ($2::date is null or counted_on >= $2::date)
          and ($3::date is null or counted_on <= $3::date)
        order by counted_on desc, created_at desc, id desc`,
      [context.organizationId, filters.from?.trim() || null, filters.to?.trim() || null],
    );

    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: {
        asOf,
        currency: orgRes.rows[0].base_currency,
        custodyAccountCode,
        currentBookBalanceMinor: currentBookBalanceMinor.toString(),
        negativeCustodyAlert: buildNegativeCustodyAlert(
          currentBookBalanceMinor,
          custodyAccountCode,
        ),
        items: rowsRes.rows.map(mapCashCountRow),
      },
    };
  }

  async get(context: ActorContext, id: string) {
    if (!context.roles.some((r) => READ_ROLES.has(r))) throw new Error("FORBIDDEN");
    const res = await this.pool.query<CashCountRow>(
      `select id, counted_on::text as counted_on, custody_account_code,
              book_balance_minor::text as book_balance_minor,
              counted_balance_minor::text as counted_balance_minor,
              difference_minor::text as difference_minor,
              adjustment_account_code, journal_id, currency, reason, note, counted_by, created_at
         from owner_custody_cash_counts
        where organization_id = $1 and id = $2`,
      [context.organizationId, id],
    );
    if (!res.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: mapCashCountRow(res.rows[0]),
    };
  }

  async record(
    context: ActorContext,
    input: RecordCashCountRequestContract,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((r) => WRITE_ROLES.has(r))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const countedOn = input.countedOn?.trim() ?? "";
    const rawCounted = String(input.countedBalanceMinor ?? "").trim();
    const reason = input.reason?.trim() ?? "";
    if (!ISO_DATE.test(countedOn) || !reason) throw new Error("VALIDATION_FAILED");
    if (/^-\d+$/.test(rawCounted)) throw new Error("CASH_COUNT_NEGATIVE_PHYSICAL_BALANCE");
    if (!INT_STR.test(rawCounted)) throw new Error("VALIDATION_FAILED");
    const countedBalanceMinor = BigInt(rawCounted);

    const canonical = {
      id: input.id?.trim() || null,
      countedOn,
      countedBalanceMinor: countedBalanceMinor.toString(),
      adjustmentAccountCode: input.adjustmentAccountCode?.trim() || null,
      note: input.note?.trim() || null,
      reason,
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

      const orgRes = await client.query<{ base_currency: string }>(
        `select base_currency from organizations where id = $1`,
        [context.organizationId],
      );
      if (!orgRes.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      const currency = orgRes.rows[0].base_currency;

      await assertClosePostingPeriodAllowed(client, context, countedOn);
      const custodyAccountCode = await resolveCustodyAccountCode(client, context.organizationId);
      const bookBalanceMinor = await readLedgerAccountBalanceMinor(
        client,
        context.organizationId,
        [custodyAccountCode],
        countedOn,
        "debit",
      );
      const differenceMinor = countedBalanceMinor - bookBalanceMinor;

      let adjustmentAccountCode: string | null = null;
      let journalId: string | null = null;

      if (differenceMinor !== 0n) {
        adjustmentAccountCode = await resolveCashAdjustmentAccount(
          client,
          context.organizationId,
          differenceMinor,
          canonical.adjustmentAccountCode ?? undefined,
        );
        journalId = randomUUID();
        const absAmount = differenceMinor > 0n ? differenceMinor : -differenceMinor;
        const debitAccount = differenceMinor > 0n ? custodyAccountCode : adjustmentAccountCode;
        const creditAccount = differenceMinor > 0n ? adjustmentAccountCode : custodyAccountCode;
        const description =
          differenceMinor > 0n
            ? `Kiểm quỹ thừa tiền mặt do chủ giữ (${countedOn}): ${reason}`
            : `Kiểm quỹ thiếu tiền mặt do chủ giữ (${countedOn}): ${reason}`;

        await client.query(
          `insert into journal_entries
             (organization_id, id, journal_date, description, currency, state, version, created_by,
              approved_at, approved_by, approval_reason, posted_at, posted_by)
           values ($1, $2, $3, $4, $5, 'posted', 2, $6, now(), $6, $7, now(), $6)`,
          [
            context.organizationId,
            journalId,
            countedOn,
            description,
            currency,
            context.actorId,
            reason,
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
            debitAccount,
            absAmount.toString(),
            description,
            creditAccount,
          ],
        );
      }

      const countId = canonical.id ?? randomUUID();
      const inserted = await client.query<CashCountRow>(
        `insert into owner_custody_cash_counts
           (organization_id, id, counted_on, custody_account_code, book_balance_minor,
            counted_balance_minor, difference_minor, adjustment_account_code, journal_id,
            currency, reason, note, counted_by, correlation_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         returning id, counted_on::text as counted_on, custody_account_code,
                   book_balance_minor::text as book_balance_minor,
                   counted_balance_minor::text as counted_balance_minor,
                   difference_minor::text as difference_minor,
                   adjustment_account_code, journal_id, currency, reason, note, counted_by, created_at`,
        [
          context.organizationId,
          countId,
          countedOn,
          custodyAccountCode,
          bookBalanceMinor.toString(),
          countedBalanceMinor.toString(),
          differenceMinor.toString(),
          adjustmentAccountCode,
          journalId,
          currency,
          reason,
          canonical.note,
          context.actorId,
          context.correlationId,
        ],
      );

      const record = mapCashCountRow(inserted.rows[0]!);
      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
           (organization_id, id, resource_type, resource_key, resource_version, action, actor_id, correlation_id, before_state, after_state)
         values ($1, $2, 'owner_custody_cash_count', $3, '1', 'create', $4, $5, $6, $7)`,
        [
          context.organizationId,
          auditEventId,
          countId,
          context.actorId,
          context.correlationId,
          { bookBalanceMinor: bookBalanceMinor.toString() },
          record,
        ],
      );
      await client.query(
        `insert into outbox_events
           (organization_id, id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id)
         values ($1, $2, 'owner_custody_cash_count', $3, 'owner_custody_cash_count.recorded', 1, $4, $5)`,
        [context.organizationId, outboxEventId, countId, record, context.correlationId],
      );

      const responseBody = {
        ...record,
        resourceVersion: "1",
        auditEventId,
        outboxEventId,
        nextActions: journalId
          ? ["get_cash_count", "list_cash_counts", "get_journal"]
          : ["get_cash_count", "list_cash_counts"],
      };
      await client.query(
        `insert into api_idempotency_records
           (organization_id, idempotency_key, operation, request_hash, response_body)
         values ($1, $2, 'banking:cash-count:record', $3, $4)`,
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
