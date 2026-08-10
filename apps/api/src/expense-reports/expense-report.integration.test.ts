import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExpenseReportService } from "./expense-report.service.js";
import { PgExpenseReportStore } from "./pg-expense-report.store.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("T-API-ERP-882-001 canonical monthly expense report SQL", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const organizationId = `org-rpt-${randomUUID()}`;
  const otherOrganizationId = `org-rpt-${randomUUID()}`;
  const store = new PgExpenseReportStore();
  const service = new ExpenseReportService(store, {} as never);

  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone) values
       ($1,'Expense report fixture','VND','Asia/Ho_Chi_Minh'),
       ($2,'Other expense report fixture','VND','Asia/Ho_Chi_Minh')`,
      [organizationId, otherOrganizationId],
    );
    for (const org of [organizationId, otherOrganizationId]) {
      await pool.query(
        `insert into parties(organization_id,id,display_name,status) values
         ($1,'supplier-a','Supplier A','active'),($1,'supplier-b','Supplier B','active')`,
        [org],
      );
      await pool.query(
        `insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting) values
         ($1,'331','Accounts payable','liability',true,false),
         ($1,'642','Operating expense','expense',false,true),
         ($1,'1331','Deductible VAT','asset',true,false)`,
        [org],
      );
      await pool.query(
        `insert into dimension_values(organization_id,kind,code,name)
         values($1,'category','CAT-A','Category A')`,
        [org],
      );
      await pool.query(
        `insert into expense_categories(organization_id,code,name,funding_treatment,created_by,updated_by)
         values($1,'CAT-A','Category A','company_funds','fixture','fixture')`,
        [org],
      );
    }
    await pool.query(
      `insert into commercial_documents
       (organization_id,id,type,state,document_number,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,created_by)
       values
       ($1,'purchase-posted','purchase_invoice','posted','PI-1',2026,'supplier-a','2026-01-15','2026-01-15','VND',300,30,330,'331','fixture'),
       ($1,'purchase-draft','purchase_invoice','draft','PI-2',2026,'supplier-a','2026-01-20','2026-01-20','VND',80,8,88,'331','fixture'),
       ($1,'purchase-outside','purchase_invoice','paid','PI-3',2025,'supplier-a','2025-12-31','2025-12-31','VND',90,9,99,'331','fixture'),
       ($2,'purchase-other','purchase_invoice','posted','PI-X',2026,'supplier-a','2026-01-15','2026-01-15','VND',60,6,66,'331','fixture')`,
      [organizationId, otherOrganizationId],
    );
    await pool.query(
      `insert into commercial_document_lines
       (organization_id,document_id,line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,primary_account_code,tax_account_code,dimensions)
       values
       ($1,'purchase-posted',1,'Categorized line',1,100,100,10,110,'642','1331','{"category":"CAT-A"}'),
       ($1,'purchase-posted',2,'Unclassified line',1,200,200,20,220,'642','1331','{}'),
       ($1,'purchase-draft',1,'Draft line',1,80,80,8,88,'642','1331','{"category":"CAT-A"}'),
       ($1,'purchase-outside',1,'Outside line',1,90,90,9,99,'642','1331','{"category":"CAT-A"}'),
       ($2,'purchase-other',1,'Other org line',1,60,60,6,66,'642','1331','{"category":"CAT-A"}')`,
      [organizationId, otherOrganizationId],
    );
    await pool.query(
      `insert into expenses
       (organization_id,id,expense_class,state,payee_party_id,expense_date,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,created_by)
       values
       ($1,'expense-vnd','receipt_backed','posted','supplier-b','2026-02-05','VND expense','VND',50,5,55,'331','fixture'),
       ($1,'expense-usd','receipt_backed','posted','supplier-b','2026-02-06','USD expense','USD',10,2,12,'331','fixture'),
       ($1,'expense-reversed','receipt_backed','reversed','supplier-b','2026-02-07','Reversed','VND',70,7,77,'331','fixture'),
       ($2,'expense-other','receipt_backed','posted','supplier-b','2026-02-05','Other org','VND',60,6,66,'331','fixture')`,
      [organizationId, otherOrganizationId],
    );
    await pool.query(
      `insert into expense_lines
       (organization_id,expense_id,line_number,description,net_minor,vat_minor,gross_minor,posting_account_code,vat_account_code,expense_category_code,funding_treatment)
       values
       ($1,'expense-vnd',1,'VND line',50,5,55,'642','1331','CAT-A','company_funds'),
       ($1,'expense-usd',1,'USD line',10,2,12,'642','1331',null,null),
       ($1,'expense-reversed',1,'Reversed line',70,7,77,'642','1331','CAT-A','company_funds'),
       ($2,'expense-other',1,'Other org line',60,6,66,'642','1331','CAT-A','company_funds')`,
      [organizationId, otherOrganizationId],
    );
  });

  afterAll(async () => {
    await pool.end();
    await (store as unknown as { pool: pg.Pool }).pool.end();
  });

  it("counts payee headers once and isolates organization, inclusive dates, states, and currencies", async () => {
    const range = { startsOn: "2026-01-01", endsOn: "2026-02-28" };
    const report = service.aggregate(
      await store.facts(organizationId, range, "payee"),
      range,
      "payee",
    );
    expect(report.seriesByCurrency.map((series) => series.currency)).toEqual(["USD", "VND"]);
    const vnd = report.seriesByCurrency.find((series) => series.currency === "VND")!;
    expect(vnd.totalMinor).toBe("385");
    expect(vnd.sourceCount).toBe("2");
    expect(vnd.groups.find((group) => group.key === "supplier-a")?.totalMinor).toBe("330");
    expect(vnd.reconciliation.differenceMinor).toBe("0");
    expect(report.seriesByCurrency.find((series) => series.currency === "USD")?.totalMinor).toBe(
      "12",
    );
  });

  it("sums persisted source-line categories and keeps null explicitly unclassified", async () => {
    const range = { startsOn: "2026-01-01", endsOn: "2026-02-28" };
    const report = service.aggregate(
      await store.facts(organizationId, range, "category"),
      range,
      "category",
    );
    const vnd = report.seriesByCurrency.find((series) => series.currency === "VND")!;
    expect(vnd.groups.find((group) => group.key === "CAT-A")?.totalMinor).toBe("165");
    expect(vnd.groups.find((group) => group.key === null)).toMatchObject({
      name: "Chưa phân loại",
      totalMinor: "220",
    });
    expect(vnd.totalMinor).toBe("385");
    expect(vnd.reconciliation.differenceMinor).toBe("0");
    expect(
      report.seriesByCurrency.find((series) => series.currency === "USD")?.groups[0],
    ).toMatchObject({ key: null, totalMinor: "12" });
  });
});
