import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import pg, { type PoolClient } from "pg";
import type {
  BankingContext,
  BankingStore,
  CreateFinancialAccountInput,
  ImportBankStatementInput,
} from "./banking.types.js";

type ParsedBankRow = Record<string, string>;
type NormalizedBankRow = {
  providerTransactionId?: string;
  bookingDate: string;
  valueDate?: string;
  amountMinor: string;
  currency: string;
  reference?: string;
  description: string;
  counterpartyName?: string;
  fingerprint: string;
  formulaRisk: boolean;
};

const REQUIRED = ["bookingDate", "amountMinor", "currency", "description"] as const;
const DEFAULT_COLUMNS: Readonly<Record<string, string>> = {
  providerTransactionId: "provider_transaction_id",
  bookingDate: "booking_date",
  valueDate: "value_date",
  amountMinor: "amount_minor",
  currency: "currency",
  reference: "reference",
  description: "description",
  counterpartyName: "counterparty",
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const canonicalText = (value: string | undefined) =>
  value?.normalize("NFKC").trim().replace(/\s+/g, " ") || undefined;

@Injectable()
export class PgBankingStore implements BankingStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async listAccounts(organizationId: string) {
    const result = await this.pool.query(
      `select organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,
              masked_identifier,status,version::text,created_at,updated_at
       from financial_accounts where organization_id=$1 order by code`,
      [organizationId],
    );
    return { items: result.rows };
  }
  async getAccount(organizationId: string, id: string) {
    const result = await this.pool.query(
      `select organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,
              masked_identifier,status,version::text,created_at,updated_at
       from financial_accounts where organization_id=$1 and id=$2`,
      [organizationId, id],
    );
    return result.rows[0];
  }
  async createAccount(context: BankingContext, input: CreateFinancialAccountInput, key: string) {
    const requestHash = sha256(JSON.stringify(input));
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.replay(client, context.organizationId, key, requestHash);
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      const ledger = await client.query<{ root_type: string }>(
        "select root_type from accounts where organization_id=$1 and code=$2",
        [context.organizationId, input.ledgerAccountCode],
      );
      if (ledger.rows[0]?.root_type !== "asset") throw new Error("BANK_LEDGER_ACCOUNT_INVALID");
      const id = input.id ?? randomUUID();
      const identityHash = input.accountIdentity
        ? sha256(
            `${input.bankCode?.trim().toUpperCase() ?? ""}:${canonicalText(input.accountIdentity)}`,
          )
        : null;
      await client.query(
        `insert into financial_accounts
         (organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,
          masked_identifier,account_identity_hash,created_by,updated_by)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
        [
          context.organizationId,
          id,
          input.code.trim(),
          input.kind,
          input.displayName.trim(),
          input.currency,
          input.ledgerAccountCode.trim(),
          input.bankCode?.trim().toUpperCase() ?? null,
          input.maskedIdentifier?.trim() ?? null,
          identityHash,
          context.actorId,
        ],
      );
      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      const after = {
        id,
        code: input.code.trim(),
        kind: input.kind,
        status: "active",
        currency: input.currency,
      };
      await this.audit(
        client,
        context,
        auditEventId,
        "financial_account",
        id,
        "create",
        1n,
        null,
        after,
      );
      await this.outbox(
        client,
        context,
        outboxEventId,
        "financial_account",
        id,
        "financial_account.created",
        after,
      );
      const response = {
        accountId: id,
        status: "active",
        resourceVersion: "1",
        auditEventId,
        outboxEventId,
        idempotencyReplayed: false,
        nextActions: ["get", "import", "deactivate"],
      };
      await this.save(
        client,
        context.organizationId,
        key,
        "banking:account:create",
        requestHash,
        response,
      );
      await client.query("commit");
      return response;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async deactivateAccount(context: BankingContext, id: string, reason: string, key: string) {
    const requestHash = sha256(JSON.stringify({ id, reason }));
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.replay(client, context.organizationId, key, requestHash);
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      const current = await client.query<{ status: string; version: string }>(
        `select status,version::text from financial_accounts
         where organization_id=$1 and id=$2 for update`,
        [context.organizationId, id],
      );
      if (!current.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (current.rows[0].status === "inactive") throw new Error("FINANCIAL_ACCOUNT_INACTIVE");
      const version = BigInt(current.rows[0].version) + 1n;
      await client.query(
        `update financial_accounts set status='inactive',version=version+1,updated_by=$3,updated_at=now()
         where organization_id=$1 and id=$2`,
        [context.organizationId, id, context.actorId],
      );
      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await this.audit(
        client,
        context,
        auditEventId,
        "financial_account",
        id,
        "deactivate",
        version,
        { status: "active" },
        { status: "inactive", reason },
      );
      await this.outbox(
        client,
        context,
        outboxEventId,
        "financial_account",
        id,
        "financial_account.deactivated",
        { accountId: id, reason },
      );
      const response = {
        accountId: id,
        status: "inactive",
        resourceVersion: version.toString(),
        auditEventId,
        outboxEventId,
        idempotencyReplayed: false,
        nextActions: ["get"],
      };
      await this.save(
        client,
        context.organizationId,
        key,
        "banking:account:deactivate",
        requestHash,
        response,
      );
      await client.query("commit");
      return response;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async importStatement(context: BankingContext, input: ImportBankStatementInput, key: string) {
    const requestHash = sha256(JSON.stringify(input));
    const contentSha256 = sha256(input.csvText);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.replay(client, context.organizationId, key, requestHash);
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${context.organizationId}:${input.financialAccountId}:${contentSha256}`,
      ]);
      const account = await client.query<{ status: string; currency: string }>(
        `select status,currency from financial_accounts
         where organization_id=$1 and id=$2 for update`,
        [context.organizationId, input.financialAccountId],
      );
      if (!account.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      if (account.rows[0].status !== "active") throw new Error("FINANCIAL_ACCOUNT_INACTIVE");
      const prior = await client.query<{
        id: string;
        row_count: number;
        imported_count: number;
        duplicate_count: number;
        rejected_count: number;
      }>(
        `select id,row_count,imported_count,duplicate_count,rejected_count from bank_statement_imports
         where organization_id=$1 and financial_account_id=$2 and content_sha256=$3`,
        [context.organizationId, input.financialAccountId, contentSha256],
      );
      if (prior.rows[0]) {
        const previous = prior.rows[0];
        const response = {
          importId: previous.id,
          duplicateFile: true,
          rowCount: previous.row_count,
          importedCount: previous.imported_count,
          duplicateCount: previous.duplicate_count,
          rejectedCount: previous.rejected_count,
          idempotencyReplayed: false,
          nextActions: ["get", "list-transactions"],
        };
        await this.save(
          client,
          context.organizationId,
          key,
          "banking:statement:import",
          requestHash,
          response,
        );
        await client.query("commit");
        return response;
      }
      const rows = this.parseCsv(input.csvText);
      if (rows.length > 10_000) throw new Error("BANK_IMPORT_TOO_LARGE");
      const importId = input.id ?? randomUUID();
      const results: Array<{
        rowNumber: number;
        raw: ParsedBankRow;
        rawSha256: string;
        outcome: "imported" | "duplicate" | "rejected";
        errorCodes: string[];
        transactionId?: string;
      }> = [];
      const auditEventIds: string[] = [];
      const outboxEventIds: string[] = [];
      for (const [index, raw] of rows.entries()) {
        const rowNumber = index + 1;
        const rawSha256 = sha256(JSON.stringify(raw));
        let normalized: NormalizedBankRow;
        try {
          normalized = this.normalizeRow(raw, input.columnMapping, account.rows[0].currency);
        } catch (error) {
          results.push({
            rowNumber,
            raw,
            rawSha256,
            outcome: "rejected",
            errorCodes: [error instanceof Error ? error.message : "BANK_IMPORT_ROW_INVALID"],
          });
          continue;
        }
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `${context.organizationId}:${input.financialAccountId}:${normalized.fingerprint}`,
        ]);
        const existing = await client.query<{ id: string }>(
          `select id from bank_transactions where organization_id=$1 and financial_account_id=$2
           and (fingerprint=$3 or ($4::text is not null and provider_transaction_id=$4))`,
          [
            context.organizationId,
            input.financialAccountId,
            normalized.fingerprint,
            normalized.providerTransactionId ?? null,
          ],
        );
        if (existing.rows[0]) {
          results.push({
            rowNumber,
            raw,
            rawSha256,
            outcome: "duplicate",
            errorCodes: [],
            transactionId: existing.rows[0].id,
          });
          continue;
        }
        const transactionId = randomUUID();
        const state = normalized.formulaRisk ? "needs_review" : "imported";
        const normalizedPayload = {
          ...normalized,
          fingerprintVersion: 1,
          normalizationSchemaVersion: 1,
        };
        await client.query(
          `insert into bank_transactions
           (organization_id,id,financial_account_id,provider_transaction_id,fingerprint,
            booking_date,value_date,amount_minor,currency,reference,description,counterparty_name,state)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            context.organizationId,
            transactionId,
            input.financialAccountId,
            normalized.providerTransactionId ?? null,
            normalized.fingerprint,
            normalized.bookingDate,
            normalized.valueDate ?? null,
            normalized.amountMinor,
            normalized.currency,
            normalized.reference ?? null,
            normalized.description,
            normalized.counterpartyName ?? null,
            state,
          ],
        );
        await client.query(
          `insert into bank_transaction_normalizations
           (organization_id,transaction_id,version,adapter_id,adapter_version,schema_version,
            normalized_payload,normalized_sha256,created_by)
           values($1,$2,1,$3,$4,1,$5,$6,$7)`,
          [
            context.organizationId,
            transactionId,
            input.adapterId,
            input.adapterVersion,
            normalizedPayload,
            sha256(JSON.stringify(normalizedPayload)),
            context.actorId,
          ],
        );
        const auditEventId = randomUUID();
        const outboxEventId = randomUUID();
        auditEventIds.push(auditEventId);
        outboxEventIds.push(outboxEventId);
        await this.audit(
          client,
          context,
          auditEventId,
          "bank_transaction",
          transactionId,
          "import",
          1n,
          null,
          {
            state,
            financialAccountId: input.financialAccountId,
            fingerprint: normalized.fingerprint,
          },
        );
        await this.outbox(
          client,
          context,
          outboxEventId,
          "bank_transaction",
          transactionId,
          "bank_transaction.imported",
          { transactionId, financialAccountId: input.financialAccountId, state },
        );
        results.push({
          rowNumber,
          raw,
          rawSha256,
          outcome: "imported",
          errorCodes: normalized.formulaRisk ? ["CSV_FORMULA_RISK"] : [],
          transactionId,
        });
      }
      const importedCount = results.filter((row) => row.outcome === "imported").length;
      const duplicateCount = results.filter((row) => row.outcome === "duplicate").length;
      const rejectedCount = results.filter((row) => row.outcome === "rejected").length;
      await client.query(
        `insert into bank_statement_imports
         (organization_id,id,financial_account_id,adapter_id,adapter_version,source_filename,
          content_sha256,row_count,imported_count,duplicate_count,rejected_count,created_by,correlation_id)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          context.organizationId,
          importId,
          input.financialAccountId,
          input.adapterId,
          input.adapterVersion,
          input.filename,
          contentSha256,
          results.length,
          importedCount,
          duplicateCount,
          rejectedCount,
          context.actorId,
          context.correlationId,
        ],
      );
      for (const result of results)
        await client.query(
          `insert into bank_statement_import_rows
           (organization_id,import_id,row_number,raw_payload,raw_sha256,outcome,error_codes,transaction_id)
           values($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            context.organizationId,
            importId,
            result.rowNumber,
            result.raw,
            result.rawSha256,
            result.outcome,
            JSON.stringify(result.errorCodes),
            result.transactionId ?? null,
          ],
        );
      const importAuditEventId = randomUUID();
      await this.audit(
        client,
        context,
        importAuditEventId,
        "bank_statement_import",
        importId,
        "create",
        1n,
        null,
        {
          financialAccountId: input.financialAccountId,
          rowCount: results.length,
          importedCount,
          duplicateCount,
          rejectedCount,
        },
      );
      const response = {
        importId,
        duplicateFile: false,
        rowCount: results.length,
        importedCount,
        duplicateCount,
        rejectedCount,
        rows: results.map(({ raw: _raw, rawSha256: _hash, ...result }) => result),
        auditEventId: importAuditEventId,
        transactionAuditEventIds: auditEventIds,
        outboxEventIds,
        idempotencyReplayed: false,
        nextActions: ["get", "list-transactions"],
      };
      await this.save(
        client,
        context.organizationId,
        key,
        "banking:statement:import",
        requestHash,
        response,
      );
      await client.query("commit");
      return response;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async dryRunImport(organizationId: string, input: ImportBankStatementInput) {
    const account = await this.pool.query<{ status: string; currency: string }>(
      `select status,currency from financial_accounts where organization_id=$1 and id=$2`,
      [organizationId, input.financialAccountId],
    );
    if (!account.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    if (account.rows[0].status !== "active") throw new Error("FINANCIAL_ACCOUNT_INACTIVE");
    const rows = this.parseCsv(input.csvText);
    if (rows.length > 10_000) throw new Error("BANK_IMPORT_TOO_LARGE");
    const outcomes: Array<Record<string, unknown> & { valid: boolean }> = [];
    const seenFingerprints = new Set<string>();
    const seenProviderIds = new Set<string>();
    for (const [index, raw] of rows.entries()) {
      try {
        const normalized = this.normalizeRow(raw, input.columnMapping, account.rows[0]!.currency);
        const existing = await this.pool.query<{ id: string }>(
          `select id from bank_transactions where organization_id=$1 and financial_account_id=$2
           and (fingerprint=$3 or ($4::text is not null and provider_transaction_id=$4)) limit 1`,
          [
            organizationId,
            input.financialAccountId,
            normalized.fingerprint,
            normalized.providerTransactionId ?? null,
          ],
        );
        const duplicate =
          existing.rows.length > 0 ||
          seenFingerprints.has(normalized.fingerprint) ||
          (normalized.providerTransactionId !== undefined &&
            seenProviderIds.has(normalized.providerTransactionId));
        seenFingerprints.add(normalized.fingerprint);
        if (normalized.providerTransactionId) seenProviderIds.add(normalized.providerTransactionId);
        outcomes.push({
          rowNumber: index + 1,
          valid: true,
          outcome: duplicate ? "duplicate" : normalized.formulaRisk ? "needs_review" : "imported",
          errorCodes: normalized.formulaRisk ? ["CSV_FORMULA_RISK"] : [],
          normalized,
          ...(existing.rows[0] ? { existingTransactionId: existing.rows[0].id } : {}),
        });
      } catch (error) {
        outcomes.push({
          rowNumber: index + 1,
          valid: false,
          outcome: "rejected",
          errorCodes: [error instanceof Error ? error.message : "BANK_IMPORT_ROW_INVALID"],
        });
      }
    }
    return {
      valid: outcomes.every((row) => row.valid),
      rowCount: outcomes.length,
      acceptedCount: outcomes.filter((row) => row.valid).length,
      duplicateCount: outcomes.filter((row) => row.outcome === "duplicate").length,
      rejectedCount: outcomes.filter((row) => !row.valid).length,
      rows: outcomes,
      mutationCount: 0,
    };
  }
  async listImports(organizationId: string, financialAccountId?: string) {
    const result = await this.pool.query(
      `select * from bank_statement_imports where organization_id=$1
       and ($2::text is null or financial_account_id=$2) order by created_at desc,id`,
      [organizationId, financialAccountId ?? null],
    );
    return { items: result.rows };
  }
  async getImport(organizationId: string, id: string) {
    const result = await this.pool.query(
      `select i.*,coalesce(json_agg(r order by r.row_number) filter(where r.row_number is not null),'[]') rows
       from bank_statement_imports i left join bank_statement_import_rows r
       on r.organization_id=i.organization_id and r.import_id=i.id
       where i.organization_id=$1 and i.id=$2 group by i.organization_id,i.id`,
      [organizationId, id],
    );
    return result.rows[0];
  }
  async listTransactions(
    organizationId: string,
    filters: { financialAccountId?: string; state?: string; from?: string; to?: string },
  ) {
    const result = await this.pool.query(
      `select * from bank_transactions where organization_id=$1
       and ($2::text is null or financial_account_id=$2)
       and ($3::text is null or state::text=$3)
       and ($4::date is null or booking_date >= $4)
       and ($5::date is null or booking_date <= $5)
       order by booking_date desc,id`,
      [
        organizationId,
        filters.financialAccountId ?? null,
        filters.state ?? null,
        filters.from ?? null,
        filters.to ?? null,
      ],
    );
    return { items: result.rows };
  }
  async listOwnerCurrentMovements(organizationId: string) {
    const result = await this.pool.query<{
      journal_id: string;
      journal_date: string;
      description: string;
      currency: string;
      state: string;
      reversal_of_id: string | null;
      owner_delta_minor: string;
      company_funds_delta_minor: string;
      owner_account_codes: string[];
      counterpart_lines: unknown[];
      sources: unknown[];
    }>(
      `with selected_mapping as (
         select id,version
         from financial_statement_mapping_versions
         where organization_id=$1 and framework='TT133' and state='approved'
         order by effective_from desc,version desc limit 1
       ), owner_accounts as (
         select distinct ml.account_code
         from selected_mapping sm
         join financial_statement_mapping_lines ml
           on ml.organization_id=$1 and ml.mapping_id=sm.id and ml.mapping_version=sm.version
         where ml.statement='balance_sheet' and ml.line_code='owner_current'
       ), company_funds_accounts as (
         select distinct ledger_account_code account_code
         from financial_accounts
         where organization_id=$1 and status='active' and kind in ('bank','cash')
       )
       select j.id journal_id,j.journal_date::text,j.description,j.currency,j.state,j.reversal_of_id,
         coalesce(source_refs.sources,'[]'::jsonb) sources,
         sum(case when l.account_code in (select account_code from owner_accounts)
           then coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0) else 0 end)::text owner_delta_minor,
         sum(case when l.account_code in (select account_code from company_funds_accounts)
           then coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0) else 0 end)::text company_funds_delta_minor,
         array_agg(distinct l.account_code) filter (
           where l.account_code in (select account_code from owner_accounts)
         ) owner_account_codes,
         jsonb_agg(jsonb_build_object(
           'accountCode',l.account_code,'accountName',a.name,
           'debitMinor',coalesce(l.debit_minor,0)::text,
           'creditMinor',coalesce(l.credit_minor,0)::text,
           'description',coalesce(l.description,'')
         ) order by l.line_number) filter (
           where l.account_code not in (select account_code from owner_accounts)
         ) counterpart_lines
       from journal_entries j
       join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
       join accounts a on a.organization_id=l.organization_id and a.code=l.account_code
       left join lateral (
         select coalesce(jsonb_agg(source order by source->>'sourceType',source->>'sourceId'),'[]'::jsonb) sources
         from (
           select jsonb_build_object(
             'sourceType','expense','sourceId',e.id,'title',e.business_purpose,
             'detail',(select string_agg(el.description,' · ' order by el.line_number)
               from expense_lines el where el.organization_id=e.organization_id and el.expense_id=e.id),
             'grossMinor',e.gross_minor::text,'sourceHref','/expenses/' || e.id,
             'expenseClass',e.expense_class::text,
             'category',(select coalesce(el.dimensions->>'category',el.expense_category_code)
               from expense_lines el where el.organization_id=e.organization_id and el.expense_id=e.id
               order by el.line_number limit 1),
             'citState',e.cit_state::text,'vatState',e.vat_state::text,
             'payeeName',p.display_name
           ) source
           from expenses e
           left join parties p on p.organization_id=e.organization_id and p.id=e.payee_party_id
           where e.organization_id=j.organization_id
             and e.journal_id=coalesce(j.reversal_of_id,j.id)
           union all
           select jsonb_build_object(
             'sourceType','purchase_invoice','sourceId',d.id,'title',d.document_number,
             'detail',(select string_agg(dl.description,' · ' order by dl.line_number)
               from commercial_document_lines dl
               where dl.organization_id=d.organization_id and dl.document_id=d.id),
             'grossMinor',d.gross_minor::text,'sourceHref','/documents/' || d.id,
             'expenseClass',null,'category',null,
             'citState',(select min(dl.cit_state::text) from commercial_document_lines dl
               where dl.organization_id=d.organization_id and dl.document_id=d.id),
             'vatState',(select min(dl.vat_state::text) from commercial_document_lines dl
               where dl.organization_id=d.organization_id and dl.document_id=d.id),
             'payeeName',p.display_name
           ) source
           from commercial_documents d
           left join parties p on p.organization_id=d.organization_id and p.id=d.party_id
           where d.organization_id=j.organization_id and d.type='purchase_invoice'
             and d.journal_id=coalesce(j.reversal_of_id,j.id)
         ) canonical_sources
       ) source_refs on true
       where j.organization_id=$1 and j.state in ('posted','reversed')
       group by j.id,j.journal_date,j.description,j.currency,j.state,j.reversal_of_id,
         source_refs.sources
       having bool_or(l.account_code in (select account_code from owner_accounts))
       order by j.journal_date,j.id`,
      [organizationId],
    );
    let running = 0n;
    let increases = 0n;
    let decreases = 0n;
    const items = result.rows.map((row) => {
      const ownerDelta = BigInt(row.owner_delta_minor);
      const companyFundsDelta = BigInt(row.company_funds_delta_minor);
      running += ownerDelta;
      if (ownerDelta > 0n) increases += ownerDelta;
      if (ownerDelta < 0n) decreases += -ownerDelta;
      const movementType =
        ownerDelta < 0n && companyFundsDelta < 0n
          ? "company_payment_to_owner"
          : ownerDelta > 0n && companyFundsDelta > 0n
            ? "owner_funding"
            : ownerDelta > 0n
              ? "owner_paid_company_cost"
              : "adjustment";
      return {
        journalId: row.journal_id,
        date: row.journal_date,
        description: row.description,
        currency: row.currency,
        state: row.state,
        reversalOfId: row.reversal_of_id,
        movementType,
        ownerDeltaMinor: ownerDelta.toString(),
        companyFundsDeltaMinor: companyFundsDelta.toString(),
        runningOwnerBalanceMinor: running.toString(),
        ownerAccountCodes: row.owner_account_codes ?? [],
        counterpartLines: row.counterpart_lines ?? [],
        sources: row.sources ?? [],
      };
    });
    return {
      summary: {
        increaseMinor: increases.toString(),
        decreaseMinor: decreases.toString(),
        closingBalanceMinor: running.toString(),
      },
      items: items.reverse(),
    };
  }
  async getTransaction(organizationId: string, id: string) {
    const result = await this.pool.query(
      `select t.*,
        (select coalesce(json_agg(n order by n.version),'[]') from bank_transaction_normalizations n
         where n.organization_id=t.organization_id and n.transaction_id=t.id) normalizations,
        (select coalesce(json_agg(e order by e.occurred_at),'[]') from bank_transaction_events e
         where e.organization_id=t.organization_id and e.transaction_id=t.id) events
       from bank_transactions t where t.organization_id=$1 and t.id=$2`,
      [organizationId, id],
    );
    return result.rows[0];
  }
  async transitionTransaction(
    context: BankingContext,
    id: string,
    action: "ignore" | "mark-needs-review",
    reason: string,
    key: string,
  ) {
    const requestHash = sha256(JSON.stringify({ id, action, reason }));
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.replay(client, context.organizationId, key, requestHash);
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      const current = await client.query<{ state: string; version: string }>(
        `select state,version::text from bank_transactions
         where organization_id=$1 and id=$2 for update`,
        [context.organizationId, id],
      );
      if (!current.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      const next = action === "ignore" ? "ignored" : "needs_review";
      const allowed =
        (action === "ignore" && ["imported", "needs_review"].includes(current.rows[0].state)) ||
        (action === "mark-needs-review" && current.rows[0].state === "imported");
      if (!allowed) throw new Error("INVALID_BANK_TRANSACTION_TRANSITION");
      const version = BigInt(current.rows[0].version) + 1n;
      await client.query(
        `update bank_transactions set state=$3,version=version+1,updated_at=now()
         where organization_id=$1 and id=$2`,
        [context.organizationId, id, next],
      );
      const eventId = randomUUID();
      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await client.query(
        `insert into bank_transaction_events
         (organization_id,id,transaction_id,action,from_state,to_state,actor_id,reason,correlation_id)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          context.organizationId,
          eventId,
          id,
          action,
          current.rows[0].state,
          next,
          context.actorId,
          reason,
          context.correlationId,
        ],
      );
      await this.audit(
        client,
        context,
        auditEventId,
        "bank_transaction",
        id,
        action,
        version,
        { state: current.rows[0].state },
        { state: next, reason },
      );
      await this.outbox(
        client,
        context,
        outboxEventId,
        "bank_transaction",
        id,
        `bank_transaction.${next}`,
        { transactionId: id, state: next, reason },
      );
      const response = {
        transactionId: id,
        state: next,
        resourceVersion: version.toString(),
        eventId,
        auditEventId,
        outboxEventId,
        idempotencyReplayed: false,
        nextActions: next === "needs_review" ? ["get", "ignore"] : ["get"],
      };
      await this.save(
        client,
        context.organizationId,
        key,
        `banking:transaction:${action}`,
        requestHash,
        response,
      );
      await client.query("commit");
      return response;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  private parseCsv(csvText: string): ParsedBankRow[] {
    try {
      const rows = parse(csvText, {
        bom: true,
        columns: (headers: string[]) => {
          const normalized = headers.map((header) => header.trim());
          if (new Set(normalized).size !== normalized.length)
            throw new Error("BANK_IMPORT_DUPLICATE_HEADER");
          return normalized;
        },
        skip_empty_lines: true,
        trim: false,
        relax_column_count: false,
      }) as ParsedBankRow[];
      if (rows.length === 0) throw new Error("BANK_IMPORT_EMPTY");
      return rows;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("BANK_IMPORT_")) throw error;
      throw new Error("BANK_IMPORT_CSV_INVALID");
    }
  }
  private normalizeRow(
    raw: ParsedBankRow,
    mapping: Readonly<Record<string, string>> | undefined,
    accountCurrency: string,
  ): NormalizedBankRow {
    const columns = { ...DEFAULT_COLUMNS, ...(mapping ?? {}) };
    for (const name of REQUIRED)
      if (!columns[name] || raw[columns[name]!] === undefined)
        throw new Error("BANK_IMPORT_REQUIRED_COLUMN_MISSING");
    const value = (name: string) => canonicalText(raw[columns[name]!]);
    const bookingDate = value("bookingDate")!;
    const valueDate = value("valueDate");
    const amountMinor = value("amountMinor")!;
    const currency = value("currency")!.toUpperCase();
    const description = value("description")!;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) ||
      (valueDate && !/^\d{4}-\d{2}-\d{2}$/.test(valueDate))
    )
      throw new Error("BANK_IMPORT_DATE_INVALID");
    if (!/^-?\d+$/.test(amountMinor) || BigInt(amountMinor) === 0n)
      throw new Error("BANK_IMPORT_AMOUNT_INVALID");
    if (!/^[A-Z]{3}$/.test(currency) || currency !== accountCurrency)
      throw new Error("BANK_IMPORT_CURRENCY_INVALID");
    if (!description) throw new Error("BANK_IMPORT_DESCRIPTION_REQUIRED");
    const reference = value("reference");
    const counterpartyName = value("counterpartyName");
    const providerTransactionId = value("providerTransactionId");
    const formulaRisk = [reference, description, counterpartyName, providerTransactionId].some(
      (field) => field !== undefined && /^[=+\-@]/.test(field),
    );
    const fingerprint = sha256(
      JSON.stringify([
        bookingDate,
        valueDate ?? null,
        BigInt(amountMinor).toString(),
        currency,
        reference ?? null,
        description,
        counterpartyName ?? null,
      ]),
    );
    return {
      ...(providerTransactionId ? { providerTransactionId } : {}),
      bookingDate,
      ...(valueDate ? { valueDate } : {}),
      amountMinor: BigInt(amountMinor).toString(),
      currency,
      ...(reference ? { reference } : {}),
      description,
      ...(counterpartyName ? { counterpartyName } : {}),
      fingerprint,
      formulaRisk,
    };
  }
  private async replay(client: PoolClient, org: string, key: string, hash: string) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`${org}:${key}`]);
    const result = await client.query<{
      request_hash: string;
      response_body: Record<string, unknown>;
    }>(
      `select request_hash,response_body from api_idempotency_records
       where organization_id=$1 and idempotency_key=$2 for update`,
      [org, key],
    );
    if (!result.rows[0]) return undefined;
    if (result.rows[0].request_hash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
    return result.rows[0].response_body;
  }
  private save(
    client: PoolClient,
    org: string,
    key: string,
    operation: string,
    hash: string,
    response: unknown,
  ) {
    return client.query(
      `insert into api_idempotency_records
       (organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,$3,$4,$5)`,
      [org, key, operation, hash, response],
    );
  }
  private audit(
    client: PoolClient,
    context: BankingContext,
    id: string,
    resourceType: string,
    resourceKey: string,
    action: string,
    version: bigint,
    before: unknown,
    after: unknown,
  ) {
    return client.query(
      `insert into resource_audit_events
       (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,
        correlation_id,before_state,after_state) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        context.organizationId,
        id,
        resourceType,
        resourceKey,
        version.toString(),
        action,
        context.actorId,
        context.correlationId,
        before,
        after,
      ],
    );
  }
  private outbox(
    client: PoolClient,
    context: BankingContext,
    id: string,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: unknown,
  ) {
    return client.query(
      `insert into outbox_events
       (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
       values($1,$2,$3,$4,$5,1,$6,$7)`,
      [
        context.organizationId,
        id,
        aggregateType,
        aggregateId,
        eventType,
        payload,
        context.correlationId,
      ],
    );
  }
}
