import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg from "pg";
import type {
  LedgerReportContext,
  OpeningBalanceInput,
  ReportRange,
} from "./ledger-report.types.js";

@Injectable()
export class PgLedgerReportStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async trialBalance(organizationId: string, range: ReportRange) {
    const result = await this.pool.query(
      `select a.code account_code,a.name account_name,a.root_type,
        coalesce(sum(l.debit_minor) filter (where $2::date is not null and j.journal_date < $2::date),0)::text opening_debit_minor,
        coalesce(sum(l.credit_minor) filter (where $2::date is not null and j.journal_date < $2::date),0)::text opening_credit_minor,
        coalesce(sum(l.debit_minor) filter (where $2::date is null or j.journal_date >= $2::date),0)::text period_debit_minor,
        coalesce(sum(l.credit_minor) filter (where $2::date is null or j.journal_date >= $2::date),0)::text period_credit_minor,
        (coalesce(sum(l.debit_minor),0)-coalesce(sum(l.credit_minor),0))::text closing_net_minor,
        count(l.*) filter (where $2::date is null or j.journal_date >= $2::date)::text line_count
       from accounts a join journal_lines l on l.organization_id=a.organization_id and l.account_code=a.code
       join journal_entries j on j.organization_id=l.organization_id and j.id=l.journal_id
       where a.organization_id=$1
         and j.state in ('posted','reversed')
         and ($3::date is null or j.journal_date <= $3::date)
       group by a.code,a.name,a.root_type
       order by a.code`,
      [organizationId, range.from ?? null, range.to ?? null],
    );
    const rows = result.rows.map((row) => {
      const openingNet = BigInt(row.opening_debit_minor) - BigInt(row.opening_credit_minor);
      const closingNet = BigInt(row.closing_net_minor);
      return {
        accountCode: row.account_code,
        accountName: row.account_name,
        rootType: row.root_type,
        openingDebitMinor: (openingNet > 0n ? openingNet : 0n).toString(),
        openingCreditMinor: (openingNet < 0n ? -openingNet : 0n).toString(),
        periodDebitMinor: row.period_debit_minor,
        periodCreditMinor: row.period_credit_minor,
        closingDebitMinor: (closingNet > 0n ? closingNet : 0n).toString(),
        closingCreditMinor: (closingNet < 0n ? -closingNet : 0n).toString(),
        closingNetMinor: closingNet.toString(),
        lineCount: row.line_count,
        drillDown: { report: "general-ledger", accountCode: row.account_code },
      };
    });
    const total = (field: keyof (typeof rows)[number]) =>
      rows.reduce((sum, row) => sum + BigInt(String(row[field])), 0n);
    const openingDebit = total("openingDebitMinor");
    const openingCredit = total("openingCreditMinor");
    const periodDebit = total("periodDebitMinor");
    const periodCredit = total("periodCreditMinor");
    const closingDebit = total("closingDebitMinor");
    const closingCredit = total("closingCreditMinor");
    return {
      range: { from: range.from ?? null, to: range.to ?? null },
      rows,
      totals: {
        openingDebitMinor: openingDebit.toString(),
        openingCreditMinor: openingCredit.toString(),
        periodDebitMinor: periodDebit.toString(),
        periodCreditMinor: periodCredit.toString(),
        closingDebitMinor: closingDebit.toString(),
        closingCreditMinor: closingCredit.toString(),
        differenceMinor: (closingDebit - closingCredit).toString(),
      },
      balanced:
        openingDebit === openingCredit &&
        periodDebit === periodCredit &&
        closingDebit === closingCredit,
      source: "posted-ledger",
    };
  }

  async generalLedger(organizationId: string, range: ReportRange) {
    const opening = await this.pool.query<{ opening_balance_minor: string }>(
      `select coalesce(sum(coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0)),0)::text opening_balance_minor
       from journal_entries j join journal_lines l
         on l.organization_id=j.organization_id and l.journal_id=j.id
       where j.organization_id=$1 and j.state in ('posted','reversed')
         and $2::date is not null and j.journal_date < $2::date
         and ($3::text is null or l.account_code=$3)`,
      [organizationId, range.from ?? null, range.accountCode ?? null],
    );
    const result = await this.pool.query(
      `select j.id journal_id,j.journal_date::text,j.description journal_description,
        l.line_number,l.account_code,a.name account_name,l.description line_description,
        l.debit_minor::text,l.credit_minor::text,l.dimensions,j.version::text journal_version,
        j.state journal_state,j.reversal_of_id,j.replacement_of_id,j.posted_at
       from journal_entries j join journal_lines l
         on l.organization_id=j.organization_id and l.journal_id=j.id
       join accounts a on a.organization_id=l.organization_id and a.code=l.account_code
       where j.organization_id=$1 and j.state in ('posted','reversed')
         and ($2::date is null or j.journal_date >= $2::date)
         and ($3::date is null or j.journal_date <= $3::date)
         and ($4::text is null or l.account_code=$4)
       order by j.journal_date,j.id,l.line_number`,
      [organizationId, range.from ?? null, range.to ?? null, range.accountCode ?? null],
    );
    const openingBalance = BigInt(opening.rows[0]?.opening_balance_minor ?? "0");
    let running = openingBalance;
    return {
      range: { from: range.from ?? null, to: range.to ?? null },
      accountCode: range.accountCode ?? null,
      openingBalanceMinor: openingBalance.toString(),
      rows: result.rows.map((row) => {
        running += BigInt(row.debit_minor ?? "0") - BigInt(row.credit_minor ?? "0");
        return {
          journalId: row.journal_id,
          journalDate: row.journal_date,
          journalDescription: row.journal_description,
          lineNumber: row.line_number,
          accountCode: row.account_code,
          accountName: row.account_name,
          lineDescription: row.line_description,
          debitMinor: row.debit_minor,
          creditMinor: row.credit_minor,
          dimensions: row.dimensions,
          journalVersion: row.journal_version,
          journalState: row.journal_state,
          reversalOfId: row.reversal_of_id,
          replacementOfId: row.replacement_of_id,
          postedAt: row.posted_at,
          runningBalanceMinor: running.toString(),
        };
      }),
      closingBalanceMinor: running.toString(),
      source: "posted-ledger",
    };
  }

  async inspectControlAccounts(organizationId: string, accountCodes: readonly string[]) {
    const result = await this.pool.query<{
      code: string;
      is_control_account: boolean;
      is_active: boolean;
    }>(
      `select code,is_control_account,is_active from accounts where organization_id=$1 and code=any($2::text[])`,
      [organizationId, accountCodes],
    );
    return result.rows;
  }

  async listOpeningBalances(organizationId: string) {
    const result = await this.pool.query(
      `select i.*,j.state journal_state,j.version::text journal_version
       from opening_balance_imports i join journal_entries j
         on j.organization_id=i.organization_id and j.id=i.journal_id
       where i.organization_id=$1 order by i.opening_date,i.id`,
      [organizationId],
    );
    return result.rows;
  }

  async getOpeningBalance(organizationId: string, importId: string) {
    const result = await this.pool.query(
      `select i.*,j.state journal_state,j.version::text journal_version,
        coalesce(json_agg(l order by l.line_number) filter (where l.line_number is not null),'[]') lines
       from opening_balance_imports i join journal_entries j
         on j.organization_id=i.organization_id and j.id=i.journal_id
       left join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
       where i.organization_id=$1 and i.id=$2
       group by i.organization_id,i.id,j.organization_id,j.id`,
      [organizationId, importId],
    );
    return result.rows[0];
  }

  async createOpeningBalance(
    context: LedgerReportContext,
    input: OpeningBalanceInput,
    idempotencyKey: string,
  ) {
    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `${context.organizationId}:opening-balance:${idempotencyKey}`,
      ]);
      const replay = await client.query<{
        request_hash: string;
        response_body: Record<string, unknown>;
      }>(
        `select request_hash,response_body from api_idempotency_records
         where organization_id=$1 and idempotency_key=$2 for update`,
        [context.organizationId, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }
      const importId = input.importId ?? randomUUID();
      const journalId = randomUUID();
      await client.query(
        `insert into journal_entries
         (organization_id,id,journal_date,description,currency,state,created_by)
         values ($1,$2,$3,$4,$5,'draft',$6)`,
        [
          context.organizationId,
          journalId,
          input.openingDate,
          input.description,
          input.currency,
          context.actorId,
        ],
      );
      for (const [index, line] of input.lines.entries()) {
        await client.query(
          `insert into journal_lines
           (organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            context.organizationId,
            journalId,
            index + 1,
            line.accountCode,
            line.debitMinor ?? null,
            line.creditMinor ?? null,
            line.description ?? null,
            line.dimensions ?? {},
          ],
        );
      }
      await client.query(
        `insert into opening_balance_imports
         (organization_id,id,journal_id,opening_date,currency,control_debit_minor,control_credit_minor,status,created_by,correlation_id)
         values ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9)`,
        [
          context.organizationId,
          importId,
          journalId,
          input.openingDate,
          input.currency,
          input.controlDebitMinor,
          input.controlCreditMinor,
          context.actorId,
          context.correlationId,
        ],
      );
      const auditEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
         values ($1,$2,'opening_balance_import',$3,1,'create',$4,$5,$6)`,
        [
          context.organizationId,
          auditEventId,
          importId,
          context.actorId,
          context.correlationId,
          {
            status: "draft",
            journalId,
            controlDebitMinor: input.controlDebitMinor,
            controlCreditMinor: input.controlCreditMinor,
          },
        ],
      );
      const response = {
        importId,
        journalId,
        status: "draft",
        resourceVersion: "1",
        auditEventId,
        nextActions: ["approve-journal", "post-journal"],
      };
      await client.query(
        `insert into api_idempotency_records
         (organization_id,idempotency_key,operation,request_hash,response_body)
         values ($1,$2,'opening-balance:create',$3,$4)`,
        [context.organizationId, idempotencyKey, requestHash, response],
      );
      await client.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
