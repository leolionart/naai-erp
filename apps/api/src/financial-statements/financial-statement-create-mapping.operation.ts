import { createHash, randomUUID } from "node:crypto";
import { buildBalanceSheet, buildProfitAndLoss } from "@naai-erp/domain";
import type {
  FinancialStatementContext,
  MappingInput,
  StatementKind,
  StatementQuery,
} from "./financial-statement.types.js";
import {
  type LedgerRow,
  fingerprint,
  jsonMoney,
  matchesDimensions,
  natural,
} from "./pg-financial-statement.store.shared.js";
import type { PgFinancialStatementStore } from "./pg-financial-statement.store.js";

export async function createMappingOperation(
  this: PgFinancialStatementStore,
  c: FinancialStatementContext,
  input: MappingInput,
  key: string,
) {
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

export async function ledgerOperation(
  this: PgFinancialStatementStore,
  c: FinancialStatementContext,
  kind: StatementKind,
  q: StatementQuery,
) {
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
       and j.currency=(select base_currency from organizations where id=$1)
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
  // Statements are summed in minor units of the base currency; journals in another currency are
  // excluded (not converted), so the omission is reported instead of silently skewing totals.
  const foreign = await this.pool.query<{ count: number }>(
    `select count(*)::int count from journal_entries j
      where j.organization_id=$1 and j.state in ('posted','reversed') and j.journal_date <= $2::date
        and ($3::date is null or j.journal_date >= $3::date)
        and j.currency<>(select base_currency from organizations where id=$1)`,
    [
      c.organizationId,
      q.endsOn,
      kind === "balance_sheet" || kind === "cash_flow" ? null : (q.startsOn ?? null),
    ],
  );
  return {
    mapping: selected,
    reportWarnings: [
      ...((foreign.rows[0]?.count ?? 0) > 0 ? ["foreign_currency_excluded_from_totals"] : []),
      ...(selected.version === 0 ? ["financial_statement_mapping_missing"] : []),
      ...(selected.version > 0 && selected.state !== "approved"
        ? ["financial_statement_mapping_unapproved"]
        : []),
    ],
    rows: result.rows.filter((r) => matchesDimensions(r, q.dimensions)),
  };
}

export async function reportOperation(
  this: PgFinancialStatementStore,
  c: FinancialStatementContext,
  kind: StatementKind,
  q: StatementQuery,
) {
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
