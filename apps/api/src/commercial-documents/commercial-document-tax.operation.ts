import { createHash, randomUUID } from "node:crypto";
import type {
  CommercialDocumentContext,
  CommercialDocumentType,
  CommercialDocumentTaxCodeCorrectionInput,
  CommercialDocumentTaxReviewInput,
} from "./commercial-document.types.js";
import type { PgCommercialDocumentStore } from "./pg-commercial-document.store.js";

export async function resolveTaxCodeOperation(
  this: PgCommercialDocumentStore,
  context: CommercialDocumentContext,
  id: string,
  input: CommercialDocumentTaxCodeCorrectionInput,
  key: string,
) {
  const normalizedInput = {
    lineNumber: input.lineNumber,
    reason: input.reason.trim(),
    ...(input.taxCode?.trim() ? { taxCode: input.taxCode.trim() } : {}),
  };
  const hash = createHash("sha256")
    .update(JSON.stringify({ id, input: normalizedInput }))
    .digest("hex");
  const client = await this.pool.connect();
  try {
    await client.query("begin");
    const replay = await this.lockReplay(client, context.organizationId, key, hash);
    if (replay) {
      await client.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }

    const document = await client.query<{
      type: CommercialDocumentType;
      state: string;
      version: string;
      document_date: string;
      tax_kind: "vat_input" | "vat_output" | null;
    }>(
      `select d.type,d.state,d.version::text,d.document_date::text,
        case
          when d.type='purchase_invoice' then 'vat_input'
          when d.type='sales_invoice' then 'vat_output'
          when d.type='credit_note' and original.type='purchase_invoice' then 'vat_input'
          when d.type='credit_note' and original.type='sales_invoice' then 'vat_output'
          else null
        end tax_kind
       from commercial_documents d
       left join commercial_documents original
         on original.organization_id=d.organization_id and original.id=d.original_document_id
       where d.organization_id=$1 and d.id=$2 for update of d`,
      [context.organizationId, id],
    );
    const found = document.rows[0];
    if (!found) throw new Error("RESOURCE_NOT_FOUND");
    if (!found.tax_kind) throw new Error("VAT_TAX_CODE_NOT_SUPPORTED");
    if (!["issued", "posted", "partially_paid", "paid"].includes(found.state))
      throw new Error("INVALID_DOCUMENT_TRANSITION");

    const line = await client.query<{
      net_minor: string;
      tax_minor: string;
      tax_code: string | null;
      vat_state: string;
    }>(
      `select net_minor::text,tax_minor::text,tax_code,vat_state::text
       from commercial_document_lines
       where organization_id=$1 and document_id=$2 and line_number=$3 for update`,
      [context.organizationId, id, input.lineNumber],
    );
    const source = line.rows[0];
    if (!source) throw new Error("RESOURCE_NOT_FOUND");
    if (BigInt(source.net_minor) <= 0n || BigInt(source.tax_minor) < 0n)
      throw new Error("VAT_TAX_CODE_RATE_UNRESOLVABLE");

    const candidates = await client.query<{
      code: string;
      name: string;
      kind: "vat_input" | "vat_output";
      rate: string;
    }>(
      `select distinct on (code) code,name,kind::text,rate::text
       from tax_code_versions
       where organization_id=$1 and kind=$2::tax_kind
         and (review_state='accountant_approved' or (review_state='draft' and exists(select 1 from accounting_workflow_policies w where w.organization_id=$1 and w.operating_mode='solopreneur')))
         and effective_from <= $3::date
         and (effective_to is null or effective_to >= $3::date)
         and ($6::text is null or code=$6::text)
         and abs($5::numeric - round($4::numeric * rate)) <= 1
       order by code,effective_from desc`,
      [
        context.organizationId,
        found.tax_kind,
        found.document_date,
        source.net_minor,
        source.tax_minor,
        normalizedInput.taxCode ?? null,
      ],
    );
    if (!candidates.rowCount) throw new Error("VAT_TAX_CODE_NO_MATCH");
    if ((candidates.rowCount ?? 0) > 1) throw new Error("VAT_TAX_CODE_AMBIGUOUS");
    const selected = candidates.rows[0]!;

    await client.query("select set_config('app.tax_finalization','on',true)");
    await client.query(
      `update commercial_document_lines set tax_code=$4
       where organization_id=$1 and document_id=$2 and line_number=$3`,
      [context.organizationId, id, input.lineNumber, selected.code],
    );
    const version = (BigInt(found.version) + 1n).toString();
    await client.query(
      `update commercial_documents set version=version+1,updated_at=now()
       where organization_id=$1 and id=$2`,
      [context.organizationId, id],
    );

    const auditEventId = randomUUID();
    const outboxEventId = randomUUID();
    await client.query(
      `insert into resource_audit_events
        (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
       values($1,$2,'commercial_document',$3,$4,'resolve_tax_code',$5,$6,$7,$8)`,
      [
        context.organizationId,
        auditEventId,
        id,
        version,
        context.actorId,
        context.correlationId,
        { lineNumber: input.lineNumber, taxCode: source.tax_code },
        {
          lineNumber: input.lineNumber,
          taxCode: selected.code,
          taxKind: selected.kind,
          rate: selected.rate,
          reason: normalizedInput.reason,
        },
      ],
    );
    await client.query(
      `insert into outbox_events
        (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
       values($1,$2,'commercial_document',$3,'commercial_document.tax_code_resolved',1,$4,$5)`,
      [
        context.organizationId,
        outboxEventId,
        id,
        { documentId: id, lineNumber: input.lineNumber, taxCode: selected.code },
        context.correlationId,
      ],
    );
    const response = {
      documentId: id,
      lineNumber: input.lineNumber,
      taxCode: selected.code,
      taxCodeName: selected.name,
      taxKind: selected.kind,
      rate: selected.rate,
      resourceVersion: version,
      auditEventId,
      outboxEventId,
      journalAmountsChanged: false,
      nextActions: [
        ...(found.tax_kind === "vat_input" && source.vat_state === "unreviewed"
          ? (["review-vat"] as const)
          : []),
        "view-source" as const,
      ],
    };
    await this.saveReplay(
      client,
      context.organizationId,
      key,
      "commercial-document:resolve-tax-code",
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

export async function reviewOperation(
  this: PgCommercialDocumentStore,
  context: CommercialDocumentContext,
  id: string,
  input: CommercialDocumentTaxReviewInput,
  key: string,
) {
  const hash = createHash("sha256").update(JSON.stringify({ id, input })).digest("hex");
  const client = await this.pool.connect();
  try {
    await client.query("begin");
    const replay = await this.lockReplay(client, context.organizationId, key, hash);
    if (replay) {
      await client.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    const document = await client.query<{ type: string; state: string; version: string }>(
      `select type,state,version::text from commercial_documents
       where organization_id=$1 and id=$2 for update`,
      [context.organizationId, id],
    );
    const found = document.rows[0];
    if (!found) throw new Error("RESOURCE_NOT_FOUND");
    if (!["purchase_invoice", "sales_invoice"].includes(found.type))
      throw new Error("TAX_REVIEW_NOT_SUPPORTED");
    if (!["posted", "partially_paid", "paid"].includes(found.state))
      throw new Error("INVALID_DOCUMENT_TRANSITION");
    const line = await client.query<{
      net_minor: string;
      tax_minor: string;
      cit_state: string;
      vat_state: string;
      payment_evidence_missing: boolean;
    }>(
      `select net_minor::text,tax_minor::text,cit_state::text,vat_state::text,payment_evidence_missing from commercial_document_lines
       where organization_id=$1 and document_id=$2 and line_number=$3 for update`,
      [context.organizationId, id, input.lineNumber],
    );
    const source = line.rows[0];
    if (!source) throw new Error("RESOURCE_NOT_FOUND");
    if (
      source.payment_evidence_missing &&
      ["eligible", "partially_eligible"].includes(input.state)
    ) {
      throw new Error("PAYMENT_EVIDENCE_REQUIRED");
    }
    const maximum = input.axis === "vat" ? BigInt(source.tax_minor) : BigInt(source.net_minor);
    const eligible = BigInt(input.eligibleMinor ?? "0");
    if (eligible < 0n || eligible > maximum) throw new Error("ELIGIBILITY_AMOUNT_INVALID");
    if (input.axis === "vat") {
      const taxCode = input.taxCode?.trim();
      if (!taxCode) throw new Error("VAT_TAX_CODE_REQUIRED");
      const validCode = await client.query(
        `select 1 from tax_code_versions
           where organization_id=$1 and code=$2 and kind=case when (select type from commercial_documents where organization_id=$1 and id=$3)='sales_invoice' then 'vat_output'::tax_kind else 'vat_input'::tax_kind end
           and (review_state='accountant_approved' or (review_state='draft' and exists(select 1 from accounting_workflow_policies w where w.organization_id=$1 and w.operating_mode='solopreneur')))
           and effective_from <= (select document_date from commercial_documents where organization_id=$1 and id=$3)
           and (effective_to is null or effective_to >= (select document_date from commercial_documents where organization_id=$1 and id=$3))
         limit 1`,
        [context.organizationId, taxCode, id],
      );
      if (!validCode.rowCount) throw new Error("VAT_TAX_CODE_INVALID");
    }
    await client.query("select set_config('app.tax_finalization','on',true)");
    const column = input.axis === "cit" ? "cit" : "vat";
    const clearMissing =
      ["accountant_override", "ineligible"].includes(input.state) &&
      (input.axis === "cit"
        ? source.vat_state !== "unreviewed"
        : source.cit_state !== "unreviewed");
    await client.query(
      `update commercial_document_lines set ${column}_state=$4::eligibility_state,
        ${column}_eligible_minor=$5,
        payment_evidence_missing=case when $10::boolean then false else payment_evidence_missing end,
        tax_code=case when $9::text is null then tax_code else $9::text end,
        reviewed_by=$6,reviewed_at=now(),review_reason=$7,review_reference=$8
       where organization_id=$1 and document_id=$2 and line_number=$3`,
      [
        context.organizationId,
        id,
        input.lineNumber,
        input.state,
        eligible.toString(),
        context.actorId,
        input.reason.trim(),
        input.reference ?? null,
        input.axis === "vat" ? input.taxCode!.trim() : null,
        clearMissing,
      ],
    );
    const version = (BigInt(found.version) + 1n).toString();
    await client.query(
      "update commercial_documents set version=version+1,payment_evidence_missing=coalesce((select bool_or(payment_evidence_missing) from commercial_document_lines where organization_id=$1 and document_id=$2),false),updated_at=now() where organization_id=$1 and id=$2",
      [context.organizationId, id],
    );
    const remainingReview = await client.query<{
      cit_state: string;
      vat_state: string;
    }>(
      `select cit_state,vat_state from commercial_document_lines
        where organization_id=$1 and document_id=$2`,
      [context.organizationId, id],
    );
    const auditEventId = randomUUID(),
      outboxEventId = randomUUID();
    await client.query(
      `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
       values($1,$2,'commercial_document',$3,$4,'review',$5,$6,$7,$8)`,
      [
        context.organizationId,
        auditEventId,
        id,
        version,
        context.actorId,
        context.correlationId,
        { axis: input.axis },
        { axis: input.axis, state: input.state, eligibleMinor: eligible.toString() },
      ],
    );
    await client.query(
      `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
       values($1,$2,'commercial_document',$3,'commercial_document.reviewed',1,$4,$5)`,
      [
        context.organizationId,
        outboxEventId,
        id,
        { documentId: id, axis: input.axis, lineNumber: input.lineNumber, state: input.state },
        context.correlationId,
      ],
    );
    const response = {
      documentId: id,
      type: found.type,
      axis: input.axis,
      reviewState: input.state,
      resourceVersion: version,
      auditEventId,
      outboxEventId,
      nextActions: [
        ...(remainingReview.rows.some((row) => row.cit_state === "unreviewed")
          ? ["review-cit"]
          : []),
        ...(remainingReview.rows.some((row) => row.vat_state === "unreviewed")
          ? ["review-vat"]
          : []),
        "view-source",
      ],
    };
    await this.saveReplay(
      client,
      context.organizationId,
      key,
      "commercial-document:review",
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
