import { mergePaymentEvidenceFields } from "../payment-evidence/payment-input.helper.js";
import { createHash, randomUUID } from "node:crypto";
import {
  applyDocumentLineCategoryUpdate,
  assertDocumentCategory,
} from "../master-data/canonical-category-validation.js";
import type {
  CommercialDocumentContext,
  CommercialDocumentType,
  CreateCommercialDocumentInput,
  CommercialDocumentMetadataInput,
} from "./commercial-document.types.js";
import type { PgCommercialDocumentStore } from "./pg-commercial-document.store.js";

export async function updateMetadataOperation(
  this: PgCommercialDocumentStore,
  context: CommercialDocumentContext,
  id: string,
  expectedVersion: string,
  input: CommercialDocumentMetadataInput,
  idempotencyKey: string,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify({ id, expectedVersion, input }))
    .digest("hex");
  const client = await this.pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "select set_config('app.commercial_document_metadata_correction','on',true)",
    );
    const replay = await this.lockReplay(client, context.organizationId, idempotencyKey, hash);
    if (replay) {
      await client.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    const doc = await client.query<{
      version: string;
      party_id: string;
      state: string;
      type: CommercialDocumentType;
      journal_id: string | null;
    }>(
      "select version::text,party_id,state,type,journal_id from commercial_documents where organization_id=$1 and id=$2 for update",
      [context.organizationId, id],
    );
    if (!doc.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    if (doc.rows[0].version !== expectedVersion) throw new Error("VERSION_CONFLICT");
    const targetParty = input.partyId ?? doc.rows[0].party_id;
    const role = doc.rows[0].type === "sales_invoice" ? "client" : "supplier";
    if (Object.prototype.hasOwnProperty.call(input, "partyId")) {
      if (!targetParty) throw new Error("PARTY_ROLE_NOT_FOUND");
      const party = await client.query(
        `with recursive chain(id,path) as (
         select $2::text,array[$2::text]
         union all
         select l.target_party_id,c.path||l.target_party_id
         from chain c join party_merge_links l
           on l.organization_id=$1 and l.source_party_id=c.id
         where not l.target_party_id=any(c.path)
       )
       select 1 from chain c
       join parties p on p.organization_id=$1 and p.id=c.id and p.status='active'
       join party_roles r on r.organization_id=p.organization_id and r.party_id=p.id and r.role=$3
       limit 1`,
        [context.organizationId, targetParty, role],
      );
      if (!party.rows[0]) throw new Error("PARTY_ROLE_NOT_FOUND");
    }
    if (input.projectId) {
      const project = await client.query<{ client_party_id: string; state: string }>(
        "select client_party_id,state::text from projects where organization_id=$1 and id=$2 and state in ('planned','active','on_hold','completed')",
        [context.organizationId, input.projectId],
      );
      if (!project.rows[0]) throw new Error("PROJECT_NOT_FOUND");
      const targetProject = project.rows[0];
      if (
        doc.rows[0].type === "sales_invoice" &&
        targetParty &&
        Object.prototype.hasOwnProperty.call(input, "partyId")
      ) {
        const parties = await client.query<{ source_id: string; canonical_id: string }>(
          `with recursive chain(source_id,id,path) as (
             select p.id,p.id,array[p.id] from parties p
             where p.organization_id=$1 and p.id in ($2,$3)
             union all
             select c.source_id,l.target_party_id,c.path||l.target_party_id
             from chain c join party_merge_links l
               on l.organization_id=$1 and l.source_party_id=c.id
             where not l.target_party_id=any(c.path)
           )
           select c.source_id,c.id canonical_id from chain c
           where not exists (
             select 1 from party_merge_links l
             where l.organization_id=$1 and l.source_party_id=c.id
               and not l.target_party_id=any(c.path)
           )`,
          [context.organizationId, targetParty, targetProject.client_party_id],
        );
        const invoiceCanonical = parties.rows.find(
          (p) => p.source_id === targetParty,
        )?.canonical_id;
        const projectCanonical = parties.rows.find(
          (p) => p.source_id === targetProject.client_party_id,
        )?.canonical_id;
        if (!invoiceCanonical || !projectCanonical || invoiceCanonical !== projectCanonical)
          throw new Error("PROJECT_CUSTOMER_MISMATCH");
      }
    }
    if (input.category) {
      await assertDocumentCategory(
        client,
        context.organizationId,
        doc.rows[0].type,
        input.category,
      );
    }
    const before = await client.query(
      "select line_number,description,dimensions from commercial_document_lines where organization_id=$1 and document_id=$2 order by line_number",
      [context.organizationId, id],
    );
    if (!before.rows.length) throw new Error("RESOURCE_NOT_FOUND");
    if (Object.prototype.hasOwnProperty.call(input, "partyId"))
      await client.query(
        "update commercial_documents set party_id=$3 where organization_id=$1 and id=$2",
        [context.organizationId, id, input.partyId],
      );
    if (Object.prototype.hasOwnProperty.call(input, "description"))
      await client.query(
        "update commercial_document_lines set description=$3 where organization_id=$1 and document_id=$2",
        [context.organizationId, id, input.description],
      );
    if (Object.prototype.hasOwnProperty.call(input, "projectId")) {
      await client.query(
        "select set_config('app.commercial_document_metadata_correction','on',true)",
      );
      await client.query(
        "update commercial_document_lines set dimensions=case when $3::text is null then coalesce(dimensions,'{}'::jsonb)-'projectId' else coalesce(dimensions,'{}'::jsonb)||jsonb_build_object('projectId',$3::text) end where organization_id=$1 and document_id=$2",
        [context.organizationId, id, input.projectId ?? null],
      );
      await client.query(
        "update commercial_document_allocations set dimensions=case when $3::text is null then coalesce(dimensions,'{}'::jsonb)-'projectId' else coalesce(dimensions,'{}'::jsonb)||jsonb_build_object('projectId',$3::text) end where organization_id=$1 and document_id=$2",
        [context.organizationId, id, input.projectId ?? null],
      );
      if (doc.rows[0].journal_id) {
        await client.query(
          "select set_config('app.journal_dimension_metadata_correction','on',true)",
        );
        await client.query(
          "update journal_lines set dimensions=case when $3::text is null then coalesce(dimensions,'{}'::jsonb)-'projectId' else coalesce(dimensions,'{}'::jsonb)||jsonb_build_object('projectId',$3::text) end where organization_id=$1 and journal_id=$2",
          [context.organizationId, doc.rows[0].journal_id, input.projectId ?? null],
        );
      }
    }
    if (Object.prototype.hasOwnProperty.call(input, "category"))
      await applyDocumentLineCategoryUpdate(
        client,
        context.organizationId,
        id,
        input.category ?? null,
      );
    const version = (BigInt(doc.rows[0].version) + 1n).toString();
    await client.query(
      "update commercial_documents set version=$3,updated_at=now() where organization_id=$1 and id=$2",
      [context.organizationId, id, version],
    );
    const auditEventId = randomUUID();
    await client.query(
      "insert into resource_audit_events (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state) values($1,$2,'commercial-document',$3,$4,'update_metadata',$5,$6,$7,$8)",
      [
        context.organizationId,
        auditEventId,
        id,
        version,
        context.actorId,
        context.correlationId,
        { partyId: doc.rows[0].party_id, lines: before.rows },
        { ...input },
      ],
    );
    const response = {
      documentId: id,
      resourceVersion: version,
      auditEventId,
      state: doc.rows[0].state,
    };
    await this.saveReplay(
      client,
      context.organizationId,
      idempotencyKey,
      "commercial-document:update-metadata",
      hash,
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

export async function updateCategoryOperation(
  this: PgCommercialDocumentStore,
  context: CommercialDocumentContext,
  id: string,
  category: string,
  idempotencyKey: string,
) {
  const hash = createHash("sha256").update(JSON.stringify({ id, category })).digest("hex");
  const client = await this.pool.connect();
  try {
    await client.query("begin");
    const replay = await this.lockReplay(client, context.organizationId, idempotencyKey, hash);
    if (replay) {
      await client.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    const document = await client.query<{ version: string; type: CommercialDocumentType }>(
      "select version::text,type from commercial_documents where organization_id=$1 and id=$2 for update",
      [context.organizationId, id],
    );
    if (!document.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    await assertDocumentCategory(client, context.organizationId, document.rows[0].type, category);
    const before = await client.query<{ line_number: number; category: string | null }>(
      "select line_number,coalesce(category_code,dimensions->>'category') category from commercial_document_lines where organization_id=$1 and document_id=$2 order by line_number",
      [context.organizationId, id],
    );
    if (!before.rows.length) throw new Error("RESOURCE_NOT_FOUND");
    await client.query(
      "select set_config('app.commercial_document_metadata_correction','on',true)",
    );
    await applyDocumentLineCategoryUpdate(client, context.organizationId, id, category);
    const version = BigInt(document.rows[0].version) + 1n;
    await client.query(
      "update commercial_documents set version=$3,updated_at=now() where organization_id=$1 and id=$2",
      [context.organizationId, id, version.toString()],
    );
    const auditEventId = randomUUID();
    await client.query(
      `insert into resource_audit_events
       (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
       values($1,$2,'commercial-document',$3,$4,'update_category',$5,$6,$7,$8)`,
      [
        context.organizationId,
        auditEventId,
        id,
        version.toString(),
        context.actorId,
        context.correlationId,
        { lines: before.rows },
        { category },
      ],
    );
    const response = { documentId: id, category, version: version.toString(), auditEventId };
    await this.saveReplay(
      client,
      context.organizationId,
      idempotencyKey,
      "commercial-document:update-category",
      hash,
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

export async function reclassifyAccountsOperation(
  this: PgCommercialDocumentStore,
  context: CommercialDocumentContext,
  id: string,
  expectedVersion: string,
  linesPatch: ReadonlyArray<{
    lineNumber: number;
    primaryAccountCode?: string;
    categoryCode?: string;
  }>,
  reason: string,
  idempotencyKey: string,
) {
  const existing = await this.get(context.organizationId, id);
  if (!existing) throw new Error("RESOURCE_NOT_FOUND");
  const allowedRoots =
    existing.type === "purchase_invoice"
      ? ["expense", "asset"]
      : ["revenue", "income", "liability"];
  const patchByLine = new Map(linesPatch.map((l) => [l.lineNumber, l]));
  for (const patch of linesPatch) {
    const code = patch.primaryAccountCode?.trim();
    if (code) {
      const root = await this.accountRootType(context.organizationId, code);
      if (!root || !allowedRoots.includes(root)) throw new Error("VALIDATION_FAILED");
    }
  }
  const replacement = {
    id: randomUUID(),
    type: existing.type as CommercialDocumentType,
    documentNumber: existing.document_number,
    ...(existing.series ? { series: existing.series } : {}),
    fiscalYear: Number(existing.fiscal_year),
    partyId: existing.party_id,
    documentDate: String(existing.document_date).slice(0, 10),
    dueDate: String(existing.due_date).slice(0, 10),
    currency: existing.currency,
    netMinor: String(existing.net_minor),
    taxMinor: String(existing.tax_minor),
    grossMinor: String(existing.gross_minor),
    controlAccountCode: existing.control_account_code,
    ...mergePaymentEvidenceFields({}, existing),
    ...(existing.funding_financial_account_id
      ? {
          fundingSource: {
            type: "financial_account" as const,
            financialAccountId: existing.funding_financial_account_id,
          },
        }
      : {}),
    lines: (existing.lines ?? []).map((line: Record<string, unknown>, idx: number) => {
      const patch = patchByLine.get(Number(line.lineNumber ?? idx + 1));
      return {
        description: line.description,
        quantity: String(line.quantity ?? "1"),
        unitPriceMinor: String(line.unitPriceMinor ?? line.grossMinor ?? "0"),
        netMinor: String(line.netMinor ?? line.grossMinor ?? "0"),
        taxMinor: String(line.taxMinor ?? "0"),
        grossMinor: String(line.grossMinor ?? "0"),
        primaryAccountCode: patch?.primaryAccountCode?.trim() || line.primaryAccountCode,
        categoryCode: patch?.categoryCode?.trim() || line.categoryCode || undefined,
        taxAccountCode: line.taxAccountCode ?? undefined,
        taxCode: line.taxCode ?? undefined,
        dimensions: line.dimensions ?? {},
        allocations: (Array.isArray(line.allocations) ? line.allocations : []).map(
          (a: Record<string, unknown>) => ({
            id: a.id ?? a.allocation_id ?? randomUUID(),
            amountMinor: String(a.amountMinor ?? a.amount_minor),
            dimensions: a.dimensions ?? {},
          }),
        ),
      };
    }),
  } satisfies CreateCommercialDocumentInput;
  return this.reverseReplace(
    context,
    id,
    expectedVersion,
    replacement,
    reason,
    idempotencyKey,
    true,
  );
}
