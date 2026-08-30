import { Injectable } from "@nestjs/common";
import pg from "pg";
import type {
  ExpenseReportDimension,
  ExpenseReportFact,
  ExpenseReportRange,
} from "./expense-report.types.js";

@Injectable()
export class PgExpenseReportStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async facts(
    organizationId: string,
    range: ExpenseReportRange,
    dimension: ExpenseReportDimension,
  ): Promise<ExpenseReportFact[]> {
    const payeeSql = `
      select d.id source_id,to_char(d.document_date,'YYYY-MM') report_month,d.currency,
        d.party_id dimension_key,coalesce(p.legal_name,p.display_name) dimension_name,d.net_minor::text net_minor,d.tax_minor::text vat_minor,d.gross_minor::text amount_minor
      from commercial_documents d
      left join parties p on p.organization_id=d.organization_id and p.id=d.party_id
      where d.organization_id=$1 and d.type='purchase_invoice'
        and d.state in ('posted','partially_paid','paid')
        and d.document_date between $2::date and $3::date
      union all
      select e.id,to_char(e.expense_date,'YYYY-MM') report_month,e.currency,
        e.payee_party_id,coalesce(p.legal_name,p.display_name),e.net_minor::text,e.vat_minor::text,e.gross_minor::text
      from expenses e
      left join parties p on p.organization_id=e.organization_id and p.id=e.payee_party_id
      where e.organization_id=$1 and e.state='posted'
        and e.expense_date between $2::date and $3::date`;
    const categorySql = `
      select d.id || ':' || l.line_number source_id,to_char(d.document_date,'YYYY-MM') report_month,d.currency,
        coalesce(nullif(l.category_code,''),nullif(l.dimensions->>'category',''),
          (select nullif(a.dimensions->>'category','') from commercial_document_allocations a
            where a.organization_id=l.organization_id and a.document_id=l.document_id and a.line_number=l.line_number
            order by a.allocation_number limit 1)) dimension_key,
        c.name dimension_name,l.net_minor::text net_minor,l.tax_minor::text vat_minor,l.gross_minor::text amount_minor
      from commercial_documents d
      join commercial_document_lines l on l.organization_id=d.organization_id and l.document_id=d.id
      left join business_categories c on c.organization_id=d.organization_id and c.kind='expense' and c.code=coalesce(nullif(l.category_code,''),nullif(l.dimensions->>'category',''))
      where d.organization_id=$1 and d.type='purchase_invoice'
        and d.state in ('posted','partially_paid','paid')
        and d.document_date between $2::date and $3::date
      union all
      select e.id || ':' || l.line_number,to_char(e.expense_date,'YYYY-MM') report_month,e.currency,
        l.expense_category_code,c.name,l.net_minor::text,l.vat_minor::text,l.gross_minor::text
      from expenses e
      join expense_lines l on l.organization_id=e.organization_id and l.expense_id=e.id
      left join expense_categories c on c.organization_id=e.organization_id and c.code=l.expense_category_code
      where e.organization_id=$1 and e.state='posted'
        and e.expense_date between $2::date and $3::date`;
    const result = await this.pool.query(dimension === "payee" ? payeeSql : categorySql, [
      organizationId,
      range.startsOn,
      range.endsOn,
    ]);
    return result.rows.map((row) => ({
      sourceId: row.source_id,
      month: row.report_month,
      currency: row.currency,
      dimensionKey: row.dimension_key,
      dimensionName: row.dimension_name,
      netMinor: row.net_minor,
      vatMinor: row.vat_minor,
      amountMinor: row.amount_minor,
    }));
  }
}
