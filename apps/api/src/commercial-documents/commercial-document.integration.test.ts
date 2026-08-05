import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-300 commercial documents", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const integrationToken = "erp300-integration";
  const financeToken = "erp300-finance";
  const approverToken = "erp300-approver";
  beforeAll(async () => {
    await pool.query(`
      insert into organizations (id,legal_name,base_currency,timezone) values ('org-doc','Document Org','VND','Asia/Ho_Chi_Minh');
      insert into fiscal_years (organization_id,year,starts_on,ends_on) values ('org-doc',2026,'2026-01-01','2026-12-31');
      insert into fiscal_periods (organization_id,fiscal_year,period_number,starts_on,ends_on) values ('org-doc',2026,1,'2026-01-01','2026-01-31'),('org-doc',2026,2,'2026-02-01','2026-02-28');
      insert into parties (organization_id,id,display_name,status) values ('org-doc','CLIENT-A','Client A','active'),('org-doc','SUPPLIER-A','Supplier A','active');
      insert into accounts (organization_id,code,name,root_type,is_control_account,allow_manual_posting) values
       ('org-doc','131-AR','AR','asset',true,false),('org-doc','331-AP','AP','liability',true,false),
       ('org-doc','511-REV','Revenue','revenue',false,true),('org-doc','3331-VAT-OUT','VAT output','liability',true,false),
       ('org-doc','632-COST','Direct cost','expense',false,true),('org-doc','1331-VAT-IN','VAT input','asset',true,false);
    `);
    const values = [integrationToken, financeToken, approverToken].map((token) =>
      createHash("sha256").update(token).digest("hex"),
    );
    await pool.query(
      `insert into api_credentials (organization_id,id,actor_id,token_hash,roles) values
      ('org-doc','doc-integration','integration-user',$1,'["integration"]'),
      ('org-doc','doc-finance','finance-user',$2,'["finance_admin"]'),
      ('org-doc','doc-approver','approver-user',$3,'["approver","accountant"]')`,
      values,
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });
  const headers = (token: string, key: string) => ({
    authorization: `Bearer ${token}`,
    "idempotency-key": key,
  });
  const command = (id: string, action: string, token: string, key: string) =>
    app.inject({
      method: "POST",
      url: `/api/v1/organizations/org-doc/commercial-documents/${id}/${action}`,
      headers: headers(token, key),
      payload: { reason: `${action} reviewed` },
    });

  const sales = {
    id: "sales-001",
    type: "sales_invoice",
    documentNumber: "SI-2026-0001",
    series: "SI",
    fiscalYear: 2026,
    partyId: "CLIENT-A",
    documentDate: "2026-01-25",
    dueDate: "2026-02-24",
    currency: "VND",
    netMinor: "100000000",
    taxMinor: "10000000",
    grossMinor: "110000000",
    controlAccountCode: "131-AR",
    lines: [
      {
        description: "Web app",
        quantity: "1",
        unitPriceMinor: "100000000",
        netMinor: "100000000",
        taxMinor: "10000000",
        grossMinor: "110000000",
        primaryAccountCode: "511-REV",
        taxAccountCode: "3331-VAT-OUT",
        taxCode: "VAT10",
        allocations: [
          { id: "S-A", amountMinor: "60000000", dimensions: { projectId: "A" } },
          { id: "S-B", amountMinor: "40000000", dimensions: { projectId: "B" } },
        ],
      },
    ],
  } as const;

  it("issues sales and posts purchase documents into exact balanced linked journals", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-doc/commercial-documents",
      headers: headers(integrationToken, "sales-create"),
      payload: sales,
    });
    expect(create.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/organizations/org-doc/commercial-documents",
          headers: headers(integrationToken, "sales-create"),
          payload: sales,
        })
      ).json().data.idempotencyReplayed,
    ).toBe(true);
    expect(
      (await command("sales-001", "validate", integrationToken, "sales-validate")).statusCode,
    ).toBe(201);
    const issued = await command("sales-001", "issue", financeToken, "sales-issue");
    expect(issued.statusCode).toBe(201);
    const salesJournal = issued.json().data.journalId as string;
    const salesTotals = await pool.query<{ debit: string; credit: string }>(
      `select coalesce(sum(debit_minor),0)::text debit,coalesce(sum(credit_minor),0)::text credit from journal_lines where organization_id='org-doc' and journal_id=$1`,
      [salesJournal],
    );
    expect(salesTotals.rows[0]).toEqual({ debit: "110000000", credit: "110000000" });

    const purchase = {
      ...sales,
      id: "purchase-001",
      type: "purchase_invoice",
      documentNumber: "INV-A-0042",
      series: undefined,
      partyId: "SUPPLIER-A",
      documentDate: "2026-01-26",
      dueDate: "2026-02-25",
      netMinor: "50000000",
      taxMinor: "5000000",
      grossMinor: "55000000",
      controlAccountCode: "331-AP",
      lines: [
        {
          description: "Subcontract",
          quantity: "1",
          unitPriceMinor: "50000000",
          netMinor: "50000000",
          taxMinor: "5000000",
          grossMinor: "55000000",
          primaryAccountCode: "632-COST",
          taxAccountCode: "1331-VAT-IN",
          taxCode: "VAT10",
          allocations: [
            {
              id: "P-A",
              amountMinor: "30000000",
              dimensions: { projectId: "A", taxState: "eligible" },
            },
            {
              id: "P-B",
              amountMinor: "20000000",
              dimensions: { projectId: "B", taxState: "eligible" },
            },
          ],
        },
      ],
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/organizations/org-doc/commercial-documents",
          headers: headers(integrationToken, "purchase-create"),
          payload: purchase,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (await command("purchase-001", "capture", integrationToken, "purchase-capture")).statusCode,
    ).toBe(201);
    expect(
      (await command("purchase-001", "verify", integrationToken, "purchase-verify")).statusCode,
    ).toBe(201);
    expect(
      (await command("purchase-001", "approve", approverToken, "purchase-approve")).statusCode,
    ).toBe(201);
    const posted = await command("purchase-001", "post", financeToken, "purchase-post");
    expect(posted.statusCode).toBe(201);
    const purchaseTotals = await pool.query<{ debit: string; credit: string }>(
      `select coalesce(sum(debit_minor),0)::text debit,coalesce(sum(credit_minor),0)::text credit from journal_lines where organization_id='org-doc' and journal_id=$1`,
      [posted.json().data.journalId],
    );
    expect(purchaseTotals.rows[0]).toEqual({ debit: "55000000", credit: "55000000" });
  });

  it("posts a bounded linked credit note and rejects cumulative overflow", async () => {
    const credit = {
      ...sales,
      id: "credit-001",
      type: "credit_note",
      documentNumber: "CN-2026-0001",
      series: "CN",
      documentDate: "2026-02-05",
      dueDate: "2026-02-05",
      netMinor: "40000000",
      taxMinor: "4000000",
      grossMinor: "44000000",
      originalDocumentId: "sales-001",
      reason: "Scope reduction",
      lines: [
        {
          originalLineNumber: 1,
          description: "Scope reduction",
          quantity: "1",
          unitPriceMinor: "40000000",
          netMinor: "40000000",
          taxMinor: "4000000",
          grossMinor: "44000000",
          primaryAccountCode: "511-REV",
          taxAccountCode: "3331-VAT-OUT",
          taxCode: "VAT10",
          allocations: [
            { id: "C-A", amountMinor: "24000000", dimensions: { projectId: "A" } },
            { id: "C-B", amountMinor: "16000000", dimensions: { projectId: "B" } },
          ],
        },
      ],
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/organizations/org-doc/commercial-documents",
          headers: headers(integrationToken, "credit-create"),
          payload: credit,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (await command("credit-001", "validate", integrationToken, "credit-validate")).statusCode,
    ).toBe(201);
    const issued = await command("credit-001", "issue", financeToken, "credit-issue");
    expect(issued.statusCode).toBe(201);
    const totals = await pool.query<{ debit: string; credit: string }>(
      `select coalesce(sum(debit_minor),0)::text debit,coalesce(sum(credit_minor),0)::text credit from journal_lines where organization_id='org-doc' and journal_id=$1`,
      [issued.json().data.journalId],
    );
    expect(totals.rows[0]).toEqual({ debit: "44000000", credit: "44000000" });
    const overflow = {
      ...credit,
      id: "credit-over",
      documentNumber: "CN-OVER",
      netMinor: "60000001",
      taxMinor: "6000000",
      grossMinor: "66000001",
      lines: [
        {
          ...credit.lines[0],
          netMinor: "60000001",
          taxMinor: "6000000",
          grossMinor: "66000001",
          unitPriceMinor: "60000001",
          allocations: [{ id: "OVER", amountMinor: "60000001", dimensions: { projectId: "A" } }],
        },
      ],
    };
    const rejected = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-doc/commercial-documents",
      headers: headers(integrationToken, "credit-over"),
      payload: overflow,
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe("CREDIT_EXCEEDS_REMAINING");
  });

  it("enforces lifecycle, organization scope, allocation totals and final immutability", async () => {
    expect(
      (await command("sales-001", "capture", integrationToken, "invalid-sales-capture")).statusCode,
    ).toBe(409);
    const mismatch = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-doc/commercial-documents",
      headers: headers(integrationToken, "bad-allocation"),
      payload: {
        ...sales,
        id: "bad",
        documentNumber: "SI-BAD",
        lines: [
          {
            ...sales.lines[0],
            allocations: [{ id: "bad", amountMinor: "999", dimensions: { projectId: "A" } }],
          },
        ],
      },
    });
    expect(mismatch.statusCode).toBe(422);
    await expect(
      pool.query(
        "update commercial_documents set gross_minor=1 where organization_id='org-doc' and id='sales-001'",
      ),
    ).rejects.toThrow();
  });
});
