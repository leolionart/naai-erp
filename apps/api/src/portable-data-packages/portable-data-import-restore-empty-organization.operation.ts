import { createHash, randomUUID } from "node:crypto";
import type { PortableRowEnvelopeContract } from "@naai-erp/contracts";
import type { PortableDataPackageContext } from "./portable-data-package.types.js";
import type { ParsedPortableSheet } from "./portable-data-import.types.js";
import { MASTER_DATA_RESOURCES } from "../master-data/resource-registry.js";
import type { PgPortableDataImportStore } from "./pg-portable-data-import.store.js";

export async function restoreEmptyOrganizationOperation(
  this: PgPortableDataImportStore,
  context: PortableDataPackageContext,
  sourceOrganizationId: string,
  packageId: string,
  workbookSha256: string,
  reason: string,
  _mapSourceActorsToTargetActor: true,
  parsedSheets: readonly ParsedPortableSheet[],
  idempotencyKey: string,
) {
  const excluded = new Set([
    "organizations",
    "organization_memberships",
    "membership_roles",
    "api_credentials",
    "api_idempotency_records",
    "portable_data_packages",
    "portable_data_imports",
    // Local reset intentionally preserves seeded accounting configuration.
    // Those rows are environment bootstrap state, not business activity, so
    // they must not make a reset target fail the empty-tenant guard.
    "accounts",
    "fiscal_years",
    "fiscal_periods",
    "tax_code_versions",
    "dimension_values",
    "dimension_requirement_versions",
    "statutory_account_mappings",
    "default_mapping_versions",
    "posting_rule_versions",
    "accounting_workflow_policies",
    "financial_statement_mapping_versions",
    "financial_statement_mapping_lines",
    "executive_metric_policies",
    "roi_definitions",
    "outbox_events",
    "outbound_deliveries",
    "outbound_delivery_attempts",
    // Runtime activity/audit telemetry is created by the local application
    // during bootstrap and must not make an otherwise empty tenant appear
    // non-empty (nor be copied across environments).
    "operational_activity_logs",
  ]);
  const tableNameOf = (sheet: ParsedPortableSheet): string =>
    MASTER_DATA_RESOURCES[sheet.resourceType as keyof typeof MASTER_DATA_RESOURCES]?.table ??
    sheet.resourceType;
  let sheets = parsedSheets.filter(
    (sheet) =>
      !excluded.has(tableNameOf(sheet)) &&
      !tableNameOf(sheet).startsWith("evidence_") &&
      sheet.rows.length > 0,
  );
  // Older production packages may contain child allocation rows without the
  // reconciliation-attempt parent sheet. Omit those orphaned telemetry rows
  // rather than aborting the entire business-data restore on an FK violation.
  const availableTables = new Set(sheets.map(tableNameOf));
  sheets = sheets.filter(
    (sheet) =>
      tableNameOf(sheet) !== "reconciliation_allocations" ||
      availableTables.has("reconciliation_attempts"),
  );
  const packageContentHash = createHash("sha256")
    .update(
      JSON.stringify(sheets.map((sheet) => [sheet.sheetName, sheet.sha256, sheet.rows.length])),
    )
    .digest("hex");
  const normalized = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(normalized)
      : typeof value === "number" || typeof value === "bigint"
        ? String(value)
        : typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)
          ? new Date(value).toISOString()
          : typeof value === "string" && /^-?\d+\.\d+$/.test(value)
            ? value.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1")
            : typeof value === "string" &&
                ["[", "{"].some((prefix) => value.trim().startsWith(prefix))
              ? (() => {
                  try {
                    return normalized(JSON.parse(value));
                  } catch {
                    return value;
                  }
                })()
              : value && typeof value === "object"
                ? Object.fromEntries(
                    Object.entries(value as Record<string, unknown>)
                      .sort(([left], [right]) => left.localeCompare(right))
                      .map(([key, nested]) => [key, normalized(nested)]),
                  )
                : value;
  const client = await this.pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `restore:${context.organizationId}:${idempotencyKey}`,
    ]);
    const replay = await client.query<{
      request_hash: string;
      response_body: Record<string, unknown>;
    }>(
      "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2",
      [context.organizationId, idempotencyKey],
    );
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          sourceOrganizationId,
          packageId,
          workbookSha256,
          reason,
          packageContentHash,
        }),
      )
      .digest("hex");
    if (replay.rows[0]) {
      if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
      await client.query("rollback");
      return { ...replay.rows[0].response_body, idempotencyReplayed: true } as never;
    }
    for (const sheet of sheets) {
      const present = await client.query<{ count: number }>(
        `select count(*)::int count from "${tableNameOf(sheet).replaceAll('"', '""')}" where organization_id=$1`,
        [context.organizationId],
      );
      const preservedLocalTables = new Set([
        "organizations",
        "users",
        "organization_memberships",
        "membership_roles",
        "api_credentials",
        // Request lifecycle telemetry is generated by the local API during
        // bootstrap. It is intentionally excluded from portable packages,
        // so baseline rows must not make an otherwise empty target reject.
        "operational_activity_logs",
      ]);
      if ((present.rows[0]?.count ?? 0) > 0 && !preservedLocalTables.has(tableNameOf(sheet)))
        throw new Error("RESTORE_TARGET_NOT_EMPTY");
    }
    const tableNames = sheets.map(tableNameOf);
    const dependencies = await client.query<{ table_name: string; referenced_table: string }>(
      `select tc.table_name,ccu.table_name referenced_table
       from information_schema.table_constraints tc
       join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.constraint_schema
       where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and tc.table_name=any($1::text[])`,
      [tableNames],
    );
    const pending = new Map<string, ParsedPortableSheet>(
      sheets.map((sheet) => [tableNameOf(sheet), sheet]),
    );
    const ordered: ParsedPortableSheet[] = [];
    while (pending.size) {
      const ready = [...pending.values()].filter((sheet) =>
        dependencies.rows.every(
          (dep) =>
            dep.table_name !== tableNameOf(sheet) ||
            dep.referenced_table === tableNameOf(sheet) ||
            !pending.has(dep.referenced_table),
        ),
      );
      if (!ready.length) throw new Error("RESTORE_DEPENDENCY_CYCLE");
      for (const sheet of ready) {
        ordered.push(sheet);
        pending.delete(tableNameOf(sheet));
      }
    }
    const restoredByResource: Record<string, number> = {};
    const sourceActorIds = new Set<string>();
    const expectedByTable = new Map<string, Record<string, unknown>[]>();
    // Parent rows carry canonical line/allocation data inline in portable
    // workbooks. Keep these payloads aside while inserting parents, then
    // materialize the relational child tables once all FK targets exist.
    const embeddedChildren: Array<{
      kind: "document" | "expense";
      id: string;
      lines: unknown[];
      externalReferences: PortableRowEnvelopeContract["externalReferences"];
    }> = [];
    const dateKeysByTable = new Map<string, Set<string>>(
      sheets.map((sheet) => [
        tableNameOf(sheet),
        new Set(
          sheet.schema.columns
            .filter((column) => column.type === "date")
            .map((column) => column.key),
        ),
      ]),
    );
    const normalizeRecordDates = (table: string, record: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(record).map(([key, value]) => [
          key,
          dateKeysByTable.get(table)?.has(key) && typeof value === "string"
            ? value.slice(0, 10)
            : value,
        ]),
      );
    for (const sheet of ordered) {
      const tableName = tableNameOf(sheet);
      const table = `"${tableName.replaceAll('"', '""')}"`;
      const columns = await client.query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_schema='public' and table_name=$1",
        [tableName],
      );
      const hasId = columns.rows.some((column) => column.column_name === "id");
      const hasVersion = columns.rows.some((column) => column.column_name === "version");
      // Self-referencing foreign keys (for example journal reversal/replacement links)
      // cannot be inserted in arbitrary workbook order.  Stage those values and
      // backfill them after every row in the table exists, preserving the canonical
      // stable IDs without disabling constraints.
      const selfReferences = await client.query<{ column_name: string }>(
        `select kcu.column_name
           from information_schema.table_constraints tc
           join information_schema.key_column_usage kcu
             on kcu.constraint_name=tc.constraint_name and kcu.constraint_schema=tc.constraint_schema
           join information_schema.constraint_column_usage ccu
             on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.constraint_schema
          where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
            and tc.table_name=$1 and ccu.table_name=$1`,
        [tableName],
      );
      const selfReferenceColumns = new Set(selfReferences.rows.map((row) => row.column_name));
      const pendingSelfReferences: Array<{ id: string; column: string; value: unknown }> = [];
      const jsonKeys = new Set(
        sheet.schema.columns.filter((column) => column.type === "json").map((column) => column.key),
      );
      for (const row of sheet.rows) {
        const record: Record<string, unknown> = {
          ...Object.fromEntries(
            Object.entries(row.data).map(([key, value]) => [
              key,
              jsonKeys.has(key) && typeof value === "string" ? JSON.parse(value) : value,
            ]),
          ),
          ...row.relationships,
        };
        // Organization scope is always owned by the target context.  Source
        // workbooks may include their original organization_id in data or
        // relationships; never allow that value to leak into the target.
        record.organization_id = context.organizationId;
        if (tableName === "commercial_documents" || tableName === "expenses") {
          const embedded = record.lines;
          embeddedChildren.push({
            kind: tableName === "commercial_documents" ? "document" : "expense",
            id: String(record.id ?? row.stableId),
            lines: Array.isArray(embedded) ? embedded : [],
            externalReferences: row.externalReferences ?? [],
          });
        }
        delete record.lines;
        // Stable IDs are the canonical identity for imported rows. Assign the
        // ID before staging self-references so rows that only carry a
        // workbook stableId (rather than data.id) are deferred as well.
        if (hasId && row.stableId && !("id" in record)) record.id = row.stableId;
        for (const [key, value] of Object.entries(record))
          if (
            value != null &&
            /(^actor_id$|_user_id$|_by$)/.test(key) &&
            key !== "organization_id"
          ) {
            sourceActorIds.add(String(value));
            record[key] = context.actorId;
          }
        const expectedRecord = { ...record };
        if (record.id != null)
          for (const column of selfReferenceColumns)
            if (record[column] != null) {
              pendingSelfReferences.push({
                id: String(record.id),
                column,
                value: record[column],
              });
              expectedRecord[column] = record[column];
              record[column] = null;
            }
        if (hasVersion && !("version" in record))
          record.version = row.expectedResourceVersion ?? null;
        if (hasVersion && !("version" in expectedRecord)) expectedRecord.version = record.version;
        const expected = { ...expectedRecord };
        delete expected.organization_id;
        const expectedRows = expectedByTable.get(tableName) ?? [];
        expectedRows.push(normalizeRecordDates(tableName, expected));
        expectedByTable.set(tableName, expectedRows);
        await client.query(
          `insert into ${table}
           select * from jsonb_populate_record(
             null::${table},
             jsonb_set($1::jsonb,'{organization_id}',$2::jsonb,true)
           )`,
          [JSON.stringify(record), JSON.stringify(context.organizationId)],
        );
      }
      if (pendingSelfReferences.length) {
        // The immutability trigger quite correctly rejects updates to posted
        // journals. During a restore these are not business edits: they are
        // the second phase of inserting an immutable row whose self-FK had
        // to be staged as NULL. Keep the transaction atomic and briefly
        // disable user triggers while backfilling, then restore them.
        await client.query(`alter table ${table} disable trigger user`);
        try {
          for (const pending of pendingSelfReferences)
            await client.query(
              `update ${table} set "${pending.column.replaceAll('"', '""')}"=$1
               where organization_id=$2 and id=$3`,
              [pending.value, context.organizationId, pending.id],
            );
        } finally {
          await client.query(`alter table ${table} enable trigger user`);
        }
      }
      restoredByResource[sheet.resourceType] = sheet.rows.length;
    }
    for (const parent of embeddedChildren) {
      const isDocument = parent.kind === "document";
      const allocationTable = isDocument
        ? "commercial_document_allocations"
        : "expense_allocations";
      const parentColumn = isDocument ? "document_id" : "expense_id";
      for (const [index, raw] of parent.lines.entries()) {
        const line = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
        const allocations = Array.isArray(line.allocations) ? line.allocations : [];
        const dimensions =
          line.dimensions && typeof line.dimensions === "object" ? line.dimensions : {};
        if (isDocument) {
          await client.query(
            `insert into commercial_document_lines
            (organization_id,document_id,line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,primary_account_code,category_code,tax_account_code,tax_code,dimensions,management_state,cit_state,vat_state,cit_eligible_minor,vat_eligible_minor,reviewed_by,reviewed_at,review_reason,review_reference,created_at)
             values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,now())`,
            [
              context.organizationId,
              parent.id,
              index + 1,
              String(line.description ?? "Imported line"),
              String(line.quantity ?? "1"),
              String(line.unitPriceMinor ?? "0"),
              String(line.netMinor ?? "0"),
              String(line.taxMinor ?? "0"),
              String(line.grossMinor ?? line.netMinor ?? "0"),
              String(line.primaryAccountCode ?? ""),
              line.categoryCode ?? line.expenseCategoryCode ?? null,
              line.taxAccountCode ?? line.vatAccountCode ?? null,
              line.taxCode ?? null,
              JSON.stringify(dimensions),
              line.managementState ?? "unreviewed",
              line.citState ?? "unreviewed",
              line.vatState ?? "unreviewed",
              String(line.citEligibleMinor ?? "0"),
              String(line.vatEligibleMinor ?? "0"),
              line.reviewedBy ? context.actorId : null,
              line.reviewedAt ?? null,
              line.reviewReason ?? null,
              line.reviewReference ?? null,
            ],
          );
        } else {
          await client.query(
            `insert into expense_lines
             (organization_id,expense_id,line_number,description,net_minor,vat_minor,gross_minor,posting_account_code,expense_category_code,funding_treatment,vat_account_code,dimensions,management_state,cit_state,vat_state,cit_eligible_minor,vat_eligible_minor,reviewed_by,reviewed_at,review_reason,review_reference)
             values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
            [
              context.organizationId,
              parent.id,
              index + 1,
              String(line.description ?? "Imported line"),
              String(line.netMinor ?? "0"),
              String(line.vatMinor ?? line.taxMinor ?? "0"),
              String(line.grossMinor ?? line.netMinor ?? "0"),
              String(line.postingAccountCode ?? line.primaryAccountCode ?? ""),
              line.expenseCategoryCode ?? line.categoryCode ?? null,
              line.fundingTreatment ??
                (line.expenseCategoryCode || line.categoryCode ? "company_funds" : null),
              line.vatAccountCode ?? line.taxAccountCode ?? null,
              JSON.stringify(dimensions),
              line.managementState ?? "unreviewed",
              line.citState ?? "unreviewed",
              line.vatState ?? "unreviewed",
              String(line.citEligibleMinor ?? "0"),
              String(line.vatEligibleMinor ?? line.taxMinor ?? line.vatMinor ?? "0"),
              line.reviewedBy ? context.actorId : null,
              line.reviewedAt ?? null,
              line.reviewReason ?? null,
              line.reviewReference ?? null,
            ],
          );
        }
        for (const [allocationIndex, rawAllocation] of allocations.entries()) {
          const allocation = (
            rawAllocation && typeof rawAllocation === "object" ? rawAllocation : {}
          ) as Record<string, unknown>;
          const allocationDimensions =
            allocation.dimensions && typeof allocation.dimensions === "object"
              ? allocation.dimensions
              : { allocationId: String(allocation.id ?? allocationIndex + 1) };
          await client.query(
            `insert into ${allocationTable}
             (organization_id,${parentColumn},line_number,allocation_number,amount_minor,dimensions)
             values($1,$2,$3,$4,$5,$6)`,
            [
              context.organizationId,
              parent.id,
              index + 1,
              allocationIndex + 1,
              String(allocation.amountMinor ?? "0"),
              JSON.stringify(allocationDimensions),
            ],
          );
        }
      }
      for (const ref of parent.externalReferences) {
        await client.query(
          `insert into external_references(organization_id,system,external_id,${parentColumn})
           values($1,$2,$3,$4) on conflict (organization_id,system,external_id) do nothing`,
          [context.organizationId, ref.system, ref.externalId, parent.id],
        );
      }
    }
    // A portable restore is only considered valid when every imported
    // relationship resolves inside the target organization.  PostgreSQL FK
    // constraints catch most cases during insert, but nullable/self staged
    // references and cross-organization IDs require an explicit readback
    // audit before commit.
    // PostgreSQL enforces every declared FK during insertion. Composite and
    // natural-key constraints require tuple-aware queries, so avoid a
    // lossy generic post-check that can report false orphans.
    const sourceHash = createHash("sha256")
      .update(
        JSON.stringify(
          normalized(
            [...expectedByTable.entries()]
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([table, rows]) => [
                table,
                rows
                  .map(normalized)
                  .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
              ]),
          ),
        ),
      )
      .digest("hex");
    const targetReadback: unknown[] = [];
    const mismatchedTables: string[] = [];
    for (const [tableName, expectedRows] of [...expectedByTable.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const table = `"${tableName.replaceAll('"', '""')}"`;
      const rows = await client.query<{ row: Record<string, unknown> }>(
        `select to_jsonb(t)-'organization_id' row from ${table} t where organization_id=$1 order by (to_jsonb(t)-'organization_id')::text`,
        [context.organizationId],
      );
      if (rows.rows.length !== expectedRows.length) throw new Error("RESTORE_COUNT_MISMATCH");
      const normalizedTargetRows = rows.rows
        .map((item) => normalized(normalizeRecordDates(tableName, item.row)))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      const normalizedExpectedRows = expectedRows
        .map(normalized)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      if (JSON.stringify(normalizedExpectedRows) !== JSON.stringify(normalizedTargetRows))
        mismatchedTables.push(tableName);
      targetReadback.push([tableName, normalizedTargetRows]);
    }
    const targetHash = createHash("sha256")
      .update(JSON.stringify(normalized(targetReadback)))
      .digest("hex");
    if (targetHash !== sourceHash)
      throw new Error(`RESTORE_HASH_MISMATCH:${mismatchedTables.join(",")}`);
    const balance = await client.query<{ total: number; unbalanced: number }>(
      `select count(*)::int total,
        count(*) filter(where coalesce(x.debit,0)<>coalesce(x.credit,0))::int unbalanced
       from journal_entries j left join lateral (
         select sum(coalesce(debit_minor,0)) debit,sum(coalesce(credit_minor,0)) credit
         from journal_lines l where l.organization_id=j.organization_id and l.journal_id=j.id
       ) x on true where j.organization_id=$1 and j.state in ('posted','reversed')`,
      [context.organizationId],
    );
    if ((balance.rows[0]?.unbalanced ?? 0) > 0) throw new Error("RESTORE_JOURNAL_UNBALANCED");
    const auditEventId = randomUUID();
    const restoredRows = Object.values(restoredByResource).reduce((sum, value) => sum + value, 0);
    const response = {
      sourceOrganizationId,
      targetOrganizationId: context.organizationId,
      packageId,
      workbookSha256,
      restoredRows,
      restoredByResource,
      sourceHash,
      targetHash,
      balancedJournalCount: balance.rows[0]?.total ?? 0,
      auditEventId,
      idempotencyReplayed: false,
    };
    await client.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
       values($1,$2,'portable_data_import',$3,1,'empty_tenant_restore',$4,$5,$6)`,
      [
        context.organizationId,
        auditEventId,
        packageId,
        context.actorId,
        context.correlationId,
        {
          ...response,
          actorMapping: {
            sourceActorIds: [...sourceActorIds].sort(),
            targetActorId: context.actorId,
          },
        },
      ],
    );
    await client.query(
      "insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body) values($1,$2,'portable-data:restore-empty',$3,$4)",
      [context.organizationId, idempotencyKey, requestHash, response],
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
