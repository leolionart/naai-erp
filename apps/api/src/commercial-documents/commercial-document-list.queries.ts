import type { Pool } from "pg";
import type { ListCursor } from "@naai-erp/contracts";

export interface CommercialDocumentListFilters {
  type?: string;
  state?: string;
  partyId?: string;
  projectId?: string;
  startsOn?: string;
  endsOn?: string;
  /** Case-insensitive search over document number, id and party id. */
  q?: string;
}

export interface CommercialDocumentListPaging {
  fetch: number;
  cursor?: ListCursor;
  summary?: boolean;
  /** Flips the keyset order to document_date asc, id asc. */
  ascending?: boolean;
}

// Parameters $1..$8 are shared by list, count and summary so filters never drift apart.
const FILTER_SQL = `       and ($2::text is null or d.type::text=$2)
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
     and ($8::text is null or d.document_number ilike $8 or d.id ilike $8 or d.party_id ilike $8)`;

function filterParams(organizationId: string, filters: CommercialDocumentListFilters) {
  return [
    organizationId,
    filters.type ?? null,
    filters.state ?? null,
    filters.partyId ?? null,
    filters.projectId ?? null,
    filters.startsOn ?? null,
    filters.endsOn ?? null,
    filters.q ? `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null,
  ];
}

const LIST_LINES_SQL = `coalesce(jsonb_agg(
         jsonb_set(to_jsonb(l), '{category_code}', to_jsonb(coalesce(nullif(l.category_code,''),nullif(l.dimensions->>'category',''),
           (select nullif(a0.dimensions->>'category','') from commercial_document_allocations a0
            where a0.organization_id=l.organization_id and a0.document_id=l.document_id and a0.line_number=l.line_number
            order by a0.allocation_number limit 1)))
         ) || jsonb_build_object('allocations',coalesce((select jsonb_agg(a order by a.allocation_number)
           from commercial_document_allocations a where a.organization_id=l.organization_id and a.document_id=l.document_id and a.line_number=l.line_number),'[]'::jsonb))
         order by l.line_number) filter (where l.line_number is not null),'[]')`;

/** Keyset order: document_date desc, id asc (BR-READ-002). */
export async function listCommercialDocuments(
  pool: Pool,
  organizationId: string,
  filters: CommercialDocumentListFilters,
  paging: CommercialDocumentListPaging,
) {
  const linesSql = paging.summary ? "'[]'::jsonb" : LIST_LINES_SQL;
  const result = await pool.query(
    `select d.*,d.document_date::text document_date,d.due_date::text due_date,d.paid_on::text paid_on,
     d.payment_method "paymentMethod",d.paid_on::text "paidOn",d.payment_evidence_ref "paymentEvidenceRef",
     d.transaction_evidence "transactionEvidence",d.payment_evidence_missing "paymentEvidenceMissing",
     coalesce(d.draft_reasons,'[]'::jsonb) "draftReasons",
     case when d.state='draft' then coalesce(d.draft_reasons,'[]'::jsonb) else '[]'::jsonb end reasons,
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
     ${linesSql} lines
     from commercial_documents d left join commercial_document_lines l
       on l.organization_id=d.organization_id and l.document_id=d.id
     where d.organization_id=$1
${FILTER_SQL}
     and ($9::date is null or ${paging.ascending ? "d.document_date > $9::date" : "d.document_date < $9::date"} or (d.document_date = $9::date and d.id > $10::text))
     group by d.organization_id,d.id order by d.document_date ${paging.ascending ? "asc" : "desc"},d.id
     limit $11`,
    [
      ...filterParams(organizationId, filters),
      paging.cursor?.k[0] ?? null,
      paging.cursor?.id ?? null,
      paging.fetch,
    ],
  );
  return result.rows;
}

export type CommercialDocumentSummaryGroup = "month" | "state" | "type" | "party";
export const COMMERCIAL_DOCUMENT_SUMMARY_GROUPS: readonly CommercialDocumentSummaryGroup[] = [
  "month",
  "state",
  "type",
  "party",
];
const GROUP_KEY_SQL: Record<CommercialDocumentSummaryGroup, string> = {
  month: "to_char(d.document_date,'YYYY-MM')",
  state: "d.state::text",
  type: "d.type::text",
  party: "coalesce(d.party_id,'(none)')",
};

export async function countCommercialDocuments(
  pool: Pool,
  organizationId: string,
  filters: CommercialDocumentListFilters,
) {
  const result = await pool.query(
    `select count(*)::int total from commercial_documents d where d.organization_id=$1
${FILTER_SQL}`,
    filterParams(organizationId, filters),
  );
  return (result.rows[0]?.total as number | undefined) ?? 0;
}

/** At most 120 groups of count and gross totals per currency, so AI and charts never download records. */
export async function summarizeCommercialDocuments(
  pool: Pool,
  organizationId: string,
  filters: CommercialDocumentListFilters,
  groupBy: CommercialDocumentSummaryGroup,
) {
  const result = await pool.query(
    `select ${GROUP_KEY_SQL[groupBy]} key, d.currency, count(*)::int count, coalesce(sum(d.gross_minor),0)::text "grossMinor"
       from commercial_documents d where d.organization_id=$1
${FILTER_SQL}
      group by 1,2 order by ${groupBy === "month" ? "1 desc" : "3 desc, 1"}, 2
      limit 121`,
    filterParams(organizationId, filters),
  );
  return { groupBy, groups: result.rows.slice(0, 120), truncated: result.rows.length > 120 };
}
