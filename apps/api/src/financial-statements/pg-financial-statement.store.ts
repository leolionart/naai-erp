import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  buildBalanceSheet,
  buildDirectCashFlow,
  buildProfitAndLoss,
  buildTaxExpenseReview,
  buildVatReconciliation,
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
  MappingInput,
  StatementKind,
  StatementQuery,
} from "./financial-statement.types.js";
import { FinancialSourceResolver } from "./financial-source-resolver.js";

type LedgerRow = {
  journal_id: string;
  journal_version: string;
  journal_date: string;
  posted_at: string;
  line_number: number;
  account_code: string;
  account_name: string;
  root_type: "asset" | "liability" | "equity" | "revenue" | "expense";
  debit_minor: string | null;
  credit_minor: string | null;
  dimensions: Record<string, string>;
  line_code: string | null;
  label: string | null;
  display_order: number | null;
  sign: number | null;
  cash_flow_class: string | null;
  vat_treatment: string | null;
  line_description?: string | null;
};

const fingerprint = (rows: readonly LedgerRow[]) =>
  createHash("sha256")
    .update(
      rows
        .map((r) => `${r.journal_id}:${r.journal_version}:${r.posted_at}`)
        .sort()
        .join("|"),
    )
    .digest("hex");
const matchesDimensions = (row: LedgerRow, dimensions: Record<string, string>) =>
  Object.entries(dimensions).every(([key, value]) => row.dimensions?.[key] === value);
const natural = (row: LedgerRow) => {
  const debit = BigInt(row.debit_minor ?? "0");
  const credit = BigInt(row.credit_minor ?? "0");
  return ["liability", "equity", "revenue"].includes(row.root_type)
    ? credit - debit
    : debit - credit;
};
const jsonMoney = (value: unknown): unknown =>
  typeof value === "bigint"
    ? value.toString()
    : Array.isArray(value)
      ? value.map(jsonMoney)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonMoney(item)]))
        : value;

@Injectable()
export class PgFinancialStatementStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  constructor(
    @Inject(FinancialSourceResolver) private readonly sourceResolver: FinancialSourceResolver,
  ) {}

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
  async createMapping(c: FinancialStatementContext, input: MappingInput, key: string) {
    const operationKey = `financial-statement-mapping:create:${key}`;
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${c.organizationId}:${operationKey}`,
      ]);
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
      const id = input.id ?? randomUUID();
      const next =
        input.version ??
        Number(
          (
            await client.query<{ version: number }>(
              `select coalesce(max(version),0)+1 version from financial_statement_mapping_versions where organization_id=$1 and id=$2`,
              [c.organizationId, id],
            )
          ).rows[0]?.version ?? 1,
        );
      await client.query(
        `insert into financial_statement_mapping_versions
         (organization_id,id,version,framework,state,effective_from,effective_to,change_reason,report_policy,created_by)
         values ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9)`,
        [
          c.organizationId,
          id,
          next,
          input.framework,
          input.effectiveFrom,
          input.effectiveTo ?? null,
          input.changeReason.trim(),
          input.reportPolicy ?? {
            maxLedgerDifferenceMinor: "0",
            maxUnreviewedInputMinor: "0",
            maxUnresolvedItemCount: 0,
            maxMissingEvidenceCount: 0,
          },
          c.actorId,
        ],
      );
      for (const [index, line] of input.lines.entries())
        await client.query(
          `insert into financial_statement_mapping_lines
         (organization_id,mapping_id,mapping_version,line_number,statement,line_code,label,account_code,display_order,sign,cash_flow_class,vat_treatment)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            c.organizationId,
            id,
            next,
            index + 1,
            line.statement,
            line.lineCode,
            line.label,
            line.accountCode,
            line.displayOrder,
            line.sign ?? 1,
            line.cashFlowClass ?? null,
            line.vatTreatment ?? null,
          ],
        );
      const response = {
        id,
        version: next,
        state: "draft",
        lineCount: input.lines.length,
        nextActions: ["approve"],
      };
      await client.query(
        `insert into api_idempotency_records (organization_id,idempotency_key,operation,request_hash,response_body) values ($1,$2,'financial-statement-mapping:create',$3,$4)`,
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

  private async ledger(c: FinancialStatementContext, kind: StatementKind, q: StatementQuery) {
    const workflow = await this.pool.query<{ operating_mode: "controlled" | "solopreneur" }>(
      `select operating_mode from accounting_workflow_policies where organization_id=$1`,
      [c.organizationId],
    );
    const solopreneur = workflow.rows[0]?.operating_mode === "solopreneur";
    const mapping = await this.pool.query<{
      id: string;
      version: number;
      state: "draft" | "approved";
      report_policy: {
        maxLedgerDifferenceMinor: string;
        maxUnreviewedInputMinor: string;
        maxUnresolvedItemCount: number;
        maxMissingEvidenceCount: number;
      };
    }>(
      `select id,version,state,report_policy from financial_statement_mapping_versions where organization_id=$1 and framework=$2
       and (state='approved' or $5::boolean)
       and effective_from <= $3::date and (effective_to is null or effective_to >= coalesce($4::date,$3::date))
       order by (state='approved') desc,effective_from desc,version desc limit 1`,
      [c.organizationId, q.framework, q.endsOn, q.startsOn ?? null, solopreneur],
    );
    if (!mapping.rows[0] && !solopreneur) throw new Error("REPORT_MAPPING_NOT_FOUND");
    const selected =
      mapping.rows[0] ??
      ({
        id: "canonical-unmapped",
        version: 0,
        state: "draft",
        report_policy: {
          maxLedgerDifferenceMinor: "0",
          maxUnreviewedInputMinor: "0",
          maxUnresolvedItemCount: 0,
          maxMissingEvidenceCount: 0,
        },
      } as const);
    const result = await this.pool.query<LedgerRow>(
      `select j.id journal_id,j.version::text journal_version,j.journal_date::text,j.posted_at::text,
        l.line_number,l.account_code,a.name account_name,a.root_type,l.debit_minor::text,l.credit_minor::text,l.dimensions,l.description line_description,
        m.line_code,m.label,m.display_order,m.sign,m.cash_flow_class,m.vat_treatment
       from journal_entries j join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
       join accounts a on a.organization_id=l.organization_id and a.code=l.account_code
       left join financial_statement_mapping_lines m on m.organization_id=l.organization_id and m.mapping_id=$5 and m.mapping_version=$6 and m.account_code=l.account_code and m.statement=$7
       where j.organization_id=$1 and j.state in ('posted','reversed') and j.posted_at <= $2::timestamptz
         and j.journal_date <= $3::date and ($4::date is null or j.journal_date >= $4::date)
       order by j.journal_date,j.id,l.line_number`,
      [
        c.organizationId,
        q.asOfInstant,
        q.endsOn,
        kind === "balance_sheet" || kind === "cash_flow" ? null : (q.startsOn ?? null),
        selected.version > 0 ? selected.id : null,
        selected.version > 0 ? selected.version : null,
        kind,
      ],
    );
    return {
      mapping: selected,
      reportWarnings: [
        ...(selected.version === 0 ? ["financial_statement_mapping_missing"] : []),
        ...(selected.version > 0 && selected.state !== "approved"
          ? ["financial_statement_mapping_unapproved"]
          : []),
      ],
      rows: result.rows.filter((r) => matchesDimensions(r, q.dimensions)),
    };
  }
  async report(c: FinancialStatementContext, kind: StatementKind, q: StatementQuery) {
    const loaded = await this.ledger(c, kind, q);
    if (kind === "cash_flow")
      return {
        ...((await this.cashFlow(c, loaded.rows, loaded.mapping, q)) as Record<string, unknown>),
        reportWarnings: loaded.reportWarnings,
      };
    const currency = await this.currency(c.organizationId);
    const cutoff = this.cutoff(loaded.rows, q.endsOn);
    const domainLines = this.domainLines(c, loaded.rows, loaded.mapping);
    if (kind === "profit_and_loss")
      return {
        ...(jsonMoney(
          buildProfitAndLoss({
            organizationId: c.organizationId,
            currency,
            startsOn: q.startsOn!,
            endsOn: q.endsOn,
            ledgerCutoff: cutoff,
            lines: domainLines,
          }),
        ) as Record<string, unknown>),
        mappingVersion: loaded.mapping,
        reportWarnings: loaded.reportWarnings,
      };
    if (kind === "balance_sheet")
      return {
        ...(jsonMoney(
          buildBalanceSheet({
            organizationId: c.organizationId,
            currency,
            asOfDate: q.endsOn,
            ledgerCutoff: cutoff,
            lines: domainLines,
          }),
        ) as Record<string, unknown>),
        mappingVersion: loaded.mapping,
        reportWarnings: loaded.reportWarnings,
      };
    if (kind === "vat_reconciliation")
      return {
        ...((await this.vatReport(c, q, loaded.rows, loaded.mapping)) as Record<string, unknown>),
        reportWarnings: loaded.reportWarnings,
      };
    const grouped = new Map<
      string,
      {
        lineCode: string;
        label: string;
        displayOrder: number;
        amount: bigint;
        sourceLineIds: string[];
      }
    >();
    const unmapped = new Set<string>();
    for (const row of loaded.rows) {
      if (!row.line_code) {
        unmapped.add(row.account_code);
        continue;
      }
      const current = grouped.get(row.line_code) ?? {
        lineCode: row.line_code,
        label: row.label ?? row.line_code,
        displayOrder: row.display_order ?? 0,
        amount: 0n,
        sourceLineIds: [],
      };
      current.amount += natural(row) * BigInt(row.sign ?? 1);
      current.sourceLineIds.push(`${row.journal_id}:${row.line_number}`);
      grouped.set(row.line_code, current);
    }
    const lines = [...grouped.values()]
      .sort((a, b) => a.displayOrder - b.displayOrder || a.lineCode.localeCompare(b.lineCode))
      .map((x) => ({
        ...x,
        amountMinor: x.amount.toString(),
        sourceLineCount: x.sourceLineIds.length,
        drillDown: { statement: kind, lineCode: x.lineCode },
      }));
    const total = lines.reduce((sum, x) => sum + BigInt(x.amountMinor), 0n);
    const common = {
      statement: kind,
      basis: q.basis,
      range: { startsOn: q.startsOn ?? null, endsOn: q.endsOn },
      asOfInstant: q.asOfInstant,
      framework: q.framework,
      mappingVersion: loaded.mapping,
      lines,
      totalMinor: total.toString(),
      unmappedAccountCodes: [...unmapped].sort(),
      sourceFingerprint: fingerprint(loaded.rows),
      sourceLineCount: loaded.rows.length,
    };
    return { ...common, final: unmapped.size === 0 };
  }
  private async currency(organizationId: string) {
    const result = await this.pool.query<{ base_currency: string }>(
      `select base_currency from organizations where id=$1`,
      [organizationId],
    );
    if (!result.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return result.rows[0].base_currency;
  }
  private cutoff(rows: LedgerRow[], throughDate: string): LedgerCutoff {
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
  private domainLines(
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
  private async cashFlow(
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
  private async vatControls(c: FinancialStatementContext, q: StatementQuery) {
    const result = await this.pool.query<{ unreviewed: string; missing_evidence: string }>(
      `select count(*) filter (where l.vat_minor>0 and l.vat_state='unreviewed')::text unreviewed,
        count(distinct e.id) filter (where e.vat_minor>0
          and not exists (select 1 from evidence_records r where r.organization_id=e.organization_id and r.subject_type='expense' and r.subject_id=e.id)
          and not exists (select 1 from external_references xr where xr.organization_id=e.organization_id and xr.expense_id=e.id))::text missing_evidence
       from expense_lines l join expenses e on e.organization_id=l.organization_id and e.id=l.expense_id
       where l.organization_id=$1 and e.expense_date between $2::date and $3::date and e.created_at <= $4::timestamptz`,
      [c.organizationId, q.startsOn, q.endsOn, q.asOfInstant],
    );
    return {
      unreviewedExpenseLineCount: result.rows[0]?.unreviewed ?? "0",
      missingEvidenceExpenseCount: result.rows[0]?.missing_evidence ?? "0",
    };
  }
  private async vatReport(
    c: FinancialStatementContext,
    q: StatementQuery,
    ledgerRows: LedgerRow[],
    mapping: {
      id: string;
      version: number;
      report_policy: {
        maxLedgerDifferenceMinor: string;
        maxUnreviewedInputMinor: string;
        maxUnresolvedItemCount: number;
        maxMissingEvidenceCount: number;
      };
    },
  ) {
    const source = await this.pool.query(
      `select concat('document:',d.id,':',l.line_number) id,d.id source_id,
        case when d.type='credit_note' and original.type='purchase_invoice' then 'purchase_credit_note'
             when d.type='credit_note' then 'sales_credit_note' else d.type::text end source_type,
        case when d.type='sales_invoice' or (d.type='credit_note' and original.type='sales_invoice') then 'output' else 'input' end tax_kind,
        l.tax_minor::text tax_minor,case when d.type='credit_note' then 'reversal' else 'normal' end direction,
        case when d.type='purchase_invoice' or (d.type='credit_note' and original.type='purchase_invoice') then l.vat_state::text else null::text end review_state,
        case when d.type='purchase_invoice' or (d.type='credit_note' and original.type='purchase_invoice') then l.vat_eligible_minor::text else null::text end eligible_minor,
        l.reviewed_by reviewer_id,l.review_reason,l.review_reference review_reference_id,l.tax_code,
        exists(select 1 from tax_code_versions t where t.organization_id=d.organization_id and t.code=l.tax_code and t.review_state='accountant_approved' and t.effective_from<=d.document_date and (t.effective_to is null or t.effective_to>=d.document_date)) tax_code_approved,
        d.journal_id is not null posted_to_ledger,d.journal_id,
        case when l.tax_minor>0 then array['source_document']::text[] else array[]::text[] end required_evidence_types,
        case when l.tax_minor>0 then array['source_document']::text[] else array[]::text[] end present_evidence_types
       from commercial_documents d join commercial_document_lines l on l.organization_id=d.organization_id and l.document_id=d.id
       left join commercial_documents original on original.organization_id=d.organization_id and original.id=d.original_document_id
       where d.organization_id=$1 and d.state<>'cancelled' and d.document_date between $2::date and $3::date and d.created_at <= $4::timestamptz and l.tax_minor>0
       union all
       select concat('expense:',e.id,':',l.line_number),e.id,'expense','input',l.vat_minor::text,'normal',l.vat_state::text,l.vat_eligible_minor::text,
        l.reviewed_by,l.review_reason,l.review_reference,null::text,true,e.journal_id is not null,e.journal_id,
        array['source_document']::text[],case when exists(select 1 from evidence_records r where r.organization_id=e.organization_id and r.subject_type='expense' and r.subject_id=e.id) or exists(select 1 from external_references xr where xr.organization_id=e.organization_id and xr.expense_id=e.id) then array['source_document']::text[] else array[]::text[] end
       from expenses e join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id
       where e.organization_id=$1 and e.state<>'reversed' and e.expense_date between $2::date and $3::date and e.created_at <= $4::timestamptz and l.vat_minor>0`,
      [c.organizationId, q.startsOn, q.endsOn, q.asOfInstant],
    );
    const items = source.rows.map((r) => ({
      id: r.id,
      sourceId: r.source_id,
      sourceType: r.source_type,
      taxKind: r.tax_kind,
      taxMinor: BigInt(r.tax_minor),
      direction: r.direction,
      ...(r.review_state ? { reviewState: r.review_state } : {}),
      ...(r.review_state && r.review_state !== "unreviewed"
        ? { eligibleMinor: BigInt(r.eligible_minor ?? "0") }
        : {}),
      ...(r.reviewer_id ? { reviewerId: r.reviewer_id } : {}),
      ...(r.review_reason ? { reviewReason: r.review_reason } : {}),
      ...(r.review_reference_id ? { reviewReferenceId: r.review_reference_id } : {}),
      ...(r.tax_code ? { taxCode: r.tax_code } : {}),
      taxCodeApproved: r.tax_code_approved,
      postedToLedger: r.posted_to_ledger,
      ...(r.journal_id ? { journalId: r.journal_id } : {}),
      requiredEvidenceTypes: r.required_evidence_types,
      presentEvidenceTypes: r.present_evidence_types,
    }));
    const outputLedger = ledgerRows
      .filter((r) => r.vat_treatment === "output")
      .reduce((s, r) => s + natural(r) * BigInt(r.sign ?? 1), 0n);
    const inputLedger = ledgerRows
      .filter((r) => ["input_eligible", "input_ineligible"].includes(r.vat_treatment ?? ""))
      .reduce((s, r) => s + natural(r) * BigInt(r.sign ?? 1), 0n);
    return jsonMoney(
      buildVatReconciliation({
        organizationId: c.organizationId,
        currency: await this.currency(c.organizationId),
        startsOn: q.startsOn!,
        endsOn: q.endsOn,
        policy: {
          id: mapping.id,
          version: mapping.version,
          maxLedgerDifferenceMinor: BigInt(mapping.report_policy.maxLedgerDifferenceMinor),
          maxUnreviewedInputMinor: BigInt(mapping.report_policy.maxUnreviewedInputMinor),
          maxUnresolvedItemCount: mapping.report_policy.maxUnresolvedItemCount,
          maxMissingEvidenceCount: mapping.report_policy.maxMissingEvidenceCount,
        },
        outputVatLedgerMinor: outputLedger,
        inputVatLedgerMinor: inputLedger,
        items,
      }),
    );
  }
  async drilldown(c: FinancialStatementContext, q: DrilldownQuery) {
    const loaded = await this.ledger(c, q.statement, q);
    const derived: Record<string, readonly string[]> = {
      gross_profit: ["revenue", "direct_cost"],
      operating_profit: ["revenue", "direct_cost", "opex", "operating_expense"],
      profit_before_tax: [
        "revenue",
        "direct_cost",
        "opex",
        "operating_expense",
        "other_income",
        "other_expense",
      ],
      net_profit: [
        "revenue",
        "direct_cost",
        "opex",
        "operating_expense",
        "other_income",
        "other_expense",
        "tax_expense",
        "income_tax",
      ],
    };
    const accepted = new Set(derived[q.lineCode] ?? [q.lineCode]);
    const acceptedRoots: Record<string, readonly LedgerRow["root_type"][]> = {
      assets: ["asset"],
      liabilities: ["liability"],
      ledger_equity: ["equity"],
      unclosed_earnings: ["revenue", "expense"],
      total_equity: ["equity", "revenue", "expense"],
      liabilities_and_equity: ["liability", "equity", "revenue", "expense"],
    };
    const roots = new Set(acceptedRoots[q.lineCode] ?? []);
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
  async expenseExceptions(c: FinancialStatementContext, q: StatementQuery, _state?: string) {
    const result = await this.pool.query(
      `select e.id expense_id,e.expense_date::text,e.expense_class::text,e.state::text expense_state,e.currency,e.payee_party_id,e.journal_id,
        l.line_number,l.description,l.net_minor::text booked_net_minor,l.vat_minor::text booked_vat_minor,l.gross_minor::text booked_gross_minor,
        l.cit_eligible_minor::text,l.vat_eligible_minor::text,l.management_state::text,l.cit_state::text,l.vat_state::text,
        l.reviewed_by,l.reviewed_at,l.review_reason,l.review_reference,l.posting_account_code,l.vat_account_code,l.dimensions,
        (l.review_reference in ('solopreneur_policy','owner_final','owner_final_legacy')
          or exists(select 1 from evidence_records r where r.organization_id=e.organization_id and r.subject_type='expense' and r.subject_id=e.id)
          or exists(select 1 from external_references xr where xr.organization_id=e.organization_id and xr.expense_id=e.id)) source_evidence_present
       from expenses e join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id
       join journal_entries j on j.organization_id=e.organization_id and j.id=e.journal_id
       where e.organization_id=$1 and e.state='posted'
         and e.expense_date between $2::date and $3::date and e.created_at <= $4::timestamptz
         and j.state in ('posted','reversed') and j.posted_at <= $4::timestamptz
       union all
       select d.id,d.document_date::text,'invoice_backed',d.state::text,d.currency,d.party_id,d.journal_id,
        l.line_number,l.description,l.net_minor::text,l.tax_minor::text,l.gross_minor::text,
        l.cit_eligible_minor::text,l.vat_eligible_minor::text,l.management_state::text,l.cit_state::text,l.vat_state::text,
        l.reviewed_by,l.reviewed_at,l.review_reason,l.review_reference,l.primary_account_code,l.tax_account_code,l.dimensions,
        (l.review_reference in ('solopreneur_policy','owner_final','owner_final_legacy')
          or exists(select 1 from evidence_records r where r.organization_id=d.organization_id and r.subject_type='commercial_document' and r.subject_id=d.id)
          or exists(select 1 from external_references xr where xr.organization_id=d.organization_id and xr.document_id=d.id)) source_evidence_present
       from commercial_documents d
       join commercial_document_lines l on l.organization_id=d.organization_id and l.document_id=d.id
       join journal_entries j on j.organization_id=d.organization_id and j.id=d.journal_id
       where d.organization_id=$1 and d.type='purchase_invoice'
         and d.state in ('posted','partially_paid','paid')
         and d.document_date between $2::date and $3::date and d.created_at <= $4::timestamptz
         and j.state in ('posted','reversed') and j.posted_at <= $4::timestamptz
       order by expense_date,expense_id,line_number`,
      [c.organizationId, q.startsOn, q.endsOn, q.asOfInstant],
    );
    const items = result.rows.map((row) => ({
      ...row,
      sourceIds: {
        expenseId: row.expense_id,
        journalId: row.journal_id,
        lineId: `${row.expense_id}:${row.line_number}`,
      },
      exceptionCodes: [
        row.cit_state === "unreviewed" ? "CIT_UNREVIEWED" : null,
        row.vat_state === "unreviewed" ? "VAT_UNREVIEWED" : null,
      ].filter(Boolean),
    }));
    const reviewItems = items.map((row) => ({
      id: `${row.expense_id}:${row.line_number}`,
      sourceId: row.expense_id,
      accountingBookedMinor: BigInt(row.booked_net_minor),
      citBasisMinor: BigInt(row.booked_net_minor),
      citReviewState: row.cit_state,
      ...(row.cit_state !== "unreviewed"
        ? { citEligibleMinor: BigInt(row.cit_eligible_minor) }
        : {}),
      vatBasisMinor: BigInt(row.booked_vat_minor),
      vatReviewState: row.vat_state,
      ...(row.vat_state !== "unreviewed"
        ? { vatEligibleMinor: BigInt(row.vat_eligible_minor) }
        : {}),
      ...(row.reviewed_by ? { reviewerId: row.reviewed_by } : {}),
      ...(row.review_reason ? { reviewReason: row.review_reason } : {}),
      ...(row.review_reference ? { reviewReferenceId: row.review_reference } : {}),
      requiredEvidenceTypes: ["source_document"],
      presentEvidenceTypes: row.source_evidence_present ? ["source_document"] : [],
    }));
    const summary = buildTaxExpenseReview({
      organizationId: c.organizationId,
      currency: await this.currency(c.organizationId),
      startsOn: q.startsOn!,
      endsOn: q.endsOn,
      items: reviewItems,
    });
    return {
      ...(jsonMoney(summary) as Record<string, unknown>),
      asOfInstant: q.asOfInstant,
      items,
      count: items.length,
    };
  }
}
