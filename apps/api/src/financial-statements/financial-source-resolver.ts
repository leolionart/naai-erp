import { Injectable } from "@nestjs/common";
import {
  FINANCIAL_DRILLDOWN_CONTRACT_VERSION,
  type FinancialSourceRefContract,
  type FinancialSourceResolutionContract,
} from "@naai-erp/contracts";
import pg from "pg";
import type { FinancialStatementContext } from "./financial-statement.types.js";

const EVIDENCE_READ = new Set(["owner", "finance_admin", "accountant", "approver", "viewer"]);
type SourceRow = Readonly<{ resource_type: "commercial_document" | "expense"; id: string }>;
type EvidenceRow = Readonly<{ id: string }>;

const href = (
  organizationId: string,
  resourceType: FinancialSourceRefContract["resourceType"],
  id: string,
) => {
  const organization = encodeURIComponent(organizationId);
  const resource = encodeURIComponent(id);
  if (resourceType === "journal_line") {
    const [journalId, lineNumber] = id.split(":");
    return `/api/v1/organizations/${organization}/journals/${encodeURIComponent(journalId ?? "")}?lineNumber=${encodeURIComponent(lineNumber ?? "")}`;
  }
  const paths: Record<
    Exclude<FinancialSourceRefContract["resourceType"], "journal_line">,
    string
  > = {
    journal_entry: "journals",
    commercial_document: "commercial-documents",
    expense: "expenses",
    evidence: "evidence",
  };
  return `/api/v1/organizations/${organization}/${paths[resourceType]}/${resource}`;
};

@Injectable()
export class FinancialSourceResolver {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async resolve(
    context: FinancialStatementContext,
    journalId: string,
    lineNumber: number,
    reportAmountMinor?: string,
  ): Promise<FinancialSourceResolutionContract> {
    const line = await this.pool.query<{
      debit_minor: string | null;
      credit_minor: string | null;
      root_type: "asset" | "liability" | "equity" | "revenue" | "expense";
    }>(
      `select l.debit_minor::text,l.credit_minor::text,a.root_type
       from journal_lines l join accounts a on a.organization_id=l.organization_id and a.code=l.account_code
       where l.organization_id=$1 and l.journal_id=$2 and l.line_number=$3`,
      [context.organizationId, journalId, lineNumber],
    );
    if (!line.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    const sources = await this.pool.query<SourceRow>(
      `select 'commercial_document' resource_type,id from commercial_documents
       where organization_id=$1 and journal_id=$2
       union all
       select 'expense' resource_type,id from expenses
       where organization_id=$1 and journal_id=$2
       order by resource_type,id`,
      [context.organizationId, journalId],
    );
    const refs: FinancialSourceRefContract[] = [
      {
        resourceType: "journal_line",
        id: `${journalId}:${lineNumber}`,
        href: href(context.organizationId, "journal_line", `${journalId}:${lineNumber}`),
      },
      {
        resourceType: "journal_entry",
        id: journalId,
        href: href(context.organizationId, "journal_entry", journalId),
      },
      ...sources.rows.map((source) => ({
        resourceType: source.resource_type,
        id: source.id,
        href: href(context.organizationId, source.resource_type, source.id),
      })),
    ];
    if (context.roles.some((role) => EVIDENCE_READ.has(role)) && sources.rows.length) {
      const evidence = await this.pool.query<EvidenceRow>(
        `select distinct r.id from evidence_records r
         join evidence_versions v on v.organization_id=r.organization_id and v.evidence_id=r.id and v.version_number=r.current_version
         where r.organization_id=$1 and v.status='active'
           and (r.subject_type,r.subject_id) in (
             select 'commercial_document',id from commercial_documents where organization_id=$1 and journal_id=$2
             union all select 'expense',id from expenses where organization_id=$1 and journal_id=$2
           ) order by r.id`,
        [context.organizationId, journalId],
      );
      refs.push(
        ...evidence.rows.map(({ id }) => ({
          resourceType: "evidence" as const,
          id,
          href: href(context.organizationId, "evidence", id),
        })),
      );
    }
    const row = line.rows[0];
    const debit = BigInt(row.debit_minor ?? "0"),
      credit = BigInt(row.credit_minor ?? "0");
    const natural = ["liability", "equity", "revenue"].includes(row.root_type)
      ? credit - debit
      : debit - credit;
    return {
      schemaVersion: FINANCIAL_DRILLDOWN_CONTRACT_VERSION,
      journalId,
      lineNumber,
      amountMinor: reportAmountMinor ?? natural.toString(),
      refs,
    };
  }
}
