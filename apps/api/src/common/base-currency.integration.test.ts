import { createHash, createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("T-INT-CUR-002 reject non-base-currency postings with clear error", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = `org-cur-${randomUUID().slice(0, 8)}`;
  const ownerToken = `cur-owner-${org}`;
  const webhookPublicId = `pub-${org}`;
  const webhookSecret = "erp985-webhook-secret";
  let app: Awaited<ReturnType<typeof createApp>>;

  const authHeaders = (key?: string) => ({
    authorization: `Bearer ${ownerToken}`,
    ...(key ? { "idempotency-key": key } : {}),
  });

  const signWebhook = (body: Record<string, unknown>, key: string) => {
    const raw = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `sha256=${createHmac("sha256", webhookSecret)
      .update(`${timestamp}.${raw}`)
      .digest("hex")}`;
    return {
      raw,
      headers: {
        "content-type": "application/json",
        "x-naai-timestamp": timestamp,
        "x-naai-signature": signature,
        "idempotency-key": key,
      },
    };
  };

  const expectForeignCurrencyRejected = (res: {
    statusCode: number;
    body: string;
    json: () => unknown;
  }) => {
    expect(res.statusCode, res.body).toBe(422);
    const parsed = res.json() as {
      error: { code: string; message: string; details?: { guidance?: string } };
    };
    expect(parsed.error.code).toBe("FOREIGN_CURRENCY_NOT_SUPPORTED");
    const combined = `${parsed.error.message} ${parsed.error.details?.guidance ?? ""}`;
    expect(combined).toContain("quy đổi sang VND trước khi nhập, ghi tỷ giá vào mô tả");
  };

  beforeAll(async () => {
    process.env.ERP985_WEBHOOK_SECRET = webhookSecret;
    const ownerId = `owner-${org}`;
    const tokenHash = createHash("sha256").update(ownerToken).digest("hex");
    await pool.query(`
      insert into organizations(id,legal_name,base_currency,timezone) values('${org}','ERP 985 Org','VND','Asia/Ho_Chi_Minh');
      insert into users(id,email,display_name) values('${ownerId}','${ownerId}@example.com','ERP 985 Owner') on conflict (id) do nothing;
      insert into organization_memberships(organization_id,user_id) values('${org}','${ownerId}');
      insert into accounting_workflow_policies(organization_id,allow_self_approval,self_approval_max_minor,operating_mode,updated_by) values('${org}',false,null,'solopreneur','${ownerId}');
      insert into fiscal_years(organization_id,year,starts_on,ends_on) values('${org}',2026,'2026-01-01','2026-12-31');
      insert into fiscal_periods(organization_id,fiscal_year,period_number,starts_on,ends_on,state) values('${org}',2026,8,'2026-08-01','2026-08-31','open');
      insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting) values
        ('${org}','111','Cash','asset',false,true),('${org}','131','AR','asset',true,false),
        ('${org}','331','AP','liability',true,false),('${org}','3388-OWNER','Owner Current','liability',false,true),
        ('${org}','511','Service Revenue','revenue',false,true),('${org}','642','Operating Expense','expense',false,true),
        ('${org}','632','Direct Cost','expense',false,true),('${org}','1331','VAT Input','asset',false,true),
        ('${org}','3331','VAT Output','liability',false,true);
      insert into parties(organization_id,id,display_name,status) values ('${org}','client-1','Client One','active'),('${org}','supplier-1','Supplier One','active');
      insert into party_roles(organization_id,party_id,role) values ('${org}','client-1','client'),('${org}','supplier-1','supplier');
      insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state)
        values('${org}','proj-1','PRJ1','Main Project','client-1','${ownerId}','fixed_fee','VND',100000000,'2026-01-01','active');
      insert into contracts(organization_id,id,project_id,reference,signed_on,value_minor,currency)
        values('${org}','contract-1','proj-1','PRJ1-C','2026-01-01',100000000,'VND');
      insert into expense_categories(organization_id,code,name,funding_treatment,created_by,updated_by)
        values('${org}','HOSTING','Cloud Hosting','owner_paid_company_cost','${ownerId}','${ownerId}');
      insert into financial_statement_mapping_versions(organization_id,id,version,framework,state,effective_from,change_reason,created_by,approved_by,approved_at)
        values('${org}','map-1',1,'TT133','approved','2026-01-01','Baseline','${ownerId}','${ownerId}',now());
      insert into financial_statement_mapping_lines(organization_id,mapping_id,mapping_version,line_number,statement,line_code,label,account_code,display_order,sign) values
        ('${org}','map-1',1,1,'balance_sheet','owner_current','Owner Current','3388-OWNER',1,1);
      insert into integration_sources(organization_id,id,public_id,name,actor_id,secret_ref,allowed_event_types,created_by)
        values('${org}','src-1','${webhookPublicId}','n8n Source','n8n-bot','ERP985_WEBHOOK_SECRET','["expense.create","sales_invoice.create","purchase_invoice.create"]','${ownerId}');
      insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values('${org}','cred-owner','${ownerId}','${tokenHash}','["owner","finance_admin","accountant"]');
      insert into commercial_documents(organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,created_by)
        values('${org}','hist-usd-issued','sales_invoice','issued','HIST-USD-1','SI',2026,'client-1','2026-08-02','2026-08-15','USD',50000,0,50000,'131','${ownerId}');
    `);

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    delete process.env.ERP985_WEBHOOK_SECRET;
    await app?.close();
    await pool.end();
  });

  it("rejects non-base-currency commercial documents and quick ingestion while accepting VND", async () => {
    const usdDoc = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents`,
      headers: authHeaders("doc-usd-1"),
      payload: {
        id: "doc-usd-rejected",
        type: "sales_invoice",
        documentNumber: "SI-USD-01",
        series: "SI",
        fiscalYear: 2026,
        partyId: "client-1",
        documentDate: "2026-08-10",
        dueDate: "2026-08-20",
        currency: "USD",
        netMinor: "100000",
        taxMinor: "0",
        grossMinor: "100000",
        controlAccountCode: "131",
        lines: [
          {
            description: "USD consulting",
            quantity: "1",
            unitPriceMinor: "100000",
            netMinor: "100000",
            taxMinor: "0",
            grossMinor: "100000",
            primaryAccountCode: "511",
            allocations: [{ id: "a1", amountMinor: "100000", dimensions: { projectId: "proj-1" } }],
          },
        ],
      },
    });
    expectForeignCurrencyRejected(usdDoc);

    const quickUsd = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents/purchase-invoice-ingestion`,
      headers: authHeaders("qp-usd-1"),
      payload: {
        supplierTaxId: "0312345678",
        supplierName: "AWS Singapore",
        documentNumber: "AWS-USD-01",
        documentDate: "2026-08-10",
        category: "HOSTING",
        description: "AWS cloud bill",
        grossMinor: "25000",
        currency: "USD",
      },
    });
    expectForeignCurrencyRejected(quickUsd);

    const leakedParty = await pool.query(
      `select count(*)::int count from parties where organization_id=$1 and normalized_tax_id='0312345678'`,
      [org],
    );
    expect(leakedParty.rows[0].count).toBe(0);

    const vndDoc = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents`,
      headers: authHeaders("doc-vnd-1"),
      payload: {
        id: "doc-vnd-ok",
        type: "sales_invoice",
        documentNumber: "SI-VND-01",
        series: "SI",
        fiscalYear: 2026,
        partyId: "client-1",
        documentDate: "2026-08-10",
        dueDate: "2026-08-20",
        currency: "VND",
        netMinor: "2500000",
        taxMinor: "0",
        grossMinor: "2500000",
        controlAccountCode: "131",
        lines: [
          {
            description: "VND consulting (100 USD @ 25,000)",
            quantity: "1",
            unitPriceMinor: "2500000",
            netMinor: "2500000",
            taxMinor: "0",
            grossMinor: "2500000",
            primaryAccountCode: "511",
            allocations: [
              { id: "a1", amountMinor: "2500000", dimensions: { projectId: "proj-1" } },
            ],
          },
        ],
      },
    });
    expect(vndDoc.statusCode, vndDoc.body).toBe(201);
  });

  it("rejects non-base-currency expenses and journals while accepting VND", async () => {
    const usdExp = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/expenses`,
      headers: authHeaders("exp-usd-1"),
      payload: {
        id: "exp-usd-rejected",
        expenseClass: "non_documented",
        expenseDate: "2026-08-11",
        businessPurpose: "USD SaaS tool",
        currency: "EUR",
        netMinor: "5000",
        vatMinor: "0",
        grossMinor: "5000",
        counterAccountCode: "3388-OWNER",
        lines: [
          {
            description: "SaaS",
            netMinor: "5000",
            vatMinor: "0",
            grossMinor: "5000",
            postingAccountCode: "642",
            allocations: [{ id: "a1", amountMinor: "5000", dimensions: { costCenter: "ADMIN" } }],
          },
        ],
      },
    });
    expectForeignCurrencyRejected(usdExp);

    const vndExp = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/expenses`,
      headers: authHeaders("exp-vnd-1"),
      payload: {
        id: "exp-vnd-ok",
        expenseClass: "non_documented",
        expenseDate: "2026-08-11",
        businessPurpose: "VND SaaS tool (200 EUR @ 27,500)",
        currency: "VND",
        netMinor: "5500000",
        vatMinor: "0",
        grossMinor: "5500000",
        counterAccountCode: "3388-OWNER",
        lines: [
          {
            description: "SaaS converted to VND",
            netMinor: "5500000",
            vatMinor: "0",
            grossMinor: "5500000",
            postingAccountCode: "642",
            allocations: [
              { id: "a1", amountMinor: "5500000", dimensions: { costCenter: "ADMIN" } },
            ],
          },
        ],
      },
    });
    expect(vndExp.statusCode, vndExp.body).toBe(201);

    const usdJournal = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/journals`,
      headers: authHeaders("j-usd-1"),
      payload: {
        id: "j-usd-rejected",
        journalDate: "2026-08-12",
        description: "USD manual entry",
        currency: "USD",
        lines: [
          { accountCode: "642", debitMinor: "1000" },
          { accountCode: "111", creditMinor: "1000" },
        ],
      },
    });
    expectForeignCurrencyRejected(usdJournal);

    const vndJournal = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/journals`,
      headers: authHeaders("j-vnd-1"),
      payload: {
        id: "j-vnd-ok",
        journalDate: "2026-08-12",
        description: "VND manual entry",
        currency: "VND",
        lines: [
          { accountCode: "642", debitMinor: "100000" },
          { accountCode: "111", creditMinor: "100000" },
        ],
      },
    });
    expect(vndJournal.statusCode, vndJournal.body).toBe(201);
  });

  it("rejects non-base-currency workbook imports on both dry-run and commit while accepting VND", async () => {
    const baseWorkbook = {
      mappingVersion: 1 as const,
      sources: [{ kind: "finance" as const, sha256: "erp985-wb-sha", filename: "wb.xlsx" }],
      inventory: [
        {
          workbook: "finance",
          sheet: "Doanh thu",
          rowCount: 2,
          dataRowCount: 1,
          formulaCellCount: 0,
          disposition: "sales" as const,
        },
      ],
      issues: [],
      controls: [],
      varianceRules: [],
      parties: [
        {
          id: "client-1",
          displayName: "Client One",
          normalizedTaxId: null,
          status: "active" as const,
          roles: ["client"],
        },
      ],
      projects: [],
      salesInvoices: [
        {
          id: "wb-inv-1",
          documentNumber: "WB-01",
          partyId: "client-1",
          documentDate: "2026-08-15",
          dueDate: "2026-08-15",
          currency: "USD",
          netMinor: "1000",
          taxMinor: "0",
          grossMinor: "1000",
          controlAccountCode: "131",
          sourceRowIndex: 2,
          sourceIdentity: "erp985-wb-sha:Doanh thu:2",
        },
      ],
      expenses: [],
    };

    const dryRunUsd = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/workbook-imports/dry-run`,
      headers: authHeaders(),
      payload: baseWorkbook,
    });
    expectForeignCurrencyRejected(dryRunUsd);

    const commitUsd = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/workbook-imports/commit`,
      headers: authHeaders(),
      payload: baseWorkbook,
    });
    expectForeignCurrencyRejected(commitUsd);

    const dryRunVnd = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/workbook-imports/dry-run`,
      headers: authHeaders(),
      payload: {
        ...baseWorkbook,
        salesInvoices: [{ ...baseWorkbook.salesInvoices[0], currency: "VND" }],
      },
    });
    expect(dryRunVnd.statusCode, dryRunVnd.body).toBe(201);
    expect(dryRunVnd.json().data.valid).toBe(true);
  });

  it("rejects non-base-currency inbound webhooks with 422 and preserves historical BR-STAT-001 warning", async () => {
    const webhookBody = {
      schemaVersion: 1,
      eventType: "expense.create",
      externalId: "ext-hook-fx-1",
      occurredAt: "2026-08-15T10:00:00Z",
      data: {
        id: "hook-exp-fx-1",
        expenseClass: "non_documented",
        expenseDate: "2026-08-15",
        businessPurpose: "Webhook FX test",
        currency: "USD",
        netMinor: "3000",
        vatMinor: "0",
        grossMinor: "3000",
        counterAccountCode: "111",
        lines: [
          {
            description: "Webhook FX line",
            netMinor: "3000",
            vatMinor: "0",
            grossMinor: "3000",
            postingAccountCode: "642",
            allocations: [{ id: "a1", amountMinor: "3000", dimensions: { costCenter: "ADMIN" } }],
          },
        ],
      },
    };
    const signedUsd = signWebhook(webhookBody, "hook-fx-key-1");
    const hookUsdRes = await app.inject({
      method: "POST",
      url: `/api/v1/inbound/${webhookPublicId}/events`,
      headers: signedUsd.headers,
      payload: signedUsd.raw,
    });
    expectForeignCurrencyRejected(hookUsdRes);

    // Converting the same externalId to VND succeeds cleanly without external_id conflict
    const signedVnd = signWebhook(
      {
        ...webhookBody,
        data: {
          ...webhookBody.data,
          currency: "VND",
          netMinor: "75000000",
          grossMinor: "75000000",
          lines: [
            {
              ...webhookBody.data.lines[0],
              netMinor: "75000000",
              grossMinor: "75000000",
              allocations: [
                { id: "a1", amountMinor: "75000000", dimensions: { costCenter: "ADMIN" } },
              ],
            },
          ],
        },
      },
      "hook-fx-key-2",
    );
    const hookVndRes = await app.inject({
      method: "POST",
      url: `/api/v1/inbound/${webhookPublicId}/events`,
      headers: signedVnd.headers,
      payload: signedVnd.raw,
    });
    expect(hookVndRes.statusCode, hookVndRes.body).toBe(201);
    expect(hookVndRes.json().data.state).toBe("processed");

    // Historical USD row remains untouched and continues to raise BR-STAT-001 warning
    const histCheck = await pool.query(
      `select currency, gross_minor::text from commercial_documents where organization_id=$1 and id='hist-usd-issued'`,
      [org],
    );
    expect(histCheck.rows[0]).toEqual({ currency: "USD", gross_minor: "50000" });

    const dash = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/reports/operating-dashboard?asOf=2026-08-31&startsOn=2026-08-01&endsOn=2026-08-31`,
      headers: authHeaders(),
    });
    expect(dash.statusCode, dash.body).toBe(200);
    expect(dash.json().data.financials.configurationWarnings).toContain(
      "foreign_currency_excluded_from_totals",
    );
  });
});
