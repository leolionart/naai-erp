import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const suite = enabled ? describe : describe.skip;

suite("ERP-889 customer receipt PostgreSQL API", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const token = `erp889-owner-token-${randomUUID()}`;
  const org = `org-erp889-${randomUUID().slice(0, 8)}`;
  let app: Awaited<ReturnType<typeof createApp>>;
  const headers = (key: string) => ({
    authorization: `Bearer ${token}`,
    "x-correlation-id": `corr-${key}`,
    "idempotency-key": key,
  });

  beforeAll(async () => {
    await pool.query(`
      insert into organizations(id,legal_name,base_currency,timezone) values
        ('${org}','ERP 889','VND','Asia/Ho_Chi_Minh');
      insert into fiscal_years(organization_id,year,starts_on,ends_on) values
        ('${org}',2026,'2026-01-01','2026-12-31');
      insert into fiscal_periods(organization_id,fiscal_year,period_number,starts_on,ends_on,state) values
        ('${org}',2026,8,'2026-08-01','2026-08-31','open'),
        ('${org}',2026,9,'2026-09-01','2026-09-30','hard_locked');
      insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting) values
        ('${org}','112','Bank','asset',false,true),
        ('${org}','131','Accounts receivable','asset',true,false),
        ('${org}','511','Revenue','revenue',false,true);
      insert into parties(organization_id,id,display_name,status) values
        ('${org}','customer','Customer','active');
      insert into party_roles(organization_id,party_id,role) values
        ('${org}','customer','client');
      insert into financial_accounts(organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,created_by,updated_by) values
        ('${org}','bank','BANK','bank','Bank','VND','112','BANK','owner','owner');
      insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by) values
        ('${org}','invoice-journal-1','2026-08-01','Invoice 1','VND','posted',1,'owner',now(),'owner','Issue',now(),'owner'),
        ('${org}','invoice-journal-2','2026-08-02','Invoice 2','VND','posted',1,'owner',now(),'owner','Issue',now(),'owner');
      insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values
        ('${org}','invoice-journal-1',1,'131',100,null,'AR','{}'),
        ('${org}','invoice-journal-1',2,'511',null,100,'Revenue','{}'),
        ('${org}','invoice-journal-2',1,'131',50,null,'AR','{}'),
        ('${org}','invoice-journal-2',2,'511',null,50,'Revenue','{}');
      insert into commercial_documents(organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,journal_id,created_by) values
        ('${org}','invoice-1','sales_invoice','issued','INV-1','AA',2026,'customer','2026-08-01','2026-08-31','VND',100,0,100,'131','invoice-journal-1','owner'),
        ('${org}','invoice-2','sales_invoice','issued','INV-2','AA',2026,'customer','2026-08-02','2026-08-31','VND',50,0,50,'131','invoice-journal-2','owner');
    `);
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles)
       values($2,'credential','owner',$1,'["owner"]')`,
      [createHash("sha256").update(token).digest("hex"), org],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("posts partial then full allocations with balanced journals and idempotent replay", async () => {
    const partialRequest = {
      method: "POST" as const,
      url: `/api/v1/organizations/${org}/customer-receipts`,
      headers: headers("receipt-partial"),
      payload: {
        schemaVersion: 1,
        id: "receipt-1",
        financialAccountId: "bank",
        receiptDate: "2026-08-11",
        amountMinor: "60",
        currency: "VND",
        description: "Partial receipt",
        reason: "Customer paid",
        allocations: [{ salesInvoiceId: "invoice-1", amountMinor: "60" }],
      },
    };
    const partial = await app.inject(partialRequest);
    expect(partial.statusCode, partial.body).toBe(201);
    expect(partial.json().data.allocations[0]).toMatchObject({
      invoiceState: "partially_paid",
      invoiceOutstandingMinor: "40",
    });
    const replay = await app.inject(partialRequest);
    expect(replay.statusCode, replay.body).toBe(201);
    expect(replay.json().data.idempotencyReplayed).toBe(true);

    const full = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/customer-receipts`,
      headers: headers("receipt-full"),
      payload: {
        ...partialRequest.payload,
        id: "receipt-2",
        amountMinor: "90",
        description: "Final receipt",
        allocations: [
          { salesInvoiceId: "invoice-1", amountMinor: "40" },
          { salesInvoiceId: "invoice-2", amountMinor: "50" },
        ],
      },
    });
    expect(full.statusCode, full.body).toBe(201);
    expect(full.json().data.allocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ salesInvoiceId: "invoice-1", invoiceState: "paid" }),
        expect.objectContaining({ salesInvoiceId: "invoice-2", invoiceState: "paid" }),
      ]),
    );
    const controls = await pool.query(
      `
      select count(*)::int receipts,
        (select count(*)::int from commercial_documents where organization_id=$1 and state='paid') paid,
        (select count(*)::int from journal_entries where organization_id=$1 and description in ('Partial receipt','Final receipt')) journals,
        (select coalesce(sum(coalesce(debit_minor,0)-coalesce(credit_minor,0)),0)::text from journal_lines where organization_id=$1 and journal_id in (select journal_id from customer_receipts where organization_id=$1)) balance
      from customer_receipts where organization_id=$1
    `,
      [org],
    );
    expect(controls.rows[0]).toEqual({ receipts: 2, paid: 2, journals: 2, balance: "0" });
  });

  it("rejects allocation mismatch and a locked receipt period without writes", async () => {
    const countBefore = await pool.query(
      "select count(*)::int n from customer_receipts where organization_id=$1",
      [org],
    );
    const invalid = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/customer-receipts`,
      headers: headers("receipt-invalid"),
      payload: {
        schemaVersion: 1,
        financialAccountId: "bank",
        receiptDate: "2026-08-12",
        amountMinor: "10",
        currency: "VND",
        description: "Invalid",
        reason: "Test",
        allocations: [{ salesInvoiceId: "invoice-1", amountMinor: "9" }],
      },
    });
    expect(invalid.statusCode).toBeGreaterThanOrEqual(400);
    const locked = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/customer-receipts`,
      headers: headers("receipt-locked"),
      payload: {
        schemaVersion: 1,
        financialAccountId: "bank",
        receiptDate: "2026-09-12",
        amountMinor: "1",
        currency: "VND",
        description: "Locked",
        reason: "Test",
        allocations: [{ salesInvoiceId: "invoice-1", amountMinor: "1" }],
      },
    });
    expect(locked.statusCode).toBeGreaterThanOrEqual(400);
    const countAfter = await pool.query(
      "select count(*)::int n from customer_receipts where organization_id=$1",
      [org],
    );
    expect(countAfter.rows[0].n).toBe(countBefore.rows[0].n);
  });
});
