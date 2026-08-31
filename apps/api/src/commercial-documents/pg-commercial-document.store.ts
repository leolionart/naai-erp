import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import {
  canSelfApprove,
  resolveOrganizationWorkflowPolicy,
} from "../workflow-policy/organization-workflow-policy.service.js";
import type {
  CommercialDocumentAction,
  CommercialDocumentContext,
  CommercialDocumentType,
  CreateCommercialDocumentInput,
  CommercialDocumentMetadataInput,
  CommercialDocumentTaxCodeCorrectionInput,
  CommercialDocumentTaxReviewInput,
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
  funding_financial_account_id: string | null;
  original_document_id: string | null;
  created_by: string;
  version: string;
};

type PurchaseLineTaxDecision = Readonly<{
  managementState: string;
  citState: string;
  vatState: string;
  citEligibleMinor: string;
  vatEligibleMinor: string;
  reviewed: boolean;
}>;

function purchaseLineTaxDecision(
  input: CreateCommercialDocumentInput,
  line: CreateCommercialDocumentInput["lines"][number],
  operatingMode: string | null,
): PurchaseLineTaxDecision {
  if (input.type !== "purchase_invoice")
    return {
      managementState: "unreviewed",
      citState: "unreviewed",
      vatState: "unreviewed",
      citEligibleMinor: "0",
      vatEligibleMinor: "0",
      reviewed: false,
    };

  const explicit = line.allocations.some(
    (allocation) => allocation.dimensions.taxState !== undefined,
  );
  let vatEligible = 0n;
  if (explicit && BigInt(line.taxMinor) > 0n) {
    let allocatedTax = 0n;
    for (const [index, allocation] of line.allocations.entries()) {
      const tax =
        index === line.allocations.length - 1
          ? BigInt(line.taxMinor) - allocatedTax
          : (BigInt(line.taxMinor) * BigInt(allocation.amountMinor)) / BigInt(line.netMinor);
      allocatedTax += tax;
      const state = allocation.dimensions.taxState;
      if (["eligible", "accountant_override"].includes(state ?? "")) vatEligible += tax;
      else if (state === "partially_eligible") {
        const requested = BigInt(allocation.dimensions.vatEligibleMinor ?? "0");
        vatEligible += requested > tax ? tax : requested;
      }
    }
  }

  const vatMinor = BigInt(line.taxMinor);
  const vatState =
    vatMinor === 0n || vatEligible === 0n
      ? "ineligible"
      : vatEligible === vatMinor
        ? "eligible"
        : "partially_eligible";
  return {
    managementState: operatingMode === "solopreneur" ? "valid" : "unreviewed",
    citState: "unreviewed",
    vatState: explicit ? vatState : "unreviewed",
    citEligibleMinor: "0",
    vatEligibleMinor: explicit ? vatEligible.toString() : "0",
    reviewed: explicit,
  };
}

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

  private async operatingMode(client: PoolClient, organizationId: string) {
    return (await resolveOrganizationWorkflowPolicy(organizationId, client)).operatingMode;
  }

  async review(
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
      const line = await client.query<{ net_minor: string; tax_minor: string }>(
        `select net_minor::text,tax_minor::text from commercial_document_lines
         where organization_id=$1 and document_id=$2 and line_number=$3 for update`,
        [context.organizationId, id, input.lineNumber],
      );
      const source = line.rows[0];
      if (!source) throw new Error("RESOURCE_NOT_FOUND");
      const maximum = input.axis === "vat" ? BigInt(source.tax_minor) : BigInt(source.net_minor);
      const eligible = BigInt(input.eligibleMinor ?? "0");
      if (eligible < 0n || eligible > maximum) throw new Error("ELIGIBILITY_AMOUNT_INVALID");
      if (input.axis === "vat") {
        const taxCode = input.taxCode?.trim();
        if (!taxCode) throw new Error("VAT_TAX_CODE_REQUIRED");
        const validCode = await client.query(
          `select 1 from tax_code_versions
             where organization_id=$1 and code=$2 and kind=case when (select type from commercial_documents where organization_id=$1 and id=$3)='sales_invoice' then 'vat_output'::tax_kind else 'vat_input'::tax_kind end
             and review_state='accountant_approved'
             and effective_from <= (select document_date from commercial_documents where organization_id=$1 and id=$3)
             and (effective_to is null or effective_to >= (select document_date from commercial_documents where organization_id=$1 and id=$3))
           limit 1`,
          [context.organizationId, taxCode, id],
        );
        if (!validCode.rowCount) throw new Error("VAT_TAX_CODE_INVALID");
      }
      await client.query("select set_config('app.tax_finalization','on',true)");
      const column = input.axis === "cit" ? "cit" : "vat";
      await client.query(
        `update commercial_document_lines set ${column}_state=$4::eligibility_state,
          ${column}_eligible_minor=$5,
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
        ],
      );
      const version = (BigInt(found.version) + 1n).toString();
      await client.query(
        "update commercial_documents set version=version+1,updated_at=now() where organization_id=$1 and id=$2",
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

  async resolveTaxCode(
    context: CommercialDocumentContext,
    id: string,
    input: CommercialDocumentTaxCodeCorrectionInput,
    key: string,
  ) {
    const normalizedInput = { lineNumber: input.lineNumber, reason: input.reason.trim() };
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
           and review_state='accountant_approved'
           and effective_from <= $3::date
           and (effective_to is null or effective_to >= $3::date)
           and abs($5::numeric - round($4::numeric * rate)) <= 1
         order by code,effective_from desc`,
        [
          context.organizationId,
          found.tax_kind,
          found.document_date,
          source.net_minor,
          source.tax_minor,
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

  private async ownerCurrentAccount(
    client: PoolClient,
    organizationId: string,
    documentDate: string,
  ) {
    const result = await client.query<{ account_code: string }>(
      `with selected_mapping as (
         select id,version from financial_statement_mapping_versions
          where organization_id=$1 and framework='TT133' and state='approved'
            and effective_from <= $2::date and (effective_to is null or effective_to >= $2::date)
          order by effective_from desc,version desc limit 1
       )
       select ml.account_code from selected_mapping sm
       join financial_statement_mapping_lines ml on ml.organization_id=$1 and ml.mapping_id=sm.id and ml.mapping_version=sm.version
       join accounts a on a.organization_id=ml.organization_id and a.code=ml.account_code
       where ml.statement='balance_sheet' and ml.line_code='owner_current' and a.is_active=true
       order by ml.account_code limit 2`,
      [organizationId, documentDate],
    );
    if (result.rows.length !== 1) throw new Error("OWNER_CURRENT_ACCOUNT_NOT_CONFIGURED");
    return result.rows[0]!.account_code;
  }

  private async insertDocumentLine(
    client: PoolClient,
    context: CommercialDocumentContext,
    documentId: string,
    lineNumber: number,
    input: CreateCommercialDocumentInput,
    line: CreateCommercialDocumentInput["lines"][number],
    operatingMode: string | null,
  ) {
    const defaultTax = purchaseLineTaxDecision(input, line, operatingMode);
    const account = await client.query<{ root_type: string }>(
      "select root_type::text from accounts where organization_id=$1 and code=$2",
      [context.organizationId, line.primaryAccountCode],
    );
    const tax =
      input.type === "purchase_invoice" && account.rows[0]?.root_type === "asset"
        ? { ...defaultTax, citState: "ineligible", citEligibleMinor: "0" }
        : defaultTax;
    const categoryCode = line.categoryCode?.trim() || line.dimensions?.category?.trim() || null;
    if (categoryCode) {
      const category = await client.query(
        "select 1 from business_categories where organization_id=$1 and kind=$2 and code=$3 and is_active=true",
        [
          context.organizationId,
          input.type === "purchase_invoice" ? "expense" : "revenue",
          categoryCode,
        ],
      );
      if (!category.rows[0]) throw new Error("CATEGORY_NOT_FOUND");
    }
    const dimensions = Object.fromEntries(
      Object.entries(line.dimensions ?? {}).filter(([key]) => key !== "category"),
    );
    await client.query(
      `insert into commercial_document_lines
       (organization_id,document_id,line_number,original_line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,
        primary_account_code,category_code,tax_account_code,tax_code,management_state,cit_state,vat_state,cit_eligible_minor,vat_eligible_minor,
        reviewed_by,reviewed_at,review_reason,review_reference,dimensions)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
      [
        context.organizationId,
        documentId,
        lineNumber,
        line.originalLineNumber ?? null,
        line.description,
        line.quantity,
        line.unitPriceMinor,
        line.netMinor,
        line.taxMinor,
        line.grossMinor,
        line.primaryAccountCode,
        categoryCode,
        line.taxAccountCode ?? null,
        line.taxCode ?? null,
        tax.managementState,
        tax.citState,
        tax.vatState,
        tax.citEligibleMinor,
        tax.vatEligibleMinor,
        tax.reviewed ? context.actorId : null,
        tax.reviewed ? new Date() : null,
        tax.reviewed ? "Resolved when the purchase invoice was recorded" : null,
        tax.reviewed
          ? operatingMode === "solopreneur"
            ? "solopreneur_policy"
            : "explicit_tax_state"
          : null,
        dimensions,
      ],
    );
  }

  async validateRelationships(organizationId: string, input: CreateCommercialDocumentInput) {
    if (
      input.type === "sales_invoice" &&
      input.lines.some((line) =>
        line.allocations.some(
          (allocation) => !(allocation.dimensions.projectId ?? line.dimensions?.projectId),
        ),
      )
    )
      throw new Error("DOCUMENT_PROJECT_REQUIRED");
    const relationships = input.lines.flatMap((line) => {
      const lineProjectId = line.dimensions?.projectId;
      const lineContractId = line.dimensions?.contractId;
      return [
        { projectId: lineProjectId, contractId: lineContractId },
        ...line.allocations.map((allocation) => ({
          projectId: allocation.dimensions.projectId ?? lineProjectId,
          contractId: allocation.dimensions.contractId ?? lineContractId,
        })),
      ];
    });

    const unique = new Map<
      string,
      { projectId: string | undefined; contractId: string | undefined }
    >();
    for (const relationship of relationships) {
      if (!relationship.projectId && !relationship.contractId) continue;
      if (relationship.contractId && !relationship.projectId)
        throw new Error("DOCUMENT_CONTRACT_PROJECT_REQUIRED");
      unique.set(`${relationship.projectId ?? ""}:${relationship.contractId ?? ""}`, relationship);
    }

    for (const { projectId, contractId } of unique.values()) {
      const project = await this.pool.query<{ client_party_id: string; state: string }>(
        "select client_party_id,state::text from projects where organization_id=$1 and id=$2",
        [organizationId, projectId],
      );
      if (!project.rows[0]) throw new Error("PROJECT_NOT_FOUND");
      if (project.rows[0].state === "closed") throw new Error("PROJECT_CLOSED");
      if (
        ["sales_invoice", "credit_note"].includes(input.type) &&
        project.rows[0].client_party_id !== input.partyId
      )
        throw new Error("PROJECT_CUSTOMER_MISMATCH");
      if (contractId) {
        const contract = await this.pool.query(
          "select 1 from contracts where organization_id=$1 and id=$2 and project_id=$3",
          [organizationId, contractId, projectId],
        );
        if (!contract.rows[0]) throw new Error("CONTRACT_PROJECT_MISMATCH");
      }
    }
  }

  async relationshipBackfillInventory(organizationId: string) {
    const result = await this.pool.query(
      `select d.id,d.type::text,d.state::text,d.document_number "documentNumber",
              d.party_id "partyId",d.version::text "resourceVersion",
              coalesce((select jsonb_agg(distinct a.dimensions->>'projectId')
                from commercial_document_allocations a
               where a.organization_id=d.organization_id and a.document_id=d.id
                 and a.dimensions ? 'projectId'),'[]'::jsonb) "projectIds",
              coalesce((select jsonb_agg(distinct a.dimensions->>'contractId')
                from commercial_document_allocations a
               where a.organization_id=d.organization_id and a.document_id=d.id
                 and a.dimensions ? 'contractId'),'[]'::jsonb) "contractIds"
         from commercial_documents d
        where d.organization_id=$1 and d.state in ('issued','posted','partially_paid','paid')
        order by d.document_date,d.id`,
      [organizationId],
    );
    return result.rows.map((row) => ({
      ...row,
      needsProject: row.type === "sales_invoice" && row.projectIds.length === 0,
      needsContract: row.type === "sales_invoice" && row.contractIds.length === 0,
    }));
  }

  async updateCategory(
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
      const document = await client.query<{ version: string }>(
        "select version::text from commercial_documents where organization_id=$1 and id=$2 for update",
        [context.organizationId, id],
      );
      if (!document.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
      const categoryRow = await client.query(
        `select 1 from business_categories bc
         join commercial_documents d on d.organization_id=bc.organization_id
           and d.id=$2
         where bc.organization_id=$1 and bc.kind=case when d.type='purchase_invoice' then 'expense'::business_category_type else 'revenue'::business_category_type end
           and bc.code=$3 and bc.is_active=true`,
        [context.organizationId, id, category],
      );
      if (!categoryRow.rows[0]) throw new Error("CATEGORY_NOT_FOUND");
      const before = await client.query<{ line_number: number; category: string | null }>(
        "select line_number,category_code category from commercial_document_lines where organization_id=$1 and document_id=$2 order by line_number",
        [context.organizationId, id],
      );
      if (!before.rows.length) throw new Error("RESOURCE_NOT_FOUND");
      await client.query(
        "select set_config('app.commercial_document_metadata_correction','on',true)",
      );
      await client.query(
        "update commercial_document_lines set category_code=$3 where organization_id=$1 and document_id=$2",
        [context.organizationId, id, category],
      );
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

  async updateMetadata(
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
        const c = await client.query(
          "select 1 from business_categories where organization_id=$1 and kind=$2 and code=$3 and is_active=true",
          [
            context.organizationId,
            doc.rows[0]?.type === "purchase_invoice" ? "expense" : "revenue",
            input.category,
          ],
        );
        if (!c.rows[0]) throw new Error("CATEGORY_NOT_FOUND");
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
        await client.query(
          "update commercial_document_lines set category_code=$3 where organization_id=$1 and document_id=$2",
          [context.organizationId, id, input.category ?? null],
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

  async list(
    organizationId: string,
    filters: {
      type?: string;
      state?: string;
      partyId?: string;
      projectId?: string;
      startsOn?: string;
      endsOn?: string;
    },
  ) {
    const result = await this.pool.query(
      `select d.*,d.document_date::text document_date,d.due_date::text due_date,
       case when d.state='cancelled' and exists(select 1 from resource_audit_events ra where ra.organization_id=d.organization_id and ra.resource_type='commercial_document' and ra.resource_key=d.id and ra.action='reverse_replace') then 'corrected' when exists(select 1 from resource_audit_events ra where ra.organization_id=d.organization_id and ra.resource_type='commercial_document' and ra.action='reverse_replace' and ra.after_state->>'replacementId'=d.id) then 'replacement' else null end correction_status,
       (select ra.after_state->>'replacementId' from resource_audit_events ra where ra.organization_id=d.organization_id and ra.resource_type='commercial_document' and ra.resource_key=d.id and ra.action='reverse_replace' order by ra.occurred_at desc limit 1) replacement_id,
       (select ra.resource_key from resource_audit_events ra where ra.organization_id=d.organization_id and ra.resource_type='commercial_document' and ra.action='reverse_replace' and ra.after_state->>'replacementId'=d.id order by ra.occurred_at desc limit 1) corrected_from_id,
       (select coalesce(nullif(lcat.category_code,''),nullif(lcat.dimensions->>'category',''),
          (select nullif(a.dimensions->>'category','') from commercial_document_allocations a
           where a.organization_id=lcat.organization_id and a.document_id=lcat.document_id and a.line_number=lcat.line_number
           order by a.allocation_number limit 1))
          from commercial_document_lines lcat
         where lcat.organization_id=d.organization_id and lcat.document_id=d.id
           and (lcat.category_code is not null or lcat.dimensions ? 'category' or exists (
             select 1 from commercial_document_allocations a
              where a.organization_id=lcat.organization_id and a.document_id=lcat.document_id and a.line_number=lcat.line_number
                and a.dimensions ? 'category'))
         order by lcat.line_number limit 1) category,
       coalesce((select jsonb_agg(distinct relationship.project_id order by relationship.project_id)
         from (
           select l2.dimensions->>'projectId' project_id from commercial_document_lines l2
            where l2.organization_id=d.organization_id and l2.document_id=d.id
           union
           select a2.dimensions->>'projectId' from commercial_document_allocations a2
            where a2.organization_id=d.organization_id and a2.document_id=d.id
         ) relationship where relationship.project_id is not null),'[]'::jsonb) "projectIds",
       coalesce((select jsonb_agg(distinct relationship.contract_id order by relationship.contract_id)
         from (
           select l2.dimensions->>'contractId' contract_id from commercial_document_lines l2
            where l2.organization_id=d.organization_id and l2.document_id=d.id
           union
           select a2.dimensions->>'contractId' from commercial_document_allocations a2
            where a2.organization_id=d.organization_id and a2.document_id=d.id
         ) relationship where relationship.contract_id is not null),'[]'::jsonb) "contractIds",
       coalesce(jsonb_agg(
         jsonb_set(to_jsonb(l), '{category_code}', to_jsonb(coalesce(nullif(l.category_code,''),nullif(l.dimensions->>'category',''),
           (select nullif(a0.dimensions->>'category','') from commercial_document_allocations a0
            where a0.organization_id=l.organization_id and a0.document_id=l.document_id and a0.line_number=l.line_number
            order by a0.allocation_number limit 1)))
         ) || jsonb_build_object('allocations',coalesce((select jsonb_agg(a order by a.allocation_number)
           from commercial_document_allocations a where a.organization_id=l.organization_id and a.document_id=l.document_id and a.line_number=l.line_number),'[]'::jsonb))
         order by l.line_number) filter (where l.line_number is not null),'[]') lines
       from commercial_documents d left join commercial_document_lines l
         on l.organization_id=d.organization_id and l.document_id=d.id
       where d.organization_id=$1 and ($2::text is null or d.type::text=$2)
         and (($3::text is not null and d.state::text=$3) or ($3::text is null and d.state<>'cancelled'))
         and ($4::text is null or d.party_id=$4)
         and ($5::text is null or exists (
           select 1 from commercial_document_lines project_line
           left join commercial_document_allocations project_allocation
             on project_allocation.organization_id=project_line.organization_id
            and project_allocation.document_id=project_line.document_id
            and project_allocation.line_number=project_line.line_number
           where project_line.organization_id=d.organization_id and project_line.document_id=d.id
             and (project_line.dimensions->>'projectId'=$5 or project_allocation.dimensions->>'projectId'=$5)
         ))
       and ($6::date is null or d.document_date >= $6::date)
       and ($7::date is null or d.document_date <= $7::date)
       group by d.organization_id,d.id order by d.document_date desc,d.id`,
      [
        organizationId,
        filters.type ?? null,
        filters.state ?? null,
        filters.partyId ?? null,
        filters.projectId ?? null,
        filters.startsOn ?? null,
        filters.endsOn ?? null,
      ],
    );
    return result.rows;
  }

  async get(organizationId: string, id: string) {
    const result = await this.pool.query(
      `select d.*,d.document_date::text document_date,d.due_date::text due_date,
       case when d.state='cancelled' and exists(select 1 from resource_audit_events ra where ra.organization_id=d.organization_id and ra.resource_type='commercial_document' and ra.resource_key=d.id and ra.action='reverse_replace') then 'corrected' when exists(select 1 from resource_audit_events ra where ra.organization_id=d.organization_id and ra.resource_type='commercial_document' and ra.action='reverse_replace' and ra.after_state->>'replacementId'=d.id) then 'replacement' else null end correction_status,
       (select ra.after_state->>'replacementId' from resource_audit_events ra where ra.organization_id=d.organization_id and ra.resource_type='commercial_document' and ra.resource_key=d.id and ra.action='reverse_replace' order by ra.occurred_at desc limit 1) replacement_id,
       (select ra.resource_key from resource_audit_events ra where ra.organization_id=d.organization_id and ra.resource_type='commercial_document' and ra.action='reverse_replace' and ra.after_state->>'replacementId'=d.id order by ra.occurred_at desc limit 1) corrected_from_id,
       (select coalesce(nullif(lcat.category_code,''),nullif(lcat.dimensions->>'category',''),
          (select nullif(a.dimensions->>'category','') from commercial_document_allocations a
           where a.organization_id=lcat.organization_id and a.document_id=lcat.document_id and a.line_number=lcat.line_number
           order by a.allocation_number limit 1))
          from commercial_document_lines lcat
         where lcat.organization_id=d.organization_id and lcat.document_id=d.id
           and (lcat.category_code is not null or lcat.dimensions ? 'category' or exists (
             select 1 from commercial_document_allocations a
              where a.organization_id=lcat.organization_id and a.document_id=lcat.document_id
                and a.line_number=lcat.line_number and a.dimensions ? 'category'))
         order by lcat.line_number limit 1) category,
       (select jsonb_build_object('system',r.system,'externalId',r.external_id,'canonicalUrl',r.canonical_url,
          'checksum',r.checksum,'version',r.version,'syncedAt',r.synced_at::text,'metadata',r.metadata)
          from external_references r where r.organization_id=d.organization_id and r.document_id=d.id) as "externalReference",
       coalesce(json_agg(jsonb_build_object(
        'lineNumber',l.line_number,'description',l.description,'quantity',l.quantity,
        'unitPriceMinor',l.unit_price_minor::text,'netMinor',l.net_minor::text,'taxMinor',l.tax_minor::text,
        'grossMinor',l.gross_minor::text,'primaryAccountCode',l.primary_account_code,
        'categoryCode',l.category_code,'taxAccountCode',l.tax_account_code,'taxCode',l.tax_code,
        'managementState',l.management_state::text,'citState',l.cit_state::text,'vatState',l.vat_state::text,
        'citEligibleMinor',l.cit_eligible_minor::text,'vatEligibleMinor',l.vat_eligible_minor::text,
        'reviewedBy',l.reviewed_by,'reviewedAt',l.reviewed_at::text,'reviewReason',l.review_reason,
        'reviewReference',l.review_reference,'dimensions',l.dimensions,
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
      // Resolve owner-paid control account before any draft upsert path so a
      // retried external reference cannot retain the legacy AP account.
      const effectiveControlAccountCode =
        input.type === "purchase_invoice" &&
        (input.funding?.type === "owner_paid" || input.funding?.type === "owner_custody_cash")
          ? await this.ownerCurrentAccount(client, context.organizationId, input.documentDate)
          : input.controlAccountCode;
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
                  funding_financial_account_id=$15, original_document_id=$16, reason=$17, version=$18, updated_at=now()
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
                  effectiveControlAccountCode,
                  input.fundingSource?.financialAccountId ?? null,
                  input.originalDocumentId ?? null,
                  input.reason ?? null,
                  newVersion,
                ],
              );
              const operatingMode = await this.operatingMode(client, context.organizationId);
              for (const [lineIndex, line] of input.lines.entries()) {
                await this.insertDocumentLine(
                  client,
                  context,
                  docId,
                  lineIndex + 1,
                  input,
                  line,
                  operatingMode,
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
      if (input.type === "purchase_invoice")
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `purchase-expense:${context.organizationId}:${input.partyId ?? ""}:${input.documentDate}:${input.grossMinor}:${input.currency}`,
        ]);
      const duplicateResult = await client.query<{ id: string }>(
        input.type === "purchase_invoice"
          ? `select id from commercial_documents
             where organization_id=$1 and type='purchase_invoice' and party_id=$2 and document_date=$3 and gross_minor=$4 and currency=$5 and state<>'cancelled'`
          : `select id from commercial_documents
             where organization_id=$1 and type=$2 and party_id=$3 and document_number=$4 and document_date=$5 and gross_minor=$6 and currency=$7 and state<>'cancelled'`,
        input.type === "purchase_invoice"
          ? [
              context.organizationId,
              input.partyId,
              input.documentDate,
              input.grossMinor,
              input.currency,
            ]
          : [
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
           where organization_id=$1 and payee_party_id is not distinct from $2 and expense_date=$3 and gross_minor=$4 and currency=$5 and state<>'reversed'`,
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

      // Owner-paid/custody purchases credit the configured owner-current ledger
      // account. Company-bank purchases continue to resolve their financial
      // account's ledger code below.
      const id = input.id ?? randomUUID();
      if (input.type === "credit_note")
        await this.assertCreditAllowed(client, context.organizationId, input);
      await client.query(
        `insert into commercial_documents
         (organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,
          currency,net_minor,tax_minor,gross_minor,control_account_code,funding_financial_account_id,original_document_id,reason,created_by)
         values ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
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
          effectiveControlAccountCode,
          input.fundingSource?.financialAccountId ?? null,
          input.originalDocumentId ?? null,
          input.reason ?? null,
          context.actorId,
        ],
      );
      const operatingMode = await this.operatingMode(client, context.organizationId);
      for (const [lineIndex, line] of input.lines.entries()) {
        await this.insertDocumentLine(
          client,
          context,
          id,
          lineIndex + 1,
          input,
          line,
          operatingMode,
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

      const autoComplete = operatingMode === "solopreneur" && context.roles.includes("owner");
      let finalState = "draft";
      let resourceVersion = "1";
      let journalId: string | null = null;
      if (autoComplete) {
        const document: StoredDocument = {
          id,
          type: input.type,
          state: "draft",
          document_date: input.documentDate,
          currency: input.currency,
          party_id: input.partyId,
          document_number: input.documentNumber,
          net_minor: input.netMinor,
          tax_minor: input.taxMinor,
          gross_minor: input.grossMinor,
          control_account_code: effectiveControlAccountCode,
          funding_financial_account_id: input.fundingSource?.financialAccountId ?? null,
          original_document_id: input.originalDocumentId ?? null,
          created_by: context.actorId,
          version: "1",
        };
        if (input.type === "sales_invoice")
          await this.assertSalesContractCoverage(client, context.organizationId, document);
        await this.assertPostingPeriod(client, context, input.documentDate);
        if (input.type === "purchase_invoice" && document.funding_financial_account_id) {
          const funding = await client.query<{ ledger_account_code: string }>(
            `select ledger_account_code from financial_accounts where organization_id=$1 and id=$2
             and currency=$3 and status='active' for update`,
            [context.organizationId, document.funding_financial_account_id, document.currency],
          );
          if (!funding.rows[0]) throw new Error("PURCHASE_FUNDING_ACCOUNT_NOT_AVAILABLE");
          document.control_account_code = funding.rows[0].ledger_account_code;
        }
        journalId = await this.postDocumentJournal(client, context, document);
        finalState =
          input.type === "purchase_invoice" && document.funding_financial_account_id
            ? "paid"
            : input.type === "purchase_invoice"
              ? "posted"
              : "issued";
        resourceVersion = input.type === "purchase_invoice" ? "5" : "3";
        await client.query(
          `update commercial_documents set state=$3,version=$4,updated_at=now(),
             approved_by=case when type='purchase_invoice' then $5 else approved_by end,
             approved_at=case when type='purchase_invoice' then now() else approved_at end,
             issued_or_posted_by=$5,issued_or_posted_at=now(),journal_id=$6
           where organization_id=$1 and id=$2`,
          [context.organizationId, id, finalState, resourceVersion, context.actorId, journalId],
        );
        await client.query(
          `insert into commercial_document_events
           (organization_id,id,document_id,from_state,to_state,actor_id,reason,correlation_id)
           values($1,$2,$3,'draft',$4,$5,'Solopreneur save and record',$6)`,
          [
            context.organizationId,
            randomUUID(),
            id,
            finalState,
            context.actorId,
            context.correlationId,
          ],
        );
      }

      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
         values ($1,$2,'commercial_document',$3,$4,'create',$5,$6,$7)`,
        [
          context.organizationId,
          auditEventId,
          id,
          resourceVersion,
          context.actorId,
          context.correlationId,
          {
            type: input.type,
            state: finalState,
            journalId,
            autoCompleted: autoComplete,
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
          autoComplete ? `${input.type}.${finalState}` : `${input.type}.created`,
          {
            documentId: id,
            type: input.type,
            state: finalState,
            journalId,
            autoCompleted: autoComplete,
          },
          context.correlationId,
        ],
      );
      const response = {
        documentId: id,
        type: input.type,
        state: finalState,
        resourceVersion,
        journalId,
        auditEventId,
        outboxEventId,
        nextActions: this.nextActions(input.type, finalState),
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

  async deleteDraft(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion: string,
    reason: string,
    idempotencyKey: string,
  ) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ id, expectedVersion, reason }))
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
      const found = await client.query<{
        id: string;
        type: string;
        state: string;
        version: string;
        journal_id: string | null;
      }>(
        `select id,type::text,state::text,version::text,journal_id
           from commercial_documents
          where organization_id=$1 and id=$2 for update`,
        [context.organizationId, id],
      );
      const document = found.rows[0];
      if (!document) throw new Error("RESOURCE_NOT_FOUND");
      if (document.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
      if (document.state !== "draft" || document.journal_id)
        throw new Error("DOCUMENT_DELETE_NOT_ALLOWED");
      const references = await client.query<{ referenced: boolean }>(
        `select exists(
           select 1 from customer_receipt_allocations where organization_id=$1 and sales_invoice_id=$2
           union all
           select 1 from reconciliation_candidates where organization_id=$1 and commercial_document_id=$2
           union all
           select 1 from reconciliation_allocations where organization_id=$1 and commercial_document_id=$2
           union all
           select 1 from commercial_document_events where organization_id=$1 and document_id=$2
           union all
           select 1 from commercial_documents where organization_id=$1 and original_document_id=$2
         ) referenced`,
        [context.organizationId, id],
      );
      if (references.rows[0]?.referenced) throw new Error("DOCUMENT_DELETE_REFERENCED");
      await client.query(
        "delete from commercial_document_allocations where organization_id=$1 and document_id=$2",
        [context.organizationId, id],
      );
      await client.query(
        "delete from commercial_document_lines where organization_id=$1 and document_id=$2",
        [context.organizationId, id],
      );
      await client.query(
        "delete from external_references where organization_id=$1 and document_id=$2",
        [context.organizationId, id],
      );
      await client.query("delete from commercial_documents where organization_id=$1 and id=$2", [
        context.organizationId,
        id,
      ]);
      const auditEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values($1,$2,'commercial_document',$3,$4,'delete_draft',$5,$6,$7,null)`,
        [
          context.organizationId,
          auditEventId,
          id,
          document.version,
          context.actorId,
          context.correlationId,
          { ...document, deletionReason: reason },
        ],
      );
      const response = {
        documentId: id,
        deleted: true,
        deletedState: "draft",
        auditEventId,
        nextActions: [],
      };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        "commercial-document:delete-draft",
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

      if (merged.type === "purchase_invoice")
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `purchase-expense:${context.organizationId}:${merged.partyId ?? ""}:${merged.documentDate}:${merged.grossMinor}:${merged.currency}`,
        ]);
      const duplicateResult = await client.query<{ id: string }>(
        merged.type === "purchase_invoice"
          ? `select id from commercial_documents
             where organization_id=$1 and type='purchase_invoice' and party_id=$2 and document_date=$3 and gross_minor=$4 and currency=$5 and id<>$6 and state<>'cancelled'`
          : `select id from commercial_documents
             where organization_id=$1 and type=$2 and party_id=$3 and document_number=$4 and document_date=$5 and gross_minor=$6 and currency=$7 and id<>$8 and state<>'cancelled'`,
        merged.type === "purchase_invoice"
          ? [
              context.organizationId,
              merged.partyId,
              merged.documentDate,
              merged.grossMinor,
              merged.currency,
              id,
            ]
          : [
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
           where organization_id=$1 and payee_party_id is not distinct from $2 and expense_date=$3 and gross_minor=$4 and currency=$5 and state<>'reversed'`,
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
          funding_financial_account_id=$14, original_document_id=$15, reason=$16, version=$17, updated_at=now()
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
          merged.fundingSource?.financialAccountId ?? null,
          merged.originalDocumentId ?? null,
          merged.reason ?? null,
          newVersion,
        ],
      );

      const operatingMode = await this.operatingMode(client, context.organizationId);
      for (const [lineIndex, line] of merged.lines.entries()) {
        await this.insertDocumentLine(
          client,
          context,
          id,
          lineIndex + 1,
          merged,
          line,
          operatingMode,
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
          gross_minor::text,control_account_code,funding_financial_account_id,original_document_id,created_by,version::text
         from commercial_documents where organization_id=$1 and id=$2 for update`,
        [context.organizationId, id],
      );
      const document = found.rows[0];
      if (!document) throw new Error("RESOURCE_NOT_FOUND");
      let next = NEXT[document.type][document.state]?.[action];
      if (!next) throw new Error("INVALID_DOCUMENT_TRANSITION");
      if (action === "approve" && document.created_by === context.actorId)
        await this.assertSelfApproval(client, context, BigInt(document.gross_minor));
      let journalId: string | undefined;
      if (action === "issue" || action === "post") {
        if (document.type === "sales_invoice")
          await this.assertSalesContractCoverage(client, context.organizationId, document);
        await this.assertPostingPeriod(client, context, document.document_date);
        if (document.type === "purchase_invoice" && document.funding_financial_account_id) {
          const funding = await client.query<{ ledger_account_code: string }>(
            `select ledger_account_code from financial_accounts where organization_id=$1 and id=$2
             and currency=$3 and status='active' for update`,
            [context.organizationId, document.funding_financial_account_id, document.currency],
          );
          if (!funding.rows[0]) throw new Error("PURCHASE_FUNDING_ACCOUNT_NOT_AVAILABLE");
          document.control_account_code = funding.rows[0].ledger_account_code;
        }
        journalId = await this.postDocumentJournal(client, context, document);
        if (document.type === "purchase_invoice" && action === "post") {
          if (document.funding_financial_account_id) next = "paid";
        }
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

  async reverseReplace(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion: string,
    input: CreateCommercialDocumentInput,
    reason: string,
    idempotencyKey: string,
    allowReconciliation = false,
  ) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ id, expectedVersion, input, reason }))
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
      const found = await client.query<StoredDocument & { journal_id: string | null }>(
        `select id,type,state,document_date::text,currency,party_id,document_number,net_minor::text,tax_minor::text,
          gross_minor::text,control_account_code,original_document_id,created_by,version::text,journal_id
         from commercial_documents where organization_id=$1 and id=$2 for update`,
        [context.organizationId, id],
      );
      const original = found.rows[0];
      if (!original) throw new Error("RESOURCE_NOT_FOUND");
      if (original.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
      if (!original.journal_id || !["issued", "posted"].includes(original.state))
        throw new Error("INVALID_DOCUMENT_TRANSITION");
      const reconciliation = await client.query(
        `select 1 from reconciliation_allocations
          where organization_id=$1 and commercial_document_id=$2 limit 1`,
        [context.organizationId, id],
      );
      if (reconciliation.rows[0] && !allowReconciliation)
        throw new Error("INVALID_DOCUMENT_TRANSITION");
      if ((input.id ?? "") === id) throw new Error("VALIDATION_FAILED");
      await this.assertPostingPeriod(client, context, input.documentDate);
      const journal = await client.query<{ state: string; currency: string; version: string }>(
        `select state,currency,version::text from journal_entries where organization_id=$1 and id=$2 for update`,
        [context.organizationId, original.journal_id],
      );
      if (journal.rows[0]?.state !== "posted") throw new Error("INVALID_JOURNAL_STATE");
      const reversalJournalId = randomUUID();
      await client.query(
        `insert into journal_entries(organization_id,id,journal_date,description,currency,state,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by,reversal_of_id,version)
         values($1,$2,$3,$4,$5,'posted',$6,now(),$6,$7,now(),$6,$8,3)`,
        [
          context.organizationId,
          reversalJournalId,
          input.documentDate,
          `Reversal of ${original.journal_id}: ${reason}`,
          journal.rows[0].currency,
          context.actorId,
          reason,
          original.journal_id,
        ],
      );
      await client.query(
        `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
         select organization_id,$3,line_number,account_code,credit_minor,debit_minor,description,dimensions
         from journal_lines where organization_id=$1 and journal_id=$2`,
        [context.organizationId, original.journal_id, reversalJournalId],
      );
      await client.query(
        `update journal_entries set state='reversed',version=version+1,updated_at=now() where organization_id=$1 and id=$2`,
        [context.organizationId, original.journal_id],
      );
      await client.query(
        `update commercial_documents set state='cancelled',version=version+1,updated_at=now()
          where organization_id=$1 and id=$2`,
        [context.organizationId, id],
      );
      const replacementId = input.id ?? randomUUID();
      await client.query(
        `insert into commercial_documents
         (organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,funding_financial_account_id,original_document_id,reason,created_by)
         values($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          context.organizationId,
          replacementId,
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
          input.fundingSource?.financialAccountId ?? null,
          input.type === "credit_note" ? (input.originalDocumentId ?? id) : null,
          input.type === "credit_note" ? (input.reason ?? reason) : null,
          context.actorId,
        ],
      );
      const operatingMode = await this.operatingMode(client, context.organizationId);
      for (const [lineIndex, line] of input.lines.entries()) {
        await this.insertDocumentLine(
          client,
          context,
          replacementId,
          lineIndex + 1,
          input,
          line,
          operatingMode,
        );
        for (const [allocationIndex, allocation] of line.allocations.entries())
          await client.query(
            `insert into commercial_document_allocations(organization_id,document_id,line_number,allocation_number,amount_minor,dimensions) values($1,$2,$3,$4,$5,$6)`,
            [
              context.organizationId,
              replacementId,
              lineIndex + 1,
              allocationIndex + 1,
              allocation.amountMinor,
              { ...allocation.dimensions, allocationId: allocation.id },
            ],
          );
      }
      if (allowReconciliation && reconciliation.rows[0]) {
        await client.query(
          `update reconciliation_allocations set commercial_document_id=$3
             where organization_id=$1 and commercial_document_id=$2`,
          [context.organizationId, id, replacementId],
        );
      }
      await client.query(
        `update external_references set document_id=$3,synced_at=now()
          where organization_id=$1 and document_id=$2`,
        [context.organizationId, id, replacementId],
      );
      const auditEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values($1,$2,'commercial_document',$3,$4,'reverse_replace',$5,$6,$7,$8)`,
        [
          context.organizationId,
          auditEventId,
          id,
          (BigInt(original.version) + 1n).toString(),
          context.actorId,
          context.correlationId,
          { state: original.state, journalId: original.journal_id },
          {
            state: "cancelled",
            reversalJournalId,
            replacementId,
            externalReferenceTransferred: true,
            reason,
          },
        ],
      );
      const response = {
        documentId: id,
        state: "cancelled",
        resourceVersion: (BigInt(original.version) + 1n).toString(),
        reversalJournalId,
        replacementDocumentId: replacementId,
        auditEventId,
        nextActions: [],
      };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        "commercial-document:reverse-replace",
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

  async reclassifyFunding(
    context: CommercialDocumentContext,
    id: string,
    expectedVersion: string,
    targetControlAccountCode: string,
    reason: string,
    idempotencyKey: string,
  ) {
    const existing = await this.get(context.organizationId, id);
    if (!existing) throw new Error("RESOURCE_NOT_FOUND");
    if (existing.type !== "purchase_invoice") throw new Error("VALIDATION_FAILED");
    const replacement = {
      id: randomUUID(),
      type: "purchase_invoice" as const,
      documentNumber: existing.document_number,
      series: existing.series ?? undefined,
      fiscalYear: Number(existing.fiscal_year),
      partyId: existing.party_id,
      documentDate: String(existing.document_date).slice(0, 10),
      dueDate: String(existing.due_date).slice(0, 10),
      currency: existing.currency,
      netMinor: String(existing.net_minor),
      taxMinor: String(existing.tax_minor),
      grossMinor: String(existing.gross_minor),
      controlAccountCode: targetControlAccountCode,
      lines: (existing.lines ?? []).map((line: Record<string, unknown>) => ({
        description: line.description,
        quantity: String(line.quantity ?? "1"),
        unitPriceMinor: String(line.unitPriceMinor ?? line.grossMinor ?? "0"),
        netMinor: String(line.netMinor ?? line.grossMinor ?? "0"),
        taxMinor: String(line.taxMinor ?? "0"),
        grossMinor: String(line.grossMinor ?? "0"),
        primaryAccountCode: line.primaryAccountCode,
        categoryCode: line.categoryCode ?? undefined,
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
      })),
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
           (coalesce((select sum(value_minor) from contracts where organization_id=$1 and project_id=$2 and currency=$3 and signed_on <= $5),0)
            + coalesce((select sum(expected_revenue_impact_minor) from scope_changes where organization_id=$1 and project_id=$2 and state='approved' and approved_at::date <= $5),0))::text allowed,
           coalesce((select sum(case when d.type='credit_note' then -a.amount_minor else a.amount_minor end)
             from commercial_document_allocations a join commercial_documents d
               on d.organization_id=a.organization_id and d.id=a.document_id
            where a.organization_id=$1 and a.dimensions->>'projectId'=$2 and d.id<>$4
              and d.state in('issued','posted','partially_paid','paid')),0)::text used`,
        [organizationId, projectId, document.currency, document.id, document.document_date],
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
  private async assertSelfApproval(
    client: PoolClient,
    context: CommercialDocumentContext,
    total: bigint,
  ) {
    const policy = await resolveOrganizationWorkflowPolicy(context.organizationId, client);
    if (!canSelfApprove({ policy, roles: context.roles, amountMinor: total }))
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
      vat_state: string;
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
      vat_state: string;
      primary_account_code: string;
      tax_account_code: string | null;
      dimensions: Record<string, string>;
    }>(
      `select line_number,description,net_minor::text,tax_minor::text,vat_state::text,primary_account_code,tax_account_code,dimensions
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
          const taxIsDeductible =
            taxState === undefined
              ? line.vat_state === "eligible"
              : ["eligible", "accountant_override"].includes(taxState);
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
