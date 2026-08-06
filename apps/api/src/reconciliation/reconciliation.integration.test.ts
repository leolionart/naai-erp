import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const suite = enabled ? describe : describe.skip;

suite("ERP-410 reconciliation PostgreSQL API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const token = "erp410-finance";
  const headers = (key?: string) => ({
    authorization: `Bearer ${token}`,
    ...(key ? { "idempotency-key": key } : {}),
    "x-correlation-id": `corr-${key ?? "read"}`,
  });
  beforeAll(async () => {
    await pool.query(`
      insert into organizations(id,legal_name,base_currency,timezone) values('org-erp410','ERP 410','VND','Asia/Ho_Chi_Minh');
      insert into fiscal_years(organization_id,year,starts_on,ends_on) values('org-erp410',2026,'2026-01-01','2026-12-31');
      insert into fiscal_periods(organization_id,fiscal_year,period_number,starts_on,ends_on) values('org-erp410',2026,8,'2026-08-01','2026-08-31');
      insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting) values
       ('org-erp410','1121','Bank','asset',true,false),('org-erp410','131','AR','asset',true,false),('org-erp410','511','Revenue','revenue',false,true),('org-erp410','642','Bank fee','expense',false,true);
      insert into parties(organization_id,id,display_name) values('org-erp410','client-1','Client A');
      insert into financial_accounts(organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,created_by,updated_by)
       values('org-erp410','bank-1','VCB-1','bank','VCB','VND','1121','VCB','finance','finance');
      insert into bank_transactions(organization_id,id,financial_account_id,fingerprint,booking_date,amount_minor,currency,reference,description,counterparty_name)
       values('org-erp410','txn-1','bank-1',repeat('e',64),'2026-08-05',60000000,'VND','SI-001','Payment SI-001','Client A');
      insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)
       values('org-erp410','source-journal','2026-08-01','Invoice','VND','posted',2,'finance',now(),'finance','Approved',now(),'finance');
      insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,description) values('org-erp410','source-journal',1,'131',110000000,'AR');
      insert into journal_lines(organization_id,journal_id,line_number,account_code,credit_minor,description) values('org-erp410','source-journal',2,'511',110000000,'Revenue');
      insert into commercial_documents(organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,journal_id,created_by,issued_or_posted_by,issued_or_posted_at)
       values('org-erp410','sales-1','sales_invoice','posted','SI-001','SI',2026,'client-1','2026-08-01','2026-08-31','VND',110000000,0,110000000,'131','source-journal','finance','finance',now());
    `);
    await pool.query(
      "insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values('org-erp410','cred','finance',$1,'[\"finance_admin\"]')",
      [createHash("sha256").update(token).digest("hex")],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });
  it("suggests matches partially reconciles and unreconciles with immutable journals", async () => {
    const suggest = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp410/banking/transactions/txn-1/suggest",
      headers: headers("suggest"),
      payload: { schemaVersion: 1 },
    });
    expect(suggest.statusCode, suggest.body).toBe(201);
    expect(suggest.json().data.state).toBe("suggested");
    const candidates = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp410/banking/transactions/txn-1/candidates",
      headers: headers(),
    });
    expect(candidates.json().data.items[0]).toMatchObject({
      targetType: "commercial_document",
      targetId: "sales-1",
    });
    const match = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp410/banking/transactions/txn-1/match",
      headers: headers("match"),
      payload: {
        schemaVersion: 1,
        baseAmountMinor: "60000000",
        allocations: [
          {
            targetType: "commercial_document",
            targetId: "sales-1",
            targetAmountMinor: "60000000",
            targetCurrency: "VND",
            baseAmountMinor: "60000000",
          },
        ],
        adjustments: [],
      },
    });
    expect(match.statusCode, match.body).toBe(201);
    const reconciliationId = match.json().data.reconciliation.id;
    expect(match.json().data.reconciliation.state).toBe("matched");
    const reconciled = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp410/banking/transactions/txn-1/reconcile",
      headers: headers("reconcile"),
      payload: { schemaVersion: 1, reason: "Bank statement reviewed" },
    });
    expect(reconciled.statusCode, reconciled.body).toBe(201);
    const journalId = reconciled.json().data.reconciliation.drilldown.journalId;
    const totals = await pool.query(
      "select coalesce(sum(debit_minor),0)::text debit,coalesce(sum(credit_minor),0)::text credit from journal_lines where organization_id='org-erp410' and journal_id=$1",
      [journalId],
    );
    expect(totals.rows[0]).toEqual({ debit: "60000000", credit: "60000000" });
    expect(
      (
        await pool.query(
          "select state from commercial_documents where organization_id='org-erp410' and id='sales-1'",
        )
      ).rows[0].state,
    ).toBe("partially_paid");
    const un = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp410/banking/transactions/txn-1/unreconcile",
      headers: headers("unreconcile"),
      payload: { schemaVersion: 1, reason: "Wrong bank line" },
    });
    expect(un.statusCode, un.body).toBe(201);
    expect(un.json().data.reconciliation.state).toBe("unreconciled");
    const read = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/org-erp410/banking/reconciliations/${reconciliationId}`,
      headers: headers(),
    });
    expect(read.json().data.attempts).toHaveLength(1);
    expect(read.json().data.drilldown.reversalJournalId).toBeTruthy();
    expect(
      (
        await pool.query(
          "select state from commercial_documents where organization_id='org-erp410' and id='sales-1'",
        )
      ).rows[0].state,
    ).toBe("issued");
  });
});
