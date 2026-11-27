import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  STATEMENT_DRILLDOWN_DERIVED_LINES,
  STATEMENT_DRILLDOWN_ROOTS,
} from "../payment-evidence/tax-report-enrichment.js";
import {
  buildDirectCashFlow,
  type CashFlowJournal,
  type FinancialLedgerLine,
  type LedgerCutoff,
  type ProfitAndLossSection,
} from "@naai-erp/domain";
import pg from "pg";
import {
  canSelfApprove,
  resolveOrganizationWorkflowPolicy,
} from "../workflow-policy/organization-workflow-policy.service.js";
import type {
  DrilldownQuery,
  FinancialStatementContext,
  StatementQuery,
} from "./financial-statement.types.js";
import { FinancialSourceResolver } from "./financial-source-resolver.js";
import {
  type LedgerRow,
  fingerprint,
  jsonMoney,
  natural,
} from "./pg-financial-statement.store.shared.js";
import {
  createMappingOperation,
  ledgerOperation,
  reportOperation,
} from "./financial-statement-create-mapping.operation.js";
import {
  vatReportOperation,
  expenseExceptionsOperation,
} from "./financial-statement-vat-report.operation.js";

@Injectable()
export class PgFinancialStatementStore {
  readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  constructor(@Inject(FinancialSourceResolver) readonly sourceResolver: FinancialSourceResolver) {}

  async listMappings(c: FinancialStatementContext) {
    const result = await this.pool.query(
      `select v.*,count(l.*)::text line_count from financial_statement_mapping_versions v
       left join financial_statement_mapping_lines l on l.organization_id=v.organization_id and l.mapping_id=v.id and l.mapping_version=v.version
       where v.organization_id=$1 group by v.organization_id,v.id,v.version order by v.framework,v.effective_from desc,v.version desc`,
      [c.organizationId],
    );
    return { items: result.rows };
  }
  async getMapping(c: FinancialStatementContext, id: string, version?: number) {
    const result = await this.pool.query(
      `select v.*,coalesce(json_agg(l order by l.statement,l.display_order,l.line_number) filter (where l.line_number is not null),'[]') lines
       from financial_statement_mapping_versions v left join financial_statement_mapping_lines l
       on l.organization_id=v.organization_id and l.mapping_id=v.id and l.mapping_version=v.version
       where v.organization_id=$1 and v.id=$2 and ($3::int is null or v.version=$3)
       group by v.organization_id,v.id,v.version order by v.version desc limit 1`,
      [c.organizationId, id, version ?? null],
    );
    if (!result.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return result.rows[0];
  }
  createMapping = createMappingOperation;
  async approveMapping(
    c: FinancialStatementContext,
    id: string,
    version: number,
    reason: string,
    key: string,
  ) {
    const operationKey = `financial-statement-mapping:approve:${id}:${version}:${key}`;
    const hash = createHash("sha256").update(JSON.stringify({ id, version, reason })).digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await client.query<{
        request_hash: string;
        response_body: Record<string, unknown>;
      }>(
        `select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update`,
        [c.organizationId, operationKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }
      const workflowPolicy = await resolveOrganizationWorkflowPolicy(c.organizationId, client);
      const selfApproval = canSelfApprove({ policy: workflowPolicy, roles: c.roles });
      const updated = await client.query(
        `update financial_statement_mapping_versions set state='approved',approved_by=$4,approved_at=now(),updated_at=now(),change_reason=change_reason||E'\nApproval: '||$5
         where organization_id=$1 and id=$2 and version=$3 and state='draft' and (created_by<>$4 or $6::boolean) returning id,version,state,approved_at`,
        [c.organizationId, id, version, c.actorId, reason.trim(), selfApproval],
      );
      if (!updated.rows[0]) throw new Error("INVALID_STATE_TRANSITION");
      const response = {
        ...updated.rows[0],
        nextActions: ["use-for-reporting", "create-new-version"],
      };
      await client.query(
        `insert into api_idempotency_records (organization_id,idempotency_key,operation,request_hash,response_body) values ($1,$2,'financial-statement-mapping:approve',$3,$4)`,
        [c.organizationId, operationKey, hash, response],
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

  ledger = ledgerOperation;
  report = reportOperation;
  async currency(organizationId: string) {
    const result = await this.pool.query<{ base_currency: string }>(
      `select base_currency from organizations where id=$1`,
      [organizationId],
    );
    if (!result.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return result.rows[0].base_currency;
  }
  cutoff(rows: LedgerRow[], throughDate: string): LedgerCutoff {
    const maxPostedAt = rows.reduce(
      (max, row) =>
        new Date(row.posted_at).getTime() > max.getTime() ? new Date(row.posted_at) : max,
      new Date("1970-01-01T00:00:00.000Z"),
    );
    return {
      throughDate,
      maxPostedAt: maxPostedAt.toISOString(),
      journalCount: new Set(rows.map((r) => r.journal_id)).size,
      lineCount: rows.length,
      sourceFingerprint: fingerprint(rows),
    };
  }
  domainLines(
    c: FinancialStatementContext,
    rows: LedgerRow[],
    mapping: { id: string; version: number },
  ): FinancialLedgerLine[] {
    const pnl = (code: string | null): ProfitAndLossSection | undefined =>
      (
        ({
          revenue: "revenue",
          direct_cost: "direct_cost",
          opex: "operating_expense",
          operating_expense: "operating_expense",
          other_income: "other_income",
          other_expense: "other_expense",
          tax_expense: "income_tax",
          income_tax: "income_tax",
        }) as Record<string, ProfitAndLossSection>
      )[code ?? ""];
    return rows.map((row) => {
      const pnlSection = pnl(row.line_code);
      return {
        id: `${row.journal_id}:${row.line_number}`,
        organizationId: c.organizationId,
        journalId: row.journal_id,
        entryDate: row.journal_date,
        accountId: row.account_code,
        accountName: row.account_name,
        rootType: row.root_type,
        debitMinor: BigInt(row.debit_minor ?? "0"),
        creditMinor: BigInt(row.credit_minor ?? "0"),
        ...(row.line_description ? { description: row.line_description } : {}),
        sourceId: row.journal_id,
        sourceType: "journal_entry",
        dimensions: row.dimensions ?? {},
        ...(pnlSection ? { pnlSection } : {}),
        ...(row.line_code ? { mappingVersionId: `${mapping.id}:${mapping.version}` } : {}),
      };
    });
  }
  async cashFlow(
    c: FinancialStatementContext,
    rows: LedgerRow[],
    mapping: { id: string; version: number },
    q: StatementQuery,
  ) {
    const cashResult = await this.pool.query<{ ledger_account_code: string }>(
      `select distinct ledger_account_code from financial_accounts where organization_id=$1 and status='active'`,
      [c.organizationId],
    );
    const cashAccounts = new Set(cashResult.rows.map((r) => r.ledger_account_code));
    const journals = new Map<string, LedgerRow[]>();
    for (const row of rows)
      journals.set(row.journal_id, [...(journals.get(row.journal_id) ?? []), row]);
    const domainLines = this.domainLines(c, rows, mapping);
    const domainById = new Map(domainLines.map((line) => [line.id, line]));
    const domainJournals: CashFlowJournal[] = [];
    for (const [journalId, journalRows] of journals) {
      const cash = journalRows.filter((r) => cashAccounts.has(r.account_code));
      if (!cash.length) continue;
      const counterparts = journalRows.filter((r) => !cashAccounts.has(r.account_code));
      if (!counterparts.length) {
        domainJournals.push({
          journalId,
          entryDate: journalRows[0]!.journal_date,
          sourceId: journalId,
          sourceKind: "internal_transfer",
          classification: "internal_transfer",
          mappingVersionId: `${mapping.id}:${mapping.version}`,
          lines: journalRows.map((r) => domainById.get(`${r.journal_id}:${r.line_number}`)!),
        });
        continue;
      }
      const classes = [
        ...new Set(counterparts.map((r) => r.cash_flow_class).filter((x) => x && x !== "non_cash")),
      ];
      const classification =
        classes.length === 1 && ["operating", "investing", "financing"].includes(classes[0] ?? "")
          ? (classes[0] as "operating" | "investing" | "financing")
          : "unclassified";
      domainJournals.push({
        journalId,
        entryDate: journalRows[0]!.journal_date,
        sourceId: journalId,
        sourceKind: classification === "financing" ? "other" : "other",
        classification,
        ...(classification !== "unclassified"
          ? { mappingVersionId: `${mapping.id}:${mapping.version}` }
          : {}),
        lines: journalRows.map((r) => domainById.get(`${r.journal_id}:${r.line_number}`)!),
      });
    }
    const openingCashMinor = rows
      .filter((row) => cashAccounts.has(row.account_code) && row.journal_date < q.startsOn!)
      .reduce(
        (sum, row) => sum + BigInt(row.debit_minor ?? "0") - BigInt(row.credit_minor ?? "0"),
        0n,
      );
    const periodCashMovementMinor = rows
      .filter(
        (row) =>
          cashAccounts.has(row.account_code) &&
          row.journal_date >= q.startsOn! &&
          row.journal_date <= q.endsOn,
      )
      .reduce(
        (sum, row) => sum + BigInt(row.debit_minor ?? "0") - BigInt(row.credit_minor ?? "0"),
        0n,
      );
    return jsonMoney(
      buildDirectCashFlow({
        organizationId: c.organizationId,
        currency: await this.currency(c.organizationId),
        startsOn: q.startsOn!,
        endsOn: q.endsOn,
        ledgerCutoff: this.cutoff(rows, q.endsOn),
        cashAccountIds: [...cashAccounts],
        openingCashMinor,
        expectedClosingCashMinor: openingCashMinor + periodCashMovementMinor,
        journals: domainJournals,
      }),
    );
  }
  async vatControls(c: FinancialStatementContext, q: StatementQuery) {
    const result = await this.pool.query<{ unreviewed: string; missing_evidence: string }>(
      `select count(*) filter (where l.vat_minor>0 and l.vat_state='unreviewed')::text unreviewed,
        count(distinct e.id) filter (where e.vat_minor>0
          and not exists (select 1 from evidence_records r where r.organization_id=e.organization_id and r.subject_type='expense' and r.subject_id=e.id)
          and not exists (select 1 from external_references xr where xr.organization_id=e.organization_id and xr.expense_id=e.id))::text missing_evidence
       from expense_lines l join expenses e on e.organization_id=l.organization_id and e.id=l.expense_id
       where l.organization_id=$1 and e.expense_class<>'owner_personal' and e.expense_date between $2::date and $3::date and e.created_at <= $4::timestamptz`,
      [c.organizationId, q.startsOn, q.endsOn, q.asOfInstant],
    );
    return {
      unreviewedExpenseLineCount: result.rows[0]?.unreviewed ?? "0",
      missingEvidenceExpenseCount: result.rows[0]?.missing_evidence ?? "0",
    };
  }
  vatReport = vatReportOperation;
  async drilldown(c: FinancialStatementContext, q: DrilldownQuery) {
    const loaded = await this.ledger(c, q.statement, q);
    const accepted = new Set(STATEMENT_DRILLDOWN_DERIVED_LINES[q.lineCode] ?? [q.lineCode]);
    const roots = new Set(STATEMENT_DRILLDOWN_ROOTS[q.lineCode] ?? []);
    const sourceRows = loaded.rows
      .filter(
        (r) =>
          roots.has(r.root_type) ||
          accepted.has(r.line_code ?? "") ||
          r.account_code === q.lineCode ||
          (q.statement === "cash_flow" && accepted.has(r.cash_flow_class ?? "")),
      )
      .map((r) => ({
        raw: r,
        amountMinor: (natural(r) * BigInt(r.sign ?? 1)).toString(),
      }));
    const rows = await Promise.all(
      sourceRows.map(async ({ raw: r, amountMinor }) => ({
        journalId: r.journal_id,
        journalVersion: r.journal_version,
        journalDate: r.journal_date,
        postedAt: r.posted_at,
        lineNumber: r.line_number,
        accountCode: r.account_code,
        accountName: r.account_name,
        debitMinor: r.debit_minor ?? "0",
        creditMinor: r.credit_minor ?? "0",
        amountMinor,
        dimensions: r.dimensions,
        sourceId: r.journal_id,
        sourceType: "journal_entry",
        refs: (await this.sourceResolver.resolve(c, r.journal_id, r.line_number, amountMinor)).refs,
      })),
    );
    return {
      statement: q.statement,
      lineCode: q.lineCode,
      mappingVersion: loaded.mapping,
      items: rows,
      sourceFingerprint: fingerprint(loaded.rows),
      count: rows.length,
    };
  }
  resolveSource(c: FinancialStatementContext, journalId: string, lineNumber: number) {
    return this.sourceResolver.resolve(c, journalId, lineNumber);
  }
  expenseExceptions = expenseExceptionsOperation;
}
