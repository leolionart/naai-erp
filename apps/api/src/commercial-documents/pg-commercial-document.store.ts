import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type {
  CommercialDocumentAction,
  CommercialDocumentContext,
  CommercialDocumentType,
  CreateCommercialDocumentInput,
} from "./commercial-document.types.js";

type StoredDocument = {
  id: string;
  type: CommercialDocumentType;
  state: string;
  document_date: string;
  currency: string;
  party_id: string;
  document_number: string;
  net_minor: string;
  tax_minor: string;
  gross_minor: string;
  control_account_code: string;
  original_document_id: string | null;
  created_by: string;
  version: string;
};

const NEXT: Record<CommercialDocumentType, Record<string, Record<string, string>>> = {
  sales_invoice: {
    draft: { validate: "validated", cancel: "cancelled" },
    validated: { issue: "issued", cancel: "cancelled" },
  },
  purchase_invoice: {
    draft: { capture: "captured", cancel: "cancelled" },
    captured: { verify: "verified", cancel: "cancelled" },
    verified: { approve: "approved", cancel: "cancelled" },
    approved: { post: "posted" },
  },
  credit_note: {
    draft: { validate: "validated", cancel: "cancelled" },
    validated: { issue: "issued", cancel: "cancelled" },
  },
};

@Injectable()
export class PgCommercialDocumentStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async list(
    organizationId: string,
    filters: { type?: string; state?: string; partyId?: string; projectId?: string },
  ) {
    const result = await this.pool.query(
      `select d.*,d.document_date::text document_date,d.due_date::text due_date,
       coalesce(json_agg(l order by l.line_number) filter (where l.line_number is not null),'[]') lines
       from commercial_documents d left join commercial_document_lines l
         on l.organization_id=d.organization_id and l.document_id=d.id
       where d.organization_id=$1 and ($2::text is null or d.type::text=$2)
         and ($3::text is null or d.state::text=$3) and ($4::text is null or d.party_id=$4)
         and ($5::text is null or exists (
           select 1 from commercial_document_lines project_line
           left join commercial_document_allocations project_allocation
             on project_allocation.organization_id=project_line.organization_id
            and project_allocation.document_id=project_line.document_id
            and project_allocation.line_number=project_line.line_number
           where project_line.organization_id=d.organization_id
             and project_line.document_id=d.id
             and (
               project_line.dimensions->>'projectId'=$5
               or project_allocation.dimensions->>'projectId'=$5
             )
         ))
       group by d.organization_id,d.id order by d.document_date desc,d.id`,
      [
        organizationId,
        filters.type ?? null,
        filters.state ?? null,
        filters.partyId ?? null,
        filters.projectId ?? null,
      ],
    );
    return result.rows;
  }

  async get(organizationId: string, id: string) {
    const result = await this.pool.query(
      `select d.*,d.document_date::text document_date,d.due_date::text due_date,
       (select jsonb_build_object(
          'system', r.system,
          'externalId', r.external_id,
          'canonicalUrl', r.canonical_url,
          'checksum', r.checksum,
          'version', r.version,
          'syncedAt', r.synced_at::text,
          'metadata', r.metadata
        ) from external_references r where r.organization_id=d.organization_id and r.document_id=d.id) as "externalReference",
       coalesce(json_agg(jsonb_build_object(
        'lineNumber',l.line_number,'description',l.description,'quantity',l.quantity,
        'unitPriceMinor',l.unit_price_minor::text,'netMinor',l.net_minor::text,
        'taxMinor',l.tax_minor::text,'grossMinor',l.gross_minor::text,
        'primaryAccountCode',l.primary_account_code,'taxAccountCode',l.tax_account_code,
        'taxCode',l.tax_code,'dimensions',l.dimensions,
        'allocations',(select coalesce(json_agg(a order by a.allocation_number),'[]')
          from commercial_document_allocations a where a.organization_id=l.organization_id
            and a.document_id=l.document_id and a.line_number=l.line_number))
        order by l.line_number) filter (where l.line_number is not null),'[]') lines
       from commercial_documents d left join commercial_document_lines l
         on l.organization_id=d.organization_id and l.document_id=d.id
       where d.organization_id=$1 and d.id=$2 group by d.organization_id,d.id`,
      [organizationId, id],
    );
    return result.rows[0];
  }

  async create(
    context: CommercialDocumentContext,
    input: CreateCommercialDocumentInput,
    idempotencyKey: string,
  ) {
    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.lockReplay(
        client,
        context.organizationId,
        idempotencyKey,
        requestHash,
      );
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      if (input.externalReference) {
        const extRefResult = await client.query<{
          document_id: string | null;
          expense_id: string | null;
          canonical_url: string | null;
          checksum: string | null;
          version: string | null;
          metadata: Record<string, unknown>;
        }>(
          "select document_id, expense_id, canonical_url, checksum, version, metadata from external_references where organization_id=$1 and system=$2 and external_id=$3 for update",
          [
            context.organizationId,
            input.externalReference.system,
            input.externalReference.externalId,
          ],
        );
        const extRef = extRefResult.rows[0];
        if (extRef) {
          if (extRef.expense_id) {
            throw new Error("DUPLICATE_DOCUMENT");
          }
          if (extRef.document_id) {
            const docId = extRef.document_id;
            const docResult = await client.query<{ state: string; version: string; type: string }>(
              "select state, version, type from commercial_documents where organization_id=$1 and id=$2 for update",
              [context.organizationId, docId],
            );
            const doc = docResult.rows[0];
            if (!doc) {
              throw new Error("RESOURCE_NOT_FOUND");
            }
            if (doc.state === "draft") {
              if (input.type === "credit_note") {
                await this.assertCreditAllowed(client, context.organizationId, input, docId);
              }
              await client.query(
                "delete from commercial_document_allocations where organization_id=$1 and document_id=$2",
                [context.organizationId, docId],
              );
              await client.query(
                "delete from commercial_document_lines where organization_id=$1 and document_id=$2",
                [context.organizationId, docId],
              );
              const newVersion = BigInt(doc.version) + 1n;
              await client.query(
                `update commercial_documents set
                  type=$3, document_number=$4, series=$5, fiscal_year=$6, party_id=$7, document_date=$8, due_date=$9,
                  currency=$10, net_minor=$11, tax_minor=$12, gross_minor=$13, control_account_code=$14,
                  original_document_id=$15, reason=$16, version=$17, updated_at=now()
                 where organization_id=$1 and id=$2`,
                [
                  context.organizationId,
                  docId,
                  input.type,
                  input.documentNumber,
                  input.series ?? null,
                  input.fiscalYear,
                  input.partyId,
                  input.documentDate,
                  input.dueDate,
                  input.currency,
                  input.netMinor,
                  input.taxMinor,
                  input.grossMinor,
                  input.controlAccountCode,
                  input.originalDocumentId ?? null,
                  input.reason ?? null,
                  newVersion,
                ],
              );
              for (const [lineIndex, line] of input.lines.entries()) {
                await client.query(
                  `insert into commercial_document_lines
                   (organization_id,document_id,line_number,original_line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,
                    primary_account_code,tax_account_code,tax_code,dimensions)
                   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
                  [
                    context.organizationId,
                    docId,
                    lineIndex + 1,
                    line.originalLineNumber ?? null,
                    line.description,
                    line.quantity,
                    line.unitPriceMinor,
                    line.netMinor,
                    line.taxMinor,
                    line.grossMinor,
                    line.primaryAccountCode,
                    line.taxAccountCode ?? null,
                    line.taxCode ?? null,
                    line.dimensions ?? {},
                  ],
                );
                for (const [allocationIndex, allocation] of line.allocations.entries()) {
                  await client.query(
                    `insert into commercial_document_allocations
                     (organization_id,document_id,line_number,allocation_number,amount_minor,dimensions)
                     values ($1,$2,$3,$4,$5,$6)`,
                    [
                      context.organizationId,
                      docId,
                      lineIndex + 1,
                      allocationIndex + 1,
                      allocation.amountMinor,
                      { ...allocation.dimensions, allocationId: allocation.id },
                    ],
                  );
                }
              }
              await client.query(
                `update external_references set
                  canonical_url=$4, checksum=$5, version=$6, synced_at=now(), metadata=$7, updated_at=now()
                 where organization_id=$1 and system=$2 and external_id=$3`,
                [
                  context.organizationId,
                  input.externalReference.system,
                  input.externalReference.externalId,
                  input.externalReference.canonicalUrl ?? extRef.canonical_url,
                  input.externalReference.checksum ?? extRef.checksum,
                  input.externalReference.version ?? extRef.version,
                  input.externalReference.metadata ?? extRef.metadata,
                ],
              );
              const auditEventId = randomUUID();
              const outboxEventId = randomUUID();
              await client.query(
                `insert into resource_audit_events
                 (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
                 values ($1,$2,'commercial_document',$3,$4,'update',$5,$6,$7)`,
                [
                  context.organizationId,
                  auditEventId,
                  docId,
                  newVersion,
                  context.actorId,
                  context.correlationId,
                  { type: input.type, state: "draft" },
                ],
              );
              await client.query(
                `insert into outbox_events
                 (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
                 values ($1,$2,'commercial_document',$3,$4,1,$5,$6)`,
                [
                  context.organizationId,
                  outboxEventId,
                  docId,
                  `${input.type}.updated`,
                  { documentId: docId, type: input.type, state: "draft" },
                  context.correlationId,
                ],
              );
              const response = {
                documentId: docId,
                type: input.type,
                state: "draft",
                resourceVersion: newVersion.toString(),
                auditEventId,
                outboxEventId,
                nextActions: this.nextActions(input.type, "draft"),
              };
              await client.query("commit");
              return { ...response, idempotencyReplayed: true };
            } else {
              const response = {
                documentId: docId,
                type: doc.type as CommercialDocumentType,
                state: doc.state,
                resourceVersion: doc.version.toString(),
                auditEventId: null,
                outboxEventId: null,
                nextActions: this.nextActions(doc.type as CommercialDocumentType, doc.state),
              };
              await client.query("commit");
              return { ...response, idempotencyReplayed: true };
            }
          }
        }
      }

      // Duplicate checks:
      const duplicateResult = await client.query<{ id: string }>(
        `select id from commercial_documents
         where organization_id=$1 and type=$2 and party_id=$3 and document_number=$4 and document_date=$5 and gross_minor=$6 and currency=$7`,
        [
          context.organizationId,
          input.type,
          input.partyId,
          input.documentNumber,
          input.documentDate,
          input.grossMinor,
          input.currency,
        ],
      );
      if (duplicateResult.rows.length > 0) {
        throw new Error("DUPLICATE_DOCUMENT");
      }

      if (input.type === "purchase_invoice") {
        const duplicateExpense = await client.query<{ id: string }>(
          `select id from expenses
           where organization_id=$1 and payee_party_id=$2 and expense_date=$3 and gross_minor=$4 and currency=$5`,
          [
            context.organizationId,
            input.partyId,
            input.documentDate,
            input.grossMinor,
            input.currency,
          ],
        );
        if (input.migrationSourceExpenseId) {
          const migrationSource = await client.query<{ id: string }>(
            `select id from expenses
             where organization_id=$1 and id=$2 and payee_party_id=$3 and expense_date=$4
               and gross_minor=$5 and currency=$6`,
            [
              context.organizationId,
              input.migrationSourceExpenseId,
              input.partyId,
              input.migrationSourceExpenseDate,
              input.grossMinor,
              input.currency,
            ],
          );
          if (!migrationSource.rows[0]) throw new Error("MIGRATION_SOURCE_EXPENSE_MISMATCH");
        } else if (duplicateExpense.rows.length > 0) {
          throw new Error("DUPLICATE_DOCUMENT");
        }
      }

      const id = input.id ?? randomUUID();
      if (input.type === "credit_note")
        await this.assertCreditAllowed(client, context.organizationId, input);
      await client.query(
        `insert into commercial_documents
         (organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,
          currency,net_minor,tax_minor,gross_minor,control_account_code,original_document_id,reason,created_by)
         values ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          context.organizationId,
          id,
          input.type,
          input.documentNumber,
          input.series ?? null,
          input.fiscalYear,
          input.partyId,
          input.documentDate,
          input.dueDate,
          input.currency,
          input.netMinor,
          input.taxMinor,
          input.grossMinor,
          input.controlAccountCode,
          input.originalDocumentId ?? null,
          input.reason ?? null,
          context.actorId,
        ],
      );
      for (const [lineIndex, line] of input.lines.entries()) {
        await client.query(
          `insert into commercial_document_lines
           (organization_id,document_id,line_number,original_line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,
            primary_account_code,tax_account_code,tax_code,dimensions)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            context.organizationId,
            id,
            lineIndex + 1,
            line.originalLineNumber ?? null,
            line.description,
            line.quantity,
            line.unitPriceMinor,
            line.netMinor,
            line.taxMinor,
            line.grossMinor,
            line.primaryAccountCode,
            line.taxAccountCode ?? null,
            line.taxCode ?? null,
            line.dimensions ?? {},
          ],
        );
        for (const [allocationIndex, allocation] of line.allocations.entries())
          await client.query(
            `insert into commercial_document_allocations
             (organization_id,document_id,line_number,allocation_number,amount_minor,dimensions)
             values ($1,$2,$3,$4,$5,$6)`,
            [
              context.organizationId,
              id,
              lineIndex + 1,
              allocationIndex + 1,
              allocation.amountMinor,
              { ...allocation.dimensions, allocationId: allocation.id },
            ],
          );
      }

      if (input.externalReference) {
        await client.query(
          `insert into external_references
           (organization_id, system, external_id, document_id, canonical_url, checksum, version, metadata)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            context.organizationId,
            input.externalReference.system,
            input.externalReference.externalId,
            id,
            input.externalReference.canonicalUrl ?? null,
            input.externalReference.checksum ?? null,
            input.externalReference.version ?? null,
            input.externalReference.metadata ?? {},
          ],
        );
      }

      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
         values ($1,$2,'commercial_document',$3,1,'create',$4,$5,$6)`,
        [
          context.organizationId,
          auditEventId,
          id,
          context.actorId,
          context.correlationId,
          {
            type: input.type,
            state: "draft",
            ...(input.migrationSourceExpenseId
              ? {
                  migrationSourceExpenseId: input.migrationSourceExpenseId,
                  migrationSourceExpenseDate: input.migrationSourceExpenseDate,
                }
              : {}),
          },
        ],
      );
      await client.query(
        `insert into outbox_events
         (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
         values ($1,$2,'commercial_document',$3,$4,1,$5,$6)`,
        [
          context.organizationId,
          outboxEventId,
          id,
          `${input.type}.created`,
          { documentId: id, type: input.type, state: "draft" },
          context.correlationId,
        ],
      );
      const response = {
        documentId: id,
        type: input.type,
        state: "draft",
        resourceVersion: "1",
        auditEventId,
        outboxEventId,
        nextActions: this.nextActions(input.type, "draft"),
      };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        "commercial-document:create",
        requestHash,
        response,
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

  async update(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion: string,
    merged: CreateCommercialDocumentInput,
    idempotencyKey: string,
  ) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ expectedVersion, input: merged }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.lockReplay(
        client,
        context.organizationId,
        idempotencyKey,
        requestHash,
      );
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }

      const existingResult = await client.query<{ state: string; version: string }>(
        `select state, version from commercial_documents
         where organization_id=$1 and id=$2 for update`,
        [context.organizationId, id],
      );
      const existing = existingResult.rows[0];
      if (!existing) throw new Error("RESOURCE_NOT_FOUND");
      if (existing.state !== "draft") throw new Error("INVALID_STATE_TRANSITION");
      if (existing.version.toString() !== expectedVersion) throw new Error("VERSION_CONFLICT");

      const extRefRows = await client.query<{
        system: string;
        external_id: string;
      }>(
        "select system, external_id from external_references where organization_id=$1 and document_id=$2 for update",
        [context.organizationId, id],
      );
      const existingExtRef = extRefRows.rows[0];

      if (merged.externalReference) {
        const extRefResult = await client.query<{
          document_id: string | null;
          expense_id: string | null;
        }>(
          "select document_id, expense_id from external_references where organization_id=$1 and system=$2 and external_id=$3 for update",
          [
            context.organizationId,
            merged.externalReference.system,
            merged.externalReference.externalId,
          ],
        );
        const extRef = extRefResult.rows[0];
        if (extRef) {
          if (extRef.expense_id || (extRef.document_id && extRef.document_id !== id)) {
            throw new Error("DUPLICATE_DOCUMENT");
          }
        }
      }

      const duplicateResult = await client.query<{ id: string }>(
        `select id from commercial_documents
         where organization_id=$1 and type=$2 and party_id=$3 and document_number=$4 and document_date=$5 and gross_minor=$6 and currency=$7 and id<>$8`,
        [
          context.organizationId,
          merged.type,
          merged.partyId,
          merged.documentNumber,
          merged.documentDate,
          merged.grossMinor,
          merged.currency,
          id,
        ],
      );
      if (duplicateResult.rows.length > 0) {
        throw new Error("DUPLICATE_DOCUMENT");
      }

      if (merged.type === "purchase_invoice") {
        const duplicateExpense = await client.query<{ id: string }>(
          `select id from expenses
           where organization_id=$1 and payee_party_id=$2 and expense_date=$3 and gross_minor=$4 and currency=$5`,
          [
            context.organizationId,
            merged.partyId,
            merged.documentDate,
            merged.grossMinor,
            merged.currency,
          ],
        );
        if (duplicateExpense.rows.length > 0) {
          throw new Error("DUPLICATE_DOCUMENT");
        }
      }

      if (merged.type === "credit_note") {
        await this.assertCreditAllowed(client, context.organizationId, merged, id);
      }

      await client.query(
        "delete from commercial_document_allocations where organization_id=$1 and document_id=$2",
        [context.organizationId, id],
      );
      await client.query(
        "delete from commercial_document_lines where organization_id=$1 and document_id=$2",
        [context.organizationId, id],
      );

      if (merged.externalReference) {
        if (
          existingExtRef &&
          (existingExtRef.system !== merged.externalReference.system ||
            existingExtRef.external_id !== merged.externalReference.externalId)
        ) {
          await client.query(
            "delete from external_references where organization_id=$1 and system=$2 and external_id=$3",
            [context.organizationId, existingExtRef.system, existingExtRef.external_id],
          );
        }
        await client.query(
          `insert into external_references
           (organization_id, system, external_id, document_id, canonical_url, checksum, version, metadata)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (organization_id, system, external_id) do update set
             document_id=excluded.document_id,
             canonical_url=excluded.canonical_url,
             checksum=excluded.checksum,
             version=excluded.version,
             metadata=excluded.metadata,
             synced_at=now(),
             updated_at=now()`,
          [
            context.organizationId,
            merged.externalReference.system,
            merged.externalReference.externalId,
            id,
            merged.externalReference.canonicalUrl ?? null,
            merged.externalReference.checksum ?? null,
            merged.externalReference.version ?? null,
            merged.externalReference.metadata ?? {},
          ],
        );
      }

      const newVersion = BigInt(existing.version) + 1n;
      await client.query(
        `update commercial_documents set
          document_number=$3, series=$4, fiscal_year=$5, party_id=$6, document_date=$7, due_date=$8,
          currency=$9, net_minor=$10, tax_minor=$11, gross_minor=$12, control_account_code=$13,
          original_document_id=$14, reason=$15, version=$16, updated_at=now()
         where organization_id=$1 and id=$2`,
        [
          context.organizationId,
          id,
          merged.documentNumber,
          merged.series ?? null,
          merged.fiscalYear,
          merged.partyId,
          merged.documentDate,
          merged.dueDate,
          merged.currency,
          merged.netMinor,
          merged.taxMinor,
          merged.grossMinor,
          merged.controlAccountCode,
          merged.originalDocumentId ?? null,
          merged.reason ?? null,
          newVersion,
        ],
      );

      for (const [lineIndex, line] of merged.lines.entries()) {
        await client.query(
          `insert into commercial_document_lines
           (organization_id,document_id,line_number,original_line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,
            primary_account_code,tax_account_code,tax_code,dimensions)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            context.organizationId,
            id,
            lineIndex + 1,
            line.originalLineNumber ?? null,
            line.description,
            line.quantity,
            line.unitPriceMinor,
            line.netMinor,
            line.taxMinor,
            line.grossMinor,
            line.primaryAccountCode,
            line.taxAccountCode ?? null,
            line.taxCode ?? null,
            line.dimensions ?? {},
          ],
        );
        for (const [allocationIndex, allocation] of line.allocations.entries()) {
          await client.query(
            `insert into commercial_document_allocations
             (organization_id,document_id,line_number,allocation_number,amount_minor,dimensions)
             values ($1,$2,$3,$4,$5,$6)`,
            [
              context.organizationId,
              id,
              lineIndex + 1,
              allocationIndex + 1,
              allocation.amountMinor,
              { ...allocation.dimensions, allocationId: allocation.id },
            ],
          );
        }
      }

      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
         values ($1,$2,'commercial_document',$3,$4,'update',$5,$6,$7)`,
        [
          context.organizationId,
          auditEventId,
          id,
          newVersion,
          context.actorId,
          context.correlationId,
          { type: merged.type, state: "draft" },
        ],
      );
      await client.query(
        `insert into outbox_events
         (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
         values ($1,$2,'commercial_document',$3,$4,1,$5,$6)`,
        [
          context.organizationId,
          outboxEventId,
          id,
          `${merged.type}.updated`,
          { documentId: id, type: merged.type, state: "draft" },
          context.correlationId,
        ],
      );

      const response = {
        documentId: id,
        type: merged.type,
        state: "draft",
        resourceVersion: newVersion.toString(),
        auditEventId,
        outboxEventId,
        nextActions: this.nextActions(merged.type, "draft"),
      };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        "commercial-document:update",
        requestHash,
        response,
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

  async transition(
    context: CommercialDocumentContext,
    id: string,
    action: CommercialDocumentAction,
    reason: string,
    idempotencyKey: string,
  ) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ id, action, reason }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.lockReplay(
        client,
        context.organizationId,
        idempotencyKey,
        requestHash,
      );
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      const found = await client.query<StoredDocument>(
        `select id,type,state,document_date::text,currency,party_id,document_number,net_minor::text,tax_minor::text,
          gross_minor::text,control_account_code,original_document_id,created_by,version::text
         from commercial_documents where organization_id=$1 and id=$2 for update`,
        [context.organizationId, id],
      );
      const document = found.rows[0];
      if (!document) throw new Error("RESOURCE_NOT_FOUND");
      const next = NEXT[document.type][document.state]?.[action];
      if (!next) throw new Error("INVALID_DOCUMENT_TRANSITION");
      if (action === "approve" && document.created_by === context.actorId)
        await this.assertSelfApproval(client, context.organizationId, BigInt(document.gross_minor));
      let journalId: string | undefined;
      if (action === "issue" || action === "post") {
        if (document.type === "sales_invoice")
          await this.assertSalesContractCoverage(client, context.organizationId, document);
        await this.assertPostingPeriod(client, context, document.document_date);
        journalId = await this.postDocumentJournal(client, context, document);
      }
      const version = (BigInt(document.version) + 1n).toString();
      await client.query(
        `update commercial_documents set state=$3,version=version+1,updated_at=now(),
          approved_by=case when $4='approve' then $5 else approved_by end,
          approved_at=case when $4='approve' then now() else approved_at end,
          issued_or_posted_by=case when $4 in ('issue','post') then $5 else issued_or_posted_by end,
          issued_or_posted_at=case when $4 in ('issue','post') then now() else issued_or_posted_at end,
          journal_id=coalesce($6::text,journal_id)
         where organization_id=$1 and id=$2`,
        [context.organizationId, id, next, action, context.actorId, journalId ?? null],
      );
      const eventId = randomUUID();
      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await client.query(
        `insert into commercial_document_events
         (organization_id,id,document_id,from_state,to_state,actor_id,reason,correlation_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          context.organizationId,
          eventId,
          id,
          document.state,
          next,
          context.actorId,
          reason,
          context.correlationId,
        ],
      );
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values ($1,$2,'commercial_document',$3,$4,$5,$6,$7,$8,$9)`,
        [
          context.organizationId,
          auditEventId,
          id,
          version,
          action,
          context.actorId,
          context.correlationId,
          { state: document.state },
          { state: next, journalId: journalId ?? null },
        ],
      );
      await client.query(
        `insert into outbox_events
         (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
         values ($1,$2,'commercial_document',$3,$4,1,$5,$6)`,
        [
          context.organizationId,
          outboxEventId,
          id,
          `${document.type}.${next}`,
          { documentId: id, type: document.type, state: next, journalId: journalId ?? null },
          context.correlationId,
        ],
      );
      const response = {
        documentId: id,
        type: document.type,
        state: next,
        resourceVersion: version,
        journalId: journalId ?? null,
        eventId,
        auditEventId,
        outboxEventId,
        nextActions: this.nextActions(document.type, next),
      };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        `commercial-document:${action}`,
        requestHash,
        response,
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

  private nextActions(type: CommercialDocumentType, state: string) {
    return Object.keys(NEXT[type][state] ?? {});
  }
  private async assertSalesContractCoverage(
    client: PoolClient,
    organizationId: string,
    document: StoredDocument,
  ) {
    const allocations = await client.query<{ project_id: string | null; proposed: string }>(
      `select a.dimensions->>'projectId' project_id,sum(a.amount_minor)::text proposed
         from commercial_document_allocations a
        where a.organization_id=$1 and a.document_id=$2
        group by a.dimensions->>'projectId'`,
      [organizationId, document.id],
    );
    if (!allocations.rows.length || allocations.rows.some((row) => !row.project_id))
      throw new Error("SALES_INVOICE_PROJECT_REQUIRED");
    for (const row of [...allocations.rows].sort((a, b) =>
      String(a.project_id).localeCompare(String(b.project_id)),
    )) {
      const projectId = String(row.project_id);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${organizationId}:sales-contract-cap:${projectId}`,
      ]);
      const project = await client.query<{ client_party_id: string; currency: string }>(
        `select client_party_id,currency from projects where organization_id=$1 and id=$2 and state in('planned','active','on_hold')`,
        [organizationId, projectId],
      );
      if (!project.rows[0]) throw new Error("SALES_INVOICE_PROJECT_INVALID");
      if (project.rows[0].client_party_id !== document.party_id)
        throw new Error("SALES_INVOICE_PROJECT_CUSTOMER_MISMATCH");
      if (project.rows[0].currency !== document.currency)
        throw new Error("SALES_INVOICE_CONTRACT_CURRENCY_MISMATCH");
      const capacity = await client.query<{ allowed: string; used: string }>(
        `select
           (coalesce((select sum(value_minor) from contracts where organization_id=$1 and project_id=$2 and currency=$3),0)
            + coalesce((select sum(expected_revenue_impact_minor) from scope_changes where organization_id=$1 and project_id=$2 and state='approved'),0))::text allowed,
           coalesce((select sum(case when d.type='credit_note' then -a.amount_minor else a.amount_minor end)
             from commercial_document_allocations a join commercial_documents d
               on d.organization_id=a.organization_id and d.id=a.document_id
            where a.organization_id=$1 and a.dimensions->>'projectId'=$2 and d.id<>$4
              and d.state in('issued','posted','partially_paid','paid')),0)::text used`,
        [organizationId, projectId, document.currency, document.id],
      );
      const allowed = BigInt(capacity.rows[0]?.allowed ?? "0");
      if (allowed <= 0n) throw new Error("SALES_INVOICE_CONTRACT_REQUIRED");
      if (BigInt(capacity.rows[0]?.used ?? "0") + BigInt(row.proposed) > allowed)
        throw new Error("SALES_INVOICE_CONTRACT_CAP_EXCEEDED");
    }
  }
  private async lockReplay(client: PoolClient, organizationId: string, key: string, hash: string) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${organizationId}:${key}`,
    ]);
    const replay = await client.query<{
      request_hash: string;
      response_body: Record<string, unknown>;
    }>(
      "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
      [organizationId, key],
    );
    if (!replay.rows[0]) return undefined;
    if (replay.rows[0].request_hash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
    return replay.rows[0].response_body;
  }
  private saveReplay(
    client: PoolClient,
    organizationId: string,
    key: string,
    operation: string,
    hash: string,
    response: unknown,
  ) {
    return client.query(
      `insert into api_idempotency_records
      (organization_id,idempotency_key,operation,request_hash,response_body) values ($1,$2,$3,$4,$5)`,
      [organizationId, key, operation, hash, response],
    );
  }
  private async assertSelfApproval(client: PoolClient, organizationId: string, total: bigint) {
    const policy = await client.query<{
      allow_self_approval: boolean;
      self_approval_max_minor: string | null;
    }>(
      "select allow_self_approval,self_approval_max_minor from accounting_workflow_policies where organization_id=$1",
      [organizationId],
    );
    if (
      !policy.rows[0]?.allow_self_approval ||
      total > BigInt(policy.rows[0].self_approval_max_minor ?? "-1")
    )
      throw new Error("MAKER_CHECKER_VIOLATION");
  }
  private async assertPostingPeriod(
    client: PoolClient,
    context: CommercialDocumentContext,
    date: string,
  ) {
    const period = await client.query<{ state: string }>(
      `select state from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on`,
      [context.organizationId, date],
    );
    if (period.rows.length !== 1)
      throw new Error(period.rows.length ? "FISCAL_PERIOD_AMBIGUOUS" : "FISCAL_PERIOD_NOT_FOUND");
    if (period.rows[0]!.state === "hard_locked") throw new Error("PERIOD_HARD_LOCKED");
    if (
      period.rows[0]!.state === "soft_locked" &&
      !context.roles.some((r) => ["owner", "finance_admin"].includes(r))
    )
      throw new Error("PERIOD_SOFT_LOCKED");
  }
  private async assertCreditAllowed(
    client: PoolClient,
    organizationId: string,
    input: CreateCommercialDocumentInput,
    excludeDocumentId?: string,
  ) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${organizationId}:credit:${input.originalDocumentId}`,
    ]);
    const original = await client.query<{
      type: string;
      party_id: string;
      currency: string;
      net_minor: string;
      tax_minor: string;
      state: string;
    }>(
      `select type,party_id,currency,net_minor::text,tax_minor::text,state from commercial_documents
       where organization_id=$1 and id=$2 for update`,
      [organizationId, input.originalDocumentId],
    );
    const row = original.rows[0];
    if (
      !row ||
      row.type !== "sales_invoice" ||
      !["issued", "partially_paid", "paid"].includes(row.state)
    )
      throw new Error("CREDIT_ORIGINAL_INVALID");
    if (row.party_id !== input.partyId || row.currency !== input.currency)
      throw new Error("CREDIT_ORIGINAL_MISMATCH");
    const credited = await client.query<{ net: string; tax: string }>(
      `select coalesce(sum(net_minor),0)::text net,coalesce(sum(tax_minor),0)::text tax
      from commercial_documents where organization_id=$1 and type='credit_note' and original_document_id=$2
        and state not in ('cancelled') and ($3::text is null or id<>$3)`,
      [organizationId, input.originalDocumentId, excludeDocumentId ?? null],
    );
    if (
      BigInt(credited.rows[0]!.net) + BigInt(input.netMinor) > BigInt(row.net_minor) ||
      BigInt(credited.rows[0]!.tax) + BigInt(input.taxMinor) > BigInt(row.tax_minor)
    )
      throw new Error("CREDIT_EXCEEDS_REMAINING");
    for (const line of input.lines) {
      if (!line.originalLineNumber) throw new Error("CREDIT_ORIGINAL_LINE_REQUIRED");
      const originalLine = await client.query<{
        net_minor: string;
        tax_minor: string;
        primary_account_code: string;
        tax_account_code: string | null;
      }>(
        `select net_minor::text,tax_minor::text,primary_account_code,tax_account_code
         from commercial_document_lines where organization_id=$1 and document_id=$2 and line_number=$3`,
        [organizationId, input.originalDocumentId, line.originalLineNumber],
      );
      const source = originalLine.rows[0];
      if (
        !source ||
        source.primary_account_code !== line.primaryAccountCode ||
        source.tax_account_code !== (line.taxAccountCode ?? null)
      )
        throw new Error("CREDIT_ORIGINAL_LINE_INVALID");
      const prior = await client.query<{ net: string; tax: string }>(
        `select coalesce(sum(l.net_minor),0)::text net,coalesce(sum(l.tax_minor),0)::text tax
         from commercial_document_lines l join commercial_documents d
           on d.organization_id=l.organization_id and d.id=l.document_id
         where d.organization_id=$1 and d.type='credit_note' and d.original_document_id=$2
           and d.state<>'cancelled' and l.original_line_number=$3
           and ($4::text is null or d.id<>$4)`,
        [
          organizationId,
          input.originalDocumentId,
          line.originalLineNumber,
          excludeDocumentId ?? null,
        ],
      );
      if (
        BigInt(prior.rows[0]!.net) + BigInt(line.netMinor) > BigInt(source.net_minor) ||
        BigInt(prior.rows[0]!.tax) + BigInt(line.taxMinor) > BigInt(source.tax_minor)
      )
        throw new Error("CREDIT_EXCEEDS_REMAINING");
    }
  }

  private async postDocumentJournal(
    client: PoolClient,
    context: CommercialDocumentContext,
    document: StoredDocument,
  ) {
    const journalId = randomUUID();
    const lines = await client.query<{
      line_number: number;
      description: string;
      net_minor: string;
      tax_minor: string;
      primary_account_code: string;
      tax_account_code: string | null;
      dimensions: Record<string, string>;
    }>(
      `select line_number,description,net_minor::text,tax_minor::text,primary_account_code,tax_account_code,dimensions
       from commercial_document_lines where organization_id=$1 and document_id=$2 order by line_number`,
      [context.organizationId, document.id],
    );
    const journalLines: Array<{
      account: string;
      debit?: bigint;
      credit?: bigint;
      description: string;
      dimensions: Record<string, string>;
    }> = [];
    for (const line of lines.rows) {
      const allocations = await client.query<{
        amount_minor: string;
        dimensions: Record<string, string>;
      }>(
        `select amount_minor::text,dimensions from commercial_document_allocations
         where organization_id=$1 and document_id=$2 and line_number=$3 order by allocation_number`,
        [context.organizationId, document.id, line.line_number],
      );
      if (
        allocations.rows.reduce((sum, allocation) => sum + BigInt(allocation.amount_minor), 0n) !==
        BigInt(line.net_minor)
      )
        throw new Error("DOCUMENT_ALLOCATION_MISMATCH");
      let allocatedTax = 0n;
      for (const [index, allocation] of allocations.rows.entries()) {
        const net = BigInt(allocation.amount_minor);
        const tax =
          index === allocations.rows.length - 1
            ? BigInt(line.tax_minor) - allocatedTax
            : (BigInt(line.tax_minor) * net) / BigInt(line.net_minor);
        allocatedTax += tax;
        const dimensions = {
          ...line.dimensions,
          ...allocation.dimensions,
          partyId: document.party_id,
          sourceDocumentId: document.id,
          sourceLineNumber: String(line.line_number),
        };
        if (document.type === "sales_invoice") {
          journalLines.push({
            account: line.primary_account_code,
            credit: net,
            description: line.description,
            dimensions,
          });
          if (tax > 0n)
            journalLines.push({
              account: line.tax_account_code!,
              credit: tax,
              description: `VAT ${line.description}`,
              dimensions,
            });
        } else if (document.type === "purchase_invoice") {
          const taxState = allocation.dimensions.taxState;
          const taxIsDeductible = ["eligible", "accountant_override"].includes(taxState ?? "");
          journalLines.push({
            account: line.primary_account_code,
            debit: net + (taxIsDeductible ? 0n : tax),
            description: line.description,
            dimensions,
          });
          if (tax > 0n && taxIsDeductible)
            journalLines.push({
              account: line.tax_account_code!,
              debit: tax,
              description: `VAT ${line.description}`,
              dimensions,
            });
        } else {
          journalLines.push({
            account: line.primary_account_code,
            debit: net,
            description: line.description,
            dimensions,
          });
          if (tax > 0n)
            journalLines.push({
              account: line.tax_account_code!,
              debit: tax,
              description: `VAT credit ${line.description}`,
              dimensions,
            });
        }
      }
    }
    const controlDimensions = {
      partyId: document.party_id,
      sourceDocumentId: document.id,
      documentNumber: document.document_number,
    };
    journalLines.push(
      document.type === "purchase_invoice"
        ? {
            account: document.control_account_code,
            credit: BigInt(document.gross_minor),
            description: document.document_number,
            dimensions: controlDimensions,
          }
        : document.type === "credit_note"
          ? {
              account: document.control_account_code,
              credit: BigInt(document.gross_minor),
              description: document.document_number,
              dimensions: controlDimensions,
            }
          : {
              account: document.control_account_code,
              debit: BigInt(document.gross_minor),
              description: document.document_number,
              dimensions: controlDimensions,
            },
    );
    const debit = journalLines.reduce((s, l) => s + (l.debit ?? 0n), 0n);
    const credit = journalLines.reduce((s, l) => s + (l.credit ?? 0n), 0n);
    if (debit !== credit) throw new Error("JOURNAL_UNBALANCED");
    await client.query(
      `insert into journal_entries
      (organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)
      values ($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,'Commercial document workflow',now(),$6)`,
      [
        context.organizationId,
        journalId,
        document.document_date,
        `${document.type} ${document.document_number}`,
        document.currency,
        context.actorId,
      ],
    );
    for (const [index, line] of journalLines.entries())
      await client.query(
        `insert into journal_lines
      (organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
      values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          context.organizationId,
          journalId,
          index + 1,
          line.account,
          line.debit?.toString() ?? null,
          line.credit?.toString() ?? null,
          line.description,
          line.dimensions,
        ],
      );
    await client.query(
      `insert into outbox_events
      (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
      values ($1,$2,'journal',$3,'journal.posted',1,$4,$5)`,
      [
        context.organizationId,
        randomUUID(),
        journalId,
        { journalId, sourceDocumentId: document.id },
        context.correlationId,
      ],
    );
    return journalId;
  }
}
