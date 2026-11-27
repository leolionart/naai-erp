import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type {
  MatchInput,
  ReconciliationContext,
  ReconciliationStore,
} from "./reconciliation.types.js";
import { type BankRow, hash } from "./pg-reconciliation.store.shared.js";
import { suggestOperation, matchOperation } from "./reconciliation-suggest.operation.js";
import { reconcileOperation, unreconcileOperation } from "./reconciliation-reconcile.operation.js";
import { viewOperation } from "./reconciliation-view.operation.js";

@Injectable()
export class PgReconciliationStore implements ReconciliationStore {
  readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async getCandidates(org: string, transactionId: string) {
    const result = await this.pool.query(
      `select r.id,r.algorithm_version "algorithmVersion",r.threshold_bps "thresholdBps",
              r.ambiguity_margin_bps "ambiguityMarginBps",r.created_at "createdAt",
              coalesce(json_agg(jsonb_build_object('id',c.id,'rank',c.rank,'targetType',c.target_type,
                'targetId',coalesce(c.commercial_document_id,c.expense_id),'confidenceBps',c.confidence_bps,
                'factors',c.factors,'outstandingMinor',c.outstanding_minor::text,'currency',c.currency,
                'status',c.status) order by c.rank) filter(where c.id is not null),'[]') items
       from reconciliation_candidate_runs r left join reconciliation_candidates c
         on c.organization_id=r.organization_id and c.run_id=r.id
       where r.organization_id=$1 and r.bank_transaction_id=$2
       group by r.organization_id,r.id order by r.created_at desc limit 1`,
      [org, transactionId],
    );
    return result.rows[0] ?? { items: [] };
  }

  suggest = suggestOperation;

  match = matchOperation;

  reconcile = reconcileOperation;

  unreconcile = unreconcileOperation;

  async list(org: string, filters: { state?: string; financialAccountId?: string }) {
    const result = await this.pool.query<{ id: string }>(
      `select p.id from payment_reconciliations p join bank_transactions b on b.organization_id=p.organization_id and b.id=p.bank_transaction_id
       join reconciliation_attempts r on r.organization_id=p.organization_id and r.reconciliation_id=p.id and r.attempt_number=p.current_attempt_number
       where p.organization_id=$1 and ($2::text is null or r.state::text=$2) and ($3::text is null or b.financial_account_id=$3)
       order by p.created_at desc,p.id`,
      [org, filters.state ?? null, filters.financialAccountId ?? null],
    );
    return {
      items: await Promise.all(result.rows.map((row) => this.view(this.pool, org, row.id))),
    };
  }
  async get(org: string, id: string) {
    const exists = await this.pool.query(
      "select 1 from payment_reconciliations where organization_id=$1 and id=$2",
      [org, id],
    );
    return exists.rows[0] ? this.view(this.pool, org, id) : undefined;
  }

  view = viewOperation;

  async scoreCandidates(c: PoolClient, org: string, bank: BankRow) {
    const positive = BigInt(bank.amount_minor) > 0n;
    const docs = await c.query<{
      id: string;
      document_number: string;
      document_date: string;
      currency: string;
      gross_minor: string;
      display_name: string;
      outstanding: string;
    }>(
      `select d.id,d.document_number,d.document_date,d.currency,d.gross_minor::text,p.display_name,
      (d.gross_minor-coalesce((select sum(a.target_amount_minor) from reconciliation_allocations a join reconciliation_attempts r on r.organization_id=a.organization_id and r.id=a.reconciliation_id where a.organization_id=d.organization_id and a.commercial_document_id=d.id and r.state in ('matched','reconciled')),0))::text outstanding
      from commercial_documents d join parties p on p.organization_id=d.organization_id and p.id=d.party_id
      where d.organization_id=$1 and (($2 and d.type='sales_invoice' and d.state in ('issued','posted','partially_paid')) or (not $2 and d.type='purchase_invoice' and d.state in ('posted','partially_paid')))`,
      [org, positive],
    );
    const amount =
      BigInt(bank.amount_minor) < 0n ? -BigInt(bank.amount_minor) : BigInt(bank.amount_minor);
    return docs.rows
      .filter((row) => BigInt(row.outstanding) > 0n)
      .map((row) => {
        const outstanding = BigInt(row.outstanding);
        const amountScore = amount === outstanding ? 4000 : amount < outstanding ? 2500 : 0;
        const currencyScore = row.currency === bank.currency ? 1500 : 0;
        const referenceScore = `${bank.reference ?? ""} ${bank.description}`
          .toUpperCase()
          .includes(row.document_number.toUpperCase())
          ? 2000
          : 0;
        const partyScore =
          bank.counterparty_name &&
          bank.counterparty_name.toUpperCase().includes(row.display_name.toUpperCase())
            ? 1500
            : 0;
        const days = Math.abs(
          (Date.parse(bank.booking_date) - Date.parse(row.document_date)) / 86_400_000,
        );
        const dateScore = days <= 7 ? Math.max(0, 1000 - Math.round(days) * 100) : 0;
        return {
          targetType: "commercial_document" as const,
          targetId: row.id,
          confidenceBps: amountScore + currencyScore + referenceScore + partyScore + dateScore,
          factors: {
            amountBps: amountScore,
            currencyBps: currencyScore,
            referenceBps: referenceScore,
            partyBps: partyScore,
            dateBps: dateScore,
            daysApart: Math.round(days),
          },
          outstandingMinor: row.outstanding,
          currency: row.currency,
        };
      })
      .sort((a, b) => b.confidenceBps - a.confidenceBps || a.targetId.localeCompare(b.targetId));
  }

  async bank(c: PoolClient, org: string, id: string): Promise<BankRow> {
    await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${org}:reconciliation:${id}`,
    ]);
    const result = await c.query<BankRow>(
      `select b.id,b.state,b.amount_minor::text,b.currency,b.booking_date::text,b.reference,b.description,b.counterparty_name,b.financial_account_id,f.ledger_account_code,o.base_currency,b.version::text
      from bank_transactions b join financial_accounts f on f.organization_id=b.organization_id and f.id=b.financial_account_id join organizations o on o.id=b.organization_id
      where b.organization_id=$1 and b.id=$2 for update of b`,
      [org, id],
    );
    if (!result.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return result.rows[0];
  }
  async validateBaseAmount(c: PoolClient, org: string, bank: BankRow, input: MatchInput) {
    const base = BigInt(input.baseAmountMinor),
      amount =
        BigInt(bank.amount_minor) < 0n ? -BigInt(bank.amount_minor) : BigInt(bank.amount_minor);
    if (bank.currency === bank.base_currency) {
      if (input.exchangeRateId || base !== amount)
        throw new Error("RECONCILIATION_BASE_AMOUNT_INVALID");
      return;
    }
    if (!input.exchangeRateId) throw new Error("RECONCILIATION_EXCHANGE_RATE_REQUIRED");
    const rate = await c.query<{ expected: string }>(
      `select round($3::numeric*rate)::text expected from exchange_rates where organization_id=$1 and id=$2 and source_currency=$4 and target_currency=$5`,
      [org, input.exchangeRateId, amount.toString(), bank.currency, bank.base_currency],
    );
    if (!rate.rows[0] || BigInt(rate.rows[0].expected) !== base)
      throw new Error("RECONCILIATION_BASE_AMOUNT_INVALID");
  }
  async lockAndValidateTarget(
    c: PoolClient,
    org: string,
    bank: BankRow,
    allocation: MatchInput["allocations"][number],
  ) {
    if (allocation.targetType === "commercial_document") {
      const result = await c.query<{
        type: string;
        state: string;
        currency: string;
        gross_minor: string;
        control_account_code: string;
        reserved: string;
      }>(
        `select d.type,d.state,d.currency,d.gross_minor::text,d.control_account_code,
        coalesce((select sum(a.target_amount_minor)::text from reconciliation_allocations a join reconciliation_attempts r on r.organization_id=a.organization_id and r.id=a.reconciliation_id where a.organization_id=d.organization_id and a.commercial_document_id=d.id and r.state in ('matched','reconciled')),'0') reserved
        from commercial_documents d where d.organization_id=$1 and d.id=$2 for update`,
        [org, allocation.targetId],
      );
      const row = result.rows[0],
        positive = BigInt(bank.amount_minor) > 0n;
      if (
        !row ||
        row.currency !== allocation.targetCurrency ||
        (positive
          ? row.type !== "sales_invoice" ||
            !["issued", "posted", "partially_paid"].includes(row.state)
          : row.type !== "purchase_invoice" || !["posted", "partially_paid"].includes(row.state))
      )
        throw new Error("RECONCILIATION_TARGET_INVALID");
      if (BigInt(allocation.targetAmountMinor) > BigInt(row.gross_minor) - BigInt(row.reserved))
        throw new Error("RECONCILIATION_OVERALLOCATION");
      return {
        controlAccountCode: row.control_account_code,
        outstandingBeforeMinor: (BigInt(row.gross_minor) - BigInt(row.reserved)).toString(),
      };
    }
    const result = await c.query<{
      state: string;
      currency: string;
      gross_minor: string;
      counter_account_code: string;
      reserved: string;
    }>(
      `select e.state,e.currency,e.gross_minor::text,e.counter_account_code,
      coalesce((select sum(a.target_amount_minor)::text from reconciliation_allocations a join reconciliation_attempts r on r.organization_id=a.organization_id and r.id=a.reconciliation_id where a.organization_id=e.organization_id and a.expense_id=e.id and r.state in ('matched','reconciled')),'0') reserved
      from expenses e where e.organization_id=$1 and e.id=$2 for update`,
      [org, allocation.targetId],
    );
    const row = result.rows[0];
    if (
      !row ||
      BigInt(bank.amount_minor) > 0n ||
      row.state !== "posted" ||
      row.currency !== allocation.targetCurrency ||
      row.counter_account_code === bank.ledger_account_code
    )
      throw new Error("RECONCILIATION_TARGET_INVALID");
    if (BigInt(allocation.targetAmountMinor) > BigInt(row.gross_minor) - BigInt(row.reserved))
      throw new Error("RECONCILIATION_OVERALLOCATION");
    return {
      controlAccountCode: row.counter_account_code,
      outstandingBeforeMinor: (BigInt(row.gross_minor) - BigInt(row.reserved)).toString(),
    };
  }
  async revalidateTarget(
    c: PoolClient,
    org: string,
    attemptId: string,
    allocation: {
      target_type: string;
      commercial_document_id: string | null;
      expense_id: string | null;
    },
  ) {
    const table =
        allocation.target_type === "commercial_document" ? "commercial_documents" : "expenses",
      id = allocation.commercial_document_id ?? allocation.expense_id;
    const result = await c.query(
      `select id from ${table} where organization_id=$1 and id=$2 for update`,
      [org, id],
    );
    if (!result.rows[0]) throw new Error("RECONCILIATION_TARGET_INVALID");
    const over = await c.query<{ overallocated: boolean }>(
      `select exists(select 1 from reconciliation_allocations a where a.organization_id=$1 and a.reconciliation_id=$2 and a.id=$3 and a.target_amount_minor > (select ${table === "commercial_documents" ? "gross_minor" : "gross_minor"} from ${table} where organization_id=$1 and id=$4)) as overallocated`,
      [org, attemptId, (allocation as { id?: string }).id ?? "", id],
    );
    if (over.rows[0]?.overallocated) throw new Error("RECONCILIATION_OVERALLOCATION");
  }
  async activeAttempt(c: PoolClient, org: string, transactionId: string, state: string) {
    const result = await c.query<{
      id: string;
      reconciliation_id: string;
      attempt_number: number;
      state: string;
      base_amount_minor: string;
      journal_id: string | null;
      version: string;
    }>(
      "select id,reconciliation_id,attempt_number,state,base_amount_minor::text,journal_id,version::text from reconciliation_attempts where organization_id=$1 and bank_transaction_id=$2 and state=$3 for update",
      [org, transactionId, state],
    );
    if (!result.rows[0]) throw new Error("RECONCILIATION_ACTIVE_ATTEMPT_NOT_FOUND");
    return result.rows[0];
  }
  async assertPeriod(c: PoolClient, context: ReconciliationContext, date: string) {
    const result = await c.query<{ state: string }>(
      "select state from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on",
      [context.organizationId, date],
    );
    if (result.rows.length !== 1)
      throw new Error(result.rows.length ? "FISCAL_PERIOD_AMBIGUOUS" : "FISCAL_PERIOD_NOT_FOUND");
    if (result.rows[0]!.state === "hard_locked") throw new Error("PERIOD_HARD_LOCKED");
    if (
      result.rows[0]!.state === "soft_locked" &&
      !context.roles.some((role) => ["owner", "finance_admin"].includes(role))
    )
      throw new Error("PERIOD_SOFT_LOCKED");
  }
  async mutation(
    context: ReconciliationContext,
    key: string,
    operation: string,
    request: unknown,
    action: (c: PoolClient) => Promise<Record<string, unknown>>,
  ) {
    const requestHash = hash(request),
      c = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${context.organizationId}:${key}`,
      ]);
      const prior = await c.query<{ request_hash: string; response_body: Record<string, unknown> }>(
        "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
        [context.organizationId, key],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await c.query("rollback");
        const body = prior.rows[0].response_body;
        return body.mutation && typeof body.mutation === "object"
          ? {
              ...body,
              mutation: {
                ...(body.mutation as Record<string, unknown>),
                idempotencyReplayed: true,
              },
            }
          : { ...body, idempotencyReplayed: true };
      }
      const response = await action(c);
      await c.query(
        "insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,$3,$4,$5)",
        [context.organizationId, key, operation, requestHash, response],
      );
      await c.query("commit");
      return response;
    } catch (error) {
      await c.query("rollback");
      throw error;
    } finally {
      c.release();
    }
  }
  async event(
    c: PoolClient,
    context: ReconciliationContext,
    reconciliationId: string | null,
    transactionId: string,
    action: string,
    from: string,
    to: string,
    reason: string,
    details: unknown,
  ) {
    const id = randomUUID();
    await c.query(
      "insert into reconciliation_events(organization_id,id,reconciliation_id,bank_transaction_id,action,from_state,to_state,actor_id,reason,correlation_id,details) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      [
        context.organizationId,
        id,
        reconciliationId,
        transactionId,
        action,
        from,
        to,
        context.actorId,
        reason,
        context.correlationId,
        details,
      ],
    );
    return id;
  }
  audit(
    c: PoolClient,
    context: ReconciliationContext,
    id: string,
    type: string,
    key: string,
    action: string,
    version: bigint,
    before: unknown,
    after: unknown,
  ) {
    return c.query(
      "insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        context.organizationId,
        id,
        type,
        key,
        version.toString(),
        action,
        context.actorId,
        context.correlationId,
        before,
        after,
      ],
    );
  }
  outbox(
    c: PoolClient,
    context: ReconciliationContext,
    id: string,
    transactionId: string,
    eventType: string,
    payload: unknown,
  ) {
    return c.query(
      "insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'bank_transaction',$3,$4,1,$5,$6)",
      [context.organizationId, id, transactionId, eventType, payload, context.correlationId],
    );
  }
}
