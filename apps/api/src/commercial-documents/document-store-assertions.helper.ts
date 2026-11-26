import type { PoolClient } from "pg";
import type { CreateCommercialDocumentInput } from "./commercial-document.types.js";

export type AssertionStoredDocument = {
  id: string;
  party_id: string;
  currency: string;
  document_date: string;
};

export async function assertSalesContractCoverageQuery(
  client: PoolClient,
  organizationId: string,
  document: AssertionStoredDocument,
): Promise<void> {
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

export async function assertCreditAllowedQuery(
  client: PoolClient,
  organizationId: string,
  input: CreateCommercialDocumentInput,
  excludeDocumentId?: string,
): Promise<void> {
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
