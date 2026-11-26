import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";

const READ_ROLES = new Set(["owner", "finance_admin", "accountant", "approver", "viewer"]);
const WRITE_ROLES = new Set(["owner", "finance_admin"]);
const TARGET_ACCOUNT = "111-OWNER-CUSTODY";

type Context = Readonly<{
  organizationId: string;
  actorId: string;
  roles: readonly string[];
  correlationId: string;
}>;

export type OwnerCustodyMigrationDryRunRequest = Readonly<{
  effectiveOn?: string;
}>;

export type OwnerCustodyMigrationCommitRequest = Readonly<{
  planHash: string;
  reason: string;
  effectiveOn?: string;
}>;

export type OwnerCustodyMigrationItem = Readonly<{
  sourceKey: string;
  sourceJournalId: string;
  sourceLineNumber: number;
  journalDate: string;
  currency: string;
  sourceRecordKind: string;
  sourceRecordId: string;
  legacyAccountCode: string;
  targetAccountCode: string;
  debitAccountCode: string;
  creditAccountCode: string;
  amountMinor: string;
}>;

const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

@Injectable()
export class OwnerCustodyMigrationService {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  constructor(@Inject(MasterDataService) private readonly masterData: MasterDataService) {}

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

  private async evaluate(client: PoolClient | pg.Pool, organizationId: string) {
    const orgRes = await client.query<{ base_currency: string }>(
      "select base_currency from organizations where id=$1",
      [organizationId],
    );
    if (!orgRes.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    const baseCurrency = orgRes.rows[0].base_currency;

    const custodyFa = await client.query<{ id: string; ledger_account_code: string }>(
      `select id, ledger_account_code from financial_accounts
        where organization_id=$1 and code='CASH-OWNER-CUSTODY'
        order by (status='active') desc, created_at asc limit 1`,
      [organizationId],
    );
    const balancesRes = await client.query<{
      company_cash_minor: string;
      owner_custody_minor: string;
    }>(
      `with company_cash_accounts as (
         select distinct ledger_account_code as account_code
           from financial_accounts
          where organization_id=$1 and status='active' and kind='cash'
            and ledger_account_code <> $2
         union
         select code from accounts
          where organization_id=$1 and root_type='asset' and code in ('111', '111-CASH')
       )
       select
         coalesce((
           select sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0))
             from journal_entries j
             join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
            where j.organization_id=$1 and j.state in ('posted','reversed')
              and l.account_code in (select account_code from company_cash_accounts)
         ), 0)::text as company_cash_minor,
         coalesce((
           select sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0))
             from journal_entries j
             join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
            where j.organization_id=$1 and j.state in ('posted','reversed')
              and l.account_code = $2
         ), 0)::text as owner_custody_minor`,
      [organizationId, TARGET_ACCOUNT],
    );

    const beforeCompanyCash = BigInt(balancesRes.rows[0]?.company_cash_minor ?? "0");
    const beforeOwnerCustody = BigInt(balancesRes.rows[0]?.owner_custody_minor ?? "0");
    const beforeTotalCash111 = beforeCompanyCash + beforeOwnerCustody;

    const fa = custodyFa.rows[0];
    if (!fa) {
      const emptyBalances = {
        companyCashMinor: beforeCompanyCash.toString(),
        ownerCustodyCashMinor: beforeOwnerCustody.toString(),
        totalCash111Minor: beforeTotalCash111.toString(),
      };
      const planHash = sha256({ custodyAccountId: null, items: [] });
      return {
        baseCurrency,
        custodyFinancialAccountId: null as string | null,
        custodyAccountBeforeLedgerCode: null as string | null,
        custodyAccountAfterLedgerCode: TARGET_ACCOUNT,
        items: [] as OwnerCustodyMigrationItem[],
        totalDebitMinor: "0",
        totalCreditMinor: "0",
        beforeBalances: emptyBalances,
        afterBalances: emptyBalances,
        planHash,
      };
    }

    const candidates = await client.query<{
      journal_id: string;
      line_number: number;
      journal_date: string;
      currency: string;
      account_code: string;
      debit_minor: string | null;
      credit_minor: string | null;
      source_kind: string;
      source_id: string;
    }>(
      `with migrated as (
         select jl.dimensions->>'ownerCustodyMigrationSourceKey' as src_key
           from journal_entries je
           join journal_lines jl on jl.organization_id=je.organization_id and jl.journal_id=je.id
          where je.organization_id=$1 and je.state='posted' and je.reversal_of_id is null
            and jl.dimensions ? 'ownerCustodyMigrationSourceKey'
       )
       select j.id as journal_id,
              l.line_number,
              j.journal_date::text as journal_date,
              j.currency,
              l.account_code,
              l.debit_minor::text,
              l.credit_minor::text,
              src.source_kind,
              src.source_id
         from journal_entries j
         join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
         join lateral (
           select 'expense'::text as source_kind, e.id as source_id
             from expenses e
            where e.organization_id=$1 and e.journal_id=j.id and e.state='posted'
              and e.funding_financial_account_id=$2
           union all
           select 'purchase_invoice'::text, d.id
             from commercial_documents d
            where d.organization_id=$1 and d.journal_id=j.id and d.type='purchase_invoice'
              and d.state in ('posted','partially_paid','paid')
              and d.funding_financial_account_id=$2
           union all
           select 'internal_transfer'::text, ita.transfer_id
             from internal_transfer_attempts ita
             join internal_transfers it
               on it.organization_id=ita.organization_id and it.id=ita.transfer_id
              and ita.attempt_number=it.current_attempt_number and ita.state='reconciled'
             join bank_transactions bt on bt.organization_id=ita.organization_id
              and bt.id in (ita.incoming_transaction_id, ita.outgoing_transaction_id)
              and bt.financial_account_id=$2
            where ita.organization_id=$1
              and j.id in (ita.outgoing_journal_id, ita.incoming_journal_id)
              and (l.dimensions->>'bankTransactionId' is null or l.dimensions->>'bankTransactionId' = bt.id)
           limit 1
         ) src on true
        where j.organization_id=$1 and j.state='posted' and j.reversal_of_id is null
          and j.currency=$3
          and l.account_code like '111%' and l.account_code <> $4
          and not exists (select 1 from migrated m where m.src_key = (j.id || ':' || l.line_number::text))
        order by j.journal_date asc, j.id asc, l.line_number asc`,
      [organizationId, fa.id, baseCurrency, TARGET_ACCOUNT],
    );

    const items: OwnerCustodyMigrationItem[] = [];
    let totalDebit = 0n;
    let totalCredit = 0n;
    let companyDelta = 0n;
    let custodyDelta = 0n;

    for (const row of candidates.rows) {
      const debit = BigInt(row.debit_minor ?? "0");
      const credit = BigInt(row.credit_minor ?? "0");
      if ((debit === 0n && credit === 0n) || (debit > 0n && credit > 0n)) continue;
      const isInflowToCustody = debit > 0n;
      const amount = isInflowToCustody ? debit : credit;
      const debitAccountCode = isInflowToCustody ? TARGET_ACCOUNT : row.account_code;
      const creditAccountCode = isInflowToCustody ? row.account_code : TARGET_ACCOUNT;
      totalDebit += amount;
      totalCredit += amount;
      companyDelta += isInflowToCustody ? -amount : amount;
      custodyDelta += isInflowToCustody ? amount : -amount;
      items.push({
        sourceKey: `${row.journal_id}:${row.line_number}`,
        sourceJournalId: row.journal_id,
        sourceLineNumber: row.line_number,
        journalDate: row.journal_date,
        currency: row.currency,
        sourceRecordKind: row.source_kind,
        sourceRecordId: row.source_id,
        legacyAccountCode: row.account_code,
        targetAccountCode: TARGET_ACCOUNT,
        debitAccountCode,
        creditAccountCode,
        amountMinor: amount.toString(),
      });
    }

    const afterCompanyCash = beforeCompanyCash + companyDelta;
    const afterOwnerCustody = beforeOwnerCustody + custodyDelta;
    const planHash = sha256({
      custodyAccountId: fa.id,
      custodyAccountBeforeLedgerCode: fa.ledger_account_code,
      items: items.map((i) => ({
        sourceKey: i.sourceKey,
        debitAccountCode: i.debitAccountCode,
        creditAccountCode: i.creditAccountCode,
        amountMinor: i.amountMinor,
      })),
    });

    return {
      baseCurrency,
      custodyFinancialAccountId: fa.id,
      custodyAccountBeforeLedgerCode: fa.ledger_account_code,
      custodyAccountAfterLedgerCode: TARGET_ACCOUNT,
      items,
      totalDebitMinor: totalDebit.toString(),
      totalCreditMinor: totalCredit.toString(),
      beforeBalances: {
        companyCashMinor: beforeCompanyCash.toString(),
        ownerCustodyCashMinor: beforeOwnerCustody.toString(),
        totalCash111Minor: beforeTotalCash111.toString(),
      },
      afterBalances: {
        companyCashMinor: afterCompanyCash.toString(),
        ownerCustodyCashMinor: afterOwnerCustody.toString(),
        totalCash111Minor: (afterCompanyCash + afterOwnerCustody).toString(),
      },
      planHash,
    };
  }

  async dryRun(context: Context, body: OwnerCustodyMigrationDryRunRequest = {}) {
    if (!context.roles.some((r) => READ_ROLES.has(r))) throw new Error("FORBIDDEN");
    if (body.effectiveOn !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(body.effectiveOn.trim())) {
      throw new Error("VALIDATION_FAILED");
    }
    const plan = await this.evaluate(this.pool, context.organizationId);
    return this.envelope(context, {
      dryRun: true,
      mutationCount: 0,
      reclassifiedCount: plan.items.length,
      ...plan,
    });
  }

  async commit(
    context: Context,
    body: OwnerCustodyMigrationCommitRequest,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((r) => WRITE_ROLES.has(r))) throw new Error("FORBIDDEN");
    if (!idempotencyKey?.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const planHash = body.planHash?.trim() ?? "";
    const reason = body.reason?.trim() ?? "";
    const effectiveOnInput = body.effectiveOn?.trim();
    if (
      !planHash ||
      !reason ||
      (effectiveOnInput && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveOnInput))
    ) {
      throw new Error("VALIDATION_FAILED");
    }

    const requestHash = sha256({ planHash, reason, effectiveOn: effectiveOnInput ?? null });
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${context.organizationId}:owner-custody-migration:${idempotencyKey}`,
      ]);
      const replay = await client.query<{
        request_hash: string;
        response_body: Record<string, unknown>;
      }>(
        `select request_hash, response_body from api_idempotency_records
          where organization_id=$1 and idempotency_key=$2 for update`,
        [context.organizationId, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return this.envelope(context, {
          ...replay.rows[0].response_body,
          idempotencyReplayed: true,
        });
      }

      const plan = await this.evaluate(client, context.organizationId);
      if (plan.planHash !== planHash) {
        throw new Error("OWNER_CUSTODY_MIGRATION_PLAN_MISMATCH");
      }

      await client.query(
        `insert into accounts (organization_id, code, name, root_type, is_control_account, allow_manual_posting, is_active)
         values ($1, '111', 'Tiền mặt', 'asset', false, true, true),
                ($1, '111-CASH', 'Quỹ tiền mặt công ty', 'asset', false, true, true),
                ($1, $2, 'Quỹ tiền mặt do chủ giữ', 'asset', false, true, true),
                ($1, '1388', 'Phải thu khác', 'asset', false, true, true),
                ($1, '1388-OWNER', 'Phải thu chủ sở hữu', 'asset', false, true, true)
         on conflict (organization_id, code) do nothing`,
        [context.organizationId, TARGET_ACCOUNT],
      );
      await client.query(
        `insert into account_hierarchy_edges (organization_id, child_code, child_root_type, parent_code, parent_root_type)
         select c.organization_id, c.code, 'asset'::account_root_type, p.code, 'asset'::account_root_type
           from accounts c join accounts p
             on p.organization_id=c.organization_id and p.root_type='asset' and c.root_type='asset'
          where c.organization_id=$1
            and ((c.code=$2 and p.code='111') or (c.code='111-CASH' and p.code='111') or (c.code='1388-OWNER' and p.code='1388'))
         on conflict (organization_id, child_code) do nothing`,
        [context.organizationId, TARGET_ACCOUNT],
      );

      if (plan.custodyFinancialAccountId) {
        await client.query(
          `update financial_accounts
              set ledger_account_code=$3, version=version+1, updated_by=$4, updated_at=now()
            where organization_id=$1 and id=$2 and ledger_account_code <> $3`,
          [context.organizationId, plan.custodyFinancialAccountId, TARGET_ACCOUNT, context.actorId],
        );
      }

      let journalId: string | null = null;
      if (plan.items.length > 0) {
        if (plan.totalDebitMinor !== plan.totalCreditMinor) throw new Error("JOURNAL_UNBALANCED");
        const effectiveDate =
          effectiveOnInput ??
          plan.items.reduce(
            (latest, item) => (item.journalDate > latest ? item.journalDate : latest),
            plan.items[0]!.journalDate,
          );
        const periods = await client.query<{ state: string }>(
          `select state::text from fiscal_periods
            where organization_id=$1 and $2::date between starts_on and ends_on
            order by fiscal_year, period_number limit 2`,
          [context.organizationId, effectiveDate],
        );
        if (periods.rows.length === 0) throw new Error("FISCAL_PERIOD_NOT_FOUND");
        if (periods.rows.length > 1) throw new Error("FISCAL_PERIOD_AMBIGUOUS");
        if (periods.rows[0]!.state === "hard_locked") throw new Error("PERIOD_HARD_LOCKED");

        journalId = randomUUID();
        await client.query(
          `insert into journal_entries
             (organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)
           values ($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,$7,now(),$6)`,
          [
            context.organizationId,
            journalId,
            effectiveDate,
            `Reclassify historical CASH-OWNER-CUSTODY entries to ${TARGET_ACCOUNT}: ${reason}`,
            plan.baseCurrency,
            context.actorId,
            reason,
          ],
        );
        let lineNo = 1;
        for (const item of plan.items) {
          const dims = {
            sourceKind: "owner_custody_ledger_migration",
            ownerCustodyMigrationSourceKey: item.sourceKey,
            sourceJournalId: item.sourceJournalId,
            sourceLineNumber: String(item.sourceLineNumber),
            sourceRecordKind: item.sourceRecordKind,
            sourceRecordId: item.sourceRecordId,
          };
          await client.query(
            `insert into journal_lines
               (organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
             values ($1,$2,$3,$4,$5,null,$6,$7), ($1,$2,$8,$9,null,$5,$6,$10)`,
            [
              context.organizationId,
              journalId,
              lineNo,
              item.debitAccountCode,
              item.amountMinor,
              `Reclassify ${item.sourceRecordKind} ${item.sourceRecordId} (${item.sourceKey})`,
              dims,
              lineNo + 1,
              item.creditAccountCode,
              {
                sourceKind: "owner_custody_ledger_migration_counterpart",
                sourceJournalId: item.sourceJournalId,
              },
            ],
          );
          lineNo += 2;
        }
      }

      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      const responseBody = {
        dryRun: false,
        planHash: plan.planHash,
        journalId,
        reclassifiedCount: plan.items.length,
        totalDebitMinor: plan.totalDebitMinor,
        totalCreditMinor: plan.totalCreditMinor,
        beforeBalances: plan.beforeBalances,
        afterBalances: plan.afterBalances,
        custodyFinancialAccountId: plan.custodyFinancialAccountId,
        custodyAccountBeforeLedgerCode: plan.custodyAccountBeforeLedgerCode,
        custodyAccountAfterLedgerCode: TARGET_ACCOUNT,
        items: plan.items,
        auditEventId,
        outboxEventId,
        idempotencyReplayed: false,
      };
      await client.query(
        `insert into resource_audit_events
           (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values ($1,$2,'owner_custody_ledger_migration',$3,'1','commit',$4,$5,$6,$7)`,
        [
          context.organizationId,
          auditEventId,
          plan.planHash,
          context.actorId,
          context.correlationId,
          plan.beforeBalances,
          { afterBalances: plan.afterBalances, journalId, reason, count: plan.items.length },
        ],
      );
      await client.query(
        `insert into outbox_events
           (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
         values ($1,$2,'owner_custody_ledger_migration',$3,'owner_custody_ledger_migration.committed',1,$4,$5)`,
        [
          context.organizationId,
          outboxEventId,
          journalId ?? plan.planHash,
          { planHash: plan.planHash, journalId, reclassifiedCount: plan.items.length },
          context.correlationId,
        ],
      );
      await client.query(
        `insert into api_idempotency_records
           (organization_id,idempotency_key,operation,request_hash,response_body)
         values ($1,$2,'funding-plans:owner-custody-migration:commit',$3,$4)`,
        [context.organizationId, idempotencyKey, requestHash, responseBody],
      );
      await client.query("commit");
      return this.envelope(context, responseBody);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
