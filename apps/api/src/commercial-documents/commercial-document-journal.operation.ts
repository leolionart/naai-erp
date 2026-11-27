import { randomUUID } from "node:crypto";
import { type PoolClient } from "pg";
import type {
  CommercialDocumentContext,
  CreateCommercialDocumentInput,
} from "./commercial-document.types.js";
import { type StoredDocument } from "./pg-commercial-document.store.shared.js";
import type { PgCommercialDocumentStore } from "./pg-commercial-document.store.js";

export async function postDocumentJournalOperation(
  this: PgCommercialDocumentStore,
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
    payment_evidence_missing: boolean;
    primary_account_code: string;
    tax_account_code: string | null;
    dimensions: Record<string, string>;
  }>(
    `select line_number,description,net_minor::text,tax_minor::text,vat_state::text,payment_evidence_missing,primary_account_code,tax_account_code,dimensions
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
          line.payment_evidence_missing && line.vat_state === "unreviewed"
            ? false
            : taxState === undefined || taxState === "unreviewed"
              ? ["eligible", "accountant_override"].includes(line.vat_state)
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

export async function validateRelationshipsOperation(
  this: PgCommercialDocumentStore,
  organizationId: string,
  input: CreateCommercialDocumentInput,
) {
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
