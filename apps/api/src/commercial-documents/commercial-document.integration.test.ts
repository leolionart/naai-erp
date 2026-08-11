import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-300 commercial documents", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = `org-doc-${process.pid}`;
  const integrationUser = `${org}-integration-user`;
  let app: Awaited<ReturnType<typeof createApp>>;
  const integrationToken = `erp300-integration-${process.pid}`;
  const financeToken = `erp300-finance-${process.pid}`;
  const approverToken = `erp300-approver-${process.pid}`;
  beforeAll(async () => {
    await pool.query(`
      insert into organizations (id,legal_name,base_currency,timezone) values ('${org}','Document Org','VND','Asia/Ho_Chi_Minh');
      insert into fiscal_years (organization_id,year,starts_on,ends_on) values ('${org}',2026,'2026-01-01','2026-12-31');
      insert into fiscal_periods (organization_id,fiscal_year,period_number,starts_on,ends_on) values ('${org}',2026,1,'2026-01-01','2026-01-31'),('${org}',2026,2,'2026-02-01','2026-02-28');
      insert into parties (organization_id,id,display_name,status) values ('${org}','CLIENT-A','Client A','active'),('${org}','SUPPLIER-A','Supplier A','active');
      insert into users(id,email,display_name) values('${integrationUser}','${process.pid}@integration.example.com','Integration User');
      insert into organization_memberships(organization_id,user_id) values('${org}','${integrationUser}');
      insert into membership_roles(organization_id,user_id,role) values('${org}','${integrationUser}','owner');
      insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state) values
        ('${org}','A','A','Project A','CLIENT-A','${integrationUser}','fixed_fee','VND',60000000,'2026-01-01','active'),
        ('${org}','B','B','Project B','CLIENT-A','${integrationUser}','fixed_fee','VND',40000000,'2026-01-01','active');
      insert into contracts(organization_id,id,project_id,reference,signed_on,value_minor,currency) values
        ('${org}','CONTRACT-A','A','CONTRACT-A','2026-01-01',60000000,'VND'),
        ('${org}','CONTRACT-B','B','CONTRACT-B','2026-01-01',40000000,'VND'),
        ('${org}','CONTRACT-A-FUTURE','A','CONTRACT-A-FUTURE','2026-12-01',1000000,'VND');
      insert into accounts (organization_id,code,name,root_type,is_control_account,allow_manual_posting) values
       ('${org}','131-AR','AR','asset',true,false),('${org}','331-AP','AP','liability',true,false),
       ('${org}','511-REV','Revenue','revenue',false,true),('${org}','3331-VAT-OUT','VAT output','liability',true,false),
       ('${org}','632-COST','Direct cost','expense',false,true),('${org}','1331-VAT-IN','VAT input','asset',true,false);
      insert into accounts (organization_id,code,name,root_type,is_control_account,allow_manual_posting) values
       ('${org}','112-BANK','Bank','asset',false,true);
      insert into financial_accounts(organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,created_by,updated_by) values
       ('${org}','bank-vnd','BANK','bank','Bank VND','VND','112-BANK','BANK','test','test');
    `);
    const values = [integrationToken, financeToken, approverToken].map((token) =>
      createHash("sha256").update(token).digest("hex"),
    );
    await pool.query(
      `insert into api_credentials (organization_id,id,actor_id,token_hash,roles) values
      ('${org}','doc-integration','${integrationUser}',$1,'["integration"]'),
      ('${org}','doc-finance','finance-user',$2,'["finance_admin"]'),
      ('${org}','doc-approver','approver-user',$3,'["approver","accountant"]')`,
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
      url: `/api/v1/organizations/${org}/commercial-documents/${id}/${action}`,
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

  it("validates sales customer project and optional contract relationships before create", async () => {
    const linked = {
      ...sales,
      id: "sales-linked-relationships",
      documentNumber: "SI-2026-LINKED",
      netMinor: "1000",
      taxMinor: "0",
      grossMinor: "1000",
      lines: [
        {
          ...sales.lines[0],
          netMinor: "1000",
          taxMinor: "0",
          grossMinor: "1000",
          unitPriceMinor: "1000",
          taxAccountCode: undefined,
          allocations: [
            {
              id: "linked-a",
              amountMinor: "1000",
              dimensions: { projectId: "A", contractId: "CONTRACT-A" },
            },
          ],
        },
      ],
    };
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents`,
      headers: headers(integrationToken, "sales-linked-create"),
      payload: linked,
    });
    expect(created.statusCode, created.body).toBe(201);
    const listing = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/commercial-documents?projectId=A`,
      headers: { authorization: `Bearer ${integrationToken}` },
    });
    expect(
      listing.json().data.items.find((item: { id: string }) => item.id === linked.id),
    ).toMatchObject({ projectIds: ["A"], contractIds: ["CONTRACT-A"] });

    const wrongCustomer = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents`,
      headers: headers(integrationToken, "sales-wrong-customer"),
      payload: {
        ...linked,
        id: "sales-wrong-customer",
        documentNumber: "SI-2026-WRONG-CUSTOMER",
        partyId: "SUPPLIER-A",
      },
    });
    expect(wrongCustomer.statusCode, wrongCustomer.body).toBe(422);
    expect(wrongCustomer.json().error.code).toBe("PROJECT_CUSTOMER_MISMATCH");

    const wrongContract = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents`,
      headers: headers(integrationToken, "sales-wrong-contract"),
      payload: {
        ...linked,
        id: "sales-wrong-contract",
        documentNumber: "SI-2026-WRONG-CONTRACT",
        lines: linked.lines.map((line) => ({
          ...line,
          allocations: line.allocations.map((allocation) => ({
            ...allocation,
            dimensions: { projectId: "A", contractId: "CONTRACT-B" },
          })),
        })),
      },
    });
    expect(wrongContract.statusCode, wrongContract.body).toBe(422);
    expect(wrongContract.json().error.code).toBe("CONTRACT_PROJECT_MISMATCH");
  });

  it("issues sales and posts purchase documents into exact balanced linked journals", async () => {
    const create = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents`,
      headers: headers(integrationToken, "sales-create"),
      payload: sales,
    });
    expect(create.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/organizations/${org}/commercial-documents`,
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
      `select coalesce(sum(debit_minor),0)::text debit,coalesce(sum(credit_minor),0)::text credit from journal_lines where organization_id='${org}' and journal_id=$1`,
      [salesJournal],
    );
    expect(salesTotals.rows[0]).toEqual({ debit: "110000000", credit: "110000000" });

    const overCap = {
      ...sales,
      id: "sales-over-cap",
      documentNumber: "SI-2026-OVER-CAP",
      netMinor: "1",
      taxMinor: "0",
      grossMinor: "1",
      lines: [
        {
          ...sales.lines[0],
          unitPriceMinor: "1",
          netMinor: "1",
          taxMinor: "0",
          grossMinor: "1",
          taxAccountCode: undefined,
          taxCode: undefined,
          allocations: [{ id: "OVER-A", amountMinor: "1", dimensions: { projectId: "A" } }],
        },
      ],
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/organizations/${org}/commercial-documents`,
          headers: headers(integrationToken, "sales-over-cap-create"),
          payload: overCap,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (await command("sales-over-cap", "validate", integrationToken, "sales-over-cap-validate"))
        .statusCode,
    ).toBe(201);
    const rejectedOverCap = await command(
      "sales-over-cap",
      "issue",
      financeToken,
      "sales-over-cap-issue",
    );
    expect(rejectedOverCap.statusCode, rejectedOverCap.body).toBe(409);
    expect(rejectedOverCap.json().error.code).toBe("SALES_INVOICE_CONTRACT_CAP_EXCEEDED");
    expect(
      (
        await pool.query<{ n: number }>(
          `select count(*)::int n from journal_entries where organization_id='${org}' and description like '%sales-over-cap%'`,
        )
      ).rows[0]?.n,
    ).toBe(0);

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
      fundingSource: { type: "financial_account", financialAccountId: "bank-vnd" },
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
              dimensions: { projectId: "B", taxState: "ineligible" },
            },
          ],
        },
      ],
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/organizations/${org}/commercial-documents`,
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
    expect(posted.json().data.state).toBe("paid");
    const purchaseTotals = await pool.query<{ debit: string; credit: string }>(
      `select coalesce(sum(debit_minor),0)::text debit,coalesce(sum(credit_minor),0)::text credit from journal_lines where organization_id='${org}' and journal_id=$1`,
      [posted.json().data.journalId],
    );
    expect(purchaseTotals.rows[0]).toEqual({ debit: "55000000", credit: "55000000" });
    const purchaseAccounts = await pool.query<{ account_code: string; debit: string }>(
      `select account_code,coalesce(sum(debit_minor),0)::text debit
       from journal_lines where organization_id='${org}' and journal_id=$1 and debit_minor is not null
       group by account_code order by account_code`,
      [posted.json().data.journalId],
    );
    expect(purchaseAccounts.rows).toEqual([
      { account_code: "1331-VAT-IN", debit: "3000000" },
      { account_code: "632-COST", debit: "52000000" },
    ]);
    const purchaseCredits = await pool.query<{ account_code: string; credit: string }>(
      `select account_code,credit_minor::text credit from journal_lines
       where organization_id=$1 and journal_id=$2 and credit_minor is not null`,
      [org, posted.json().data.journalId],
    );
    expect(purchaseCredits.rows).toEqual([{ account_code: "112-BANK", credit: "55000000" }]);
    expect(purchaseCredits.rows.some((row) => row.account_code === "331-AP")).toBe(false);
  });

  it("persists owner-final CIT and VAT decisions for a documented purchase invoice", async () => {
    await pool.query(
      `insert into accounting_workflow_policies
       (organization_id,operating_mode,allow_self_approval,self_approval_max_minor,soft_lock_posting_roles,updated_by)
       values($1,'solopreneur',false,null,'["owner","finance_admin"]','owner-final-test')
       on conflict(organization_id) do update set operating_mode='solopreneur',updated_by='owner-final-test',updated_at=now()`,
      [org],
    );
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents`,
      headers: headers(integrationToken, "owner-final-purchase-create"),
      payload: {
        ...sales,
        id: "purchase-owner-final",
        type: "purchase_invoice",
        documentNumber: "INV-OWNER-FINAL",
        series: undefined,
        partyId: "SUPPLIER-A",
        controlAccountCode: "331-AP",
        netMinor: "1000",
        taxMinor: "100",
        grossMinor: "1100",
        lines: [
          {
            description: "Documented operating cost",
            quantity: "1",
            unitPriceMinor: "1000",
            netMinor: "1000",
            taxMinor: "100",
            grossMinor: "1100",
            primaryAccountCode: "632-COST",
            taxAccountCode: "1331-VAT-IN",
            taxCode: "VAT10",
            allocations: [
              { id: "owner-final-a", amountMinor: "1000", dimensions: { projectId: "A" } },
            ],
          },
        ],
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    const persisted = await pool.query(
      `select management_state::text,cit_state::text,vat_state::text,
              cit_eligible_minor::text,vat_eligible_minor::text,reviewed_by,review_reason,review_reference
         from commercial_document_lines
        where organization_id=$1 and document_id='purchase-owner-final' and line_number=1`,
      [org],
    );
    expect(persisted.rows[0]).toEqual({
      management_state: "valid",
      cit_state: "eligible",
      vat_state: "eligible",
      cit_eligible_minor: "1000",
      vat_eligible_minor: "100",
      reviewed_by: integrationUser,
      review_reason: "Resolved when the purchase invoice was recorded",
      review_reference: "solopreneur_policy",
    });
    expect(
      (
        await command(
          "purchase-owner-final",
          "capture",
          integrationToken,
          "owner-final-purchase-capture",
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await command(
          "purchase-owner-final",
          "verify",
          integrationToken,
          "owner-final-purchase-verify",
        )
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await command(
          "purchase-owner-final",
          "approve",
          approverToken,
          "owner-final-purchase-approve",
        )
      ).statusCode,
    ).toBe(201);
    const posted = await command(
      "purchase-owner-final",
      "post",
      financeToken,
      "owner-final-purchase-post",
    );
    expect(posted.statusCode, posted.body).toBe(201);
    const vatPosting = await pool.query<{ debit_minor: string }>(
      `select debit_minor::text from journal_lines
        where organization_id=$1 and journal_id=$2 and account_code='1331-VAT-IN'`,
      [org, posted.json().data.journalId],
    );
    expect(vatPosting.rows).toEqual([{ debit_minor: "100" }]);
    await pool.query(
      "update accounting_workflow_policies set operating_mode='controlled' where organization_id=$1",
      [org],
    );
  });

  it("filters documents by project allocation without leaking sibling projects", async () => {
    const projectA = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/commercial-documents?projectId=A`,
      headers: { authorization: `Bearer ${financeToken}` },
    });
    expect(projectA.statusCode, projectA.body).toBe(200);
    expect(
      projectA
        .json()
        .data.items.map((item: { id: string }) => item.id)
        .sort(),
    ).toEqual([
      "purchase-001",
      "purchase-owner-final",
      "sales-001",
      "sales-linked-relationships",
      "sales-over-cap",
    ]);
    expect(
      projectA
        .json()
        .data.items.map((item: { id: string; document_date: string; due_date: string }) => ({
          id: item.id,
          documentDate: item.document_date,
          dueDate: item.due_date,
        })),
    ).toEqual(
      expect.arrayContaining([
        { id: "sales-001", documentDate: "2026-01-25", dueDate: "2026-02-24" },
        { id: "purchase-001", documentDate: "2026-01-26", dueDate: "2026-02-25" },
      ]),
    );

    const party = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/commercial-documents?partyId=CLIENT-A`,
      headers: { authorization: `Bearer ${financeToken}` },
    });
    expect(party.statusCode, party.body).toBe(200);
    expect(party.json().data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "sales-001",
          document_date: "2026-01-25",
          due_date: "2026-02-24",
        }),
      ]),
    );

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/commercial-documents/sales-001`,
      headers: { authorization: `Bearer ${financeToken}` },
    });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().data).toEqual(
      expect.objectContaining({
        document_date: "2026-01-25",
        due_date: "2026-02-24",
      }),
    );

    const unrelated = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/commercial-documents?projectId=UNRELATED`,
      headers: { authorization: `Bearer ${financeToken}` },
    });
    expect(unrelated.statusCode, unrelated.body).toBe(200);
    expect(unrelated.json().data.items).toEqual([]);
  });

  it("bypasses expense duplicate protection only for an exact migration source", async () => {
    await pool.query(`
      insert into expenses
        (organization_id,id,expense_class,payee_party_id,expense_date,business_purpose,currency,
         net_minor,vat_minor,gross_minor,counter_account_code,state,created_by)
      values
        ('${org}','legacy-expense-1','invoice_backed','SUPPLIER-A','2026-01-27','Legacy invoice',
         'VND',900,100,1000,'632-COST','posted','${integrationUser}')
    `);
    const payload = {
      type: "purchase_invoice",
      documentNumber: "WB-CP-1",
      fiscalYear: 2026,
      partyId: "SUPPLIER-A",
      documentDate: "2026-01-27",
      dueDate: "2026-01-27",
      currency: "VND",
      netMinor: "900",
      taxMinor: "100",
      grossMinor: "1000",
      controlAccountCode: "331-AP",
      migrationSourceExpenseId: "legacy-expense-1",
      migrationSourceExpenseDate: "2026-01-27",
      externalReference: {
        system: "workbook",
        externalId: "chi-phi:1",
        metadata: { migrationSourceExpenseId: "legacy-expense-1" },
      },
      lines: [
        {
          description: "Legacy invoice",
          quantity: "1",
          unitPriceMinor: "900",
          netMinor: "900",
          taxMinor: "100",
          grossMinor: "1000",
          primaryAccountCode: "632-COST",
          taxAccountCode: "1331-VAT-IN",
          allocations: [
            {
              id: "legacy-allocation-1",
              amountMinor: "900",
              dimensions: { taxState: "ineligible" },
            },
          ],
        },
      ],
    };
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents`,
      headers: headers(integrationToken, "migration-exact-create"),
      payload,
    });
    expect(created.statusCode, created.body).toBe(201);
    const audit = await pool.query<{ after_state: Record<string, unknown> }>(
      `select after_state from resource_audit_events
       where organization_id='${org}' and resource_type='commercial_document'
         and resource_key=$1 and action='create'`,
      [created.json().data.documentId],
    );
    expect(audit.rows[0]?.after_state).toMatchObject({
      migrationSourceExpenseId: "legacy-expense-1",
      migrationSourceExpenseDate: "2026-01-27",
    });

    const mismatch = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents`,
      headers: headers(integrationToken, "migration-mismatch-create"),
      payload: {
        ...payload,
        documentNumber: "WB-CP-2",
        taxMinor: "101",
        grossMinor: "1001",
        externalReference: {
          ...payload.externalReference,
          externalId: "chi-phi:2",
        },
        lines: [
          {
            ...payload.lines[0],
            grossMinor: "1001",
            taxMinor: "101",
          },
        ],
      },
    });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.body).toContain("MIGRATION_SOURCE_EXPENSE_MISMATCH");
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
          url: `/api/v1/organizations/${org}/commercial-documents`,
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
      `select coalesce(sum(debit_minor),0)::text debit,coalesce(sum(credit_minor),0)::text credit from journal_lines where organization_id='${org}' and journal_id=$1`,
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
      url: `/api/v1/organizations/${org}/commercial-documents`,
      headers: headers(integrationToken, "credit-over"),
      payload: overflow,
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe("CREDIT_EXCEEDS_REMAINING");
  });

  it("dry-runs and commits an idempotent relationship backfill through reverse replacement", async () => {
    await pool.query(
      `insert into contracts(organization_id,id,project_id,reference,signed_on,value_minor,currency)
       values($1,'CONTRACT-A-BACKFILL','A','CONTRACT-A-BACKFILL','2026-01-01',30000000,'VND')`,
      [org],
    );
    const original = {
      ...sales,
      id: "sales-relationship-backfill",
      documentNumber: "SI-REL-BACKFILL",
      netMinor: "1000",
      taxMinor: "0",
      grossMinor: "1000",
      externalReference: { system: "relationship-test", externalId: "sales-backfill-1" },
      lines: [
        {
          ...sales.lines[0],
          unitPriceMinor: "1000",
          netMinor: "1000",
          taxMinor: "0",
          grossMinor: "1000",
          taxAccountCode: undefined,
          allocations: [{ id: "backfill-a", amountMinor: "1000", dimensions: { projectId: "A" } }],
        },
      ],
    };
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents`,
      headers: headers(integrationToken, "relationship-original-create"),
      payload: original,
    });
    expect(created.statusCode, created.body).toBe(201);
    await command(original.id, "validate", integrationToken, "relationship-original-validate");
    expect(
      (await command(original.id, "issue", financeToken, "relationship-original-issue")).statusCode,
    ).toBe(201);
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/commercial-documents/${original.id}`,
      headers: { authorization: `Bearer ${financeToken}` },
    });
    const replacement = {
      ...original,
      id: "sales-relationship-backfill-r1",
      lines: original.lines.map((line) => ({
        ...line,
        allocations: line.allocations.map((allocation) => ({
          ...allocation,
          dimensions: { projectId: "A", contractId: "CONTRACT-A-BACKFILL" },
        })),
      })),
    };
    const body = { replacement, reason: "Explicit reviewed contract mapping" };
    const dryRun = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents/${original.id}/relationship-backfill/dry-run`,
      headers: { authorization: `Bearer ${financeToken}`, "if-match": detail.json().data.version },
      payload: body,
    });
    expect(dryRun.statusCode, dryRun.body).toBe(201);
    const commitRequest = () =>
      app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/commercial-documents/${original.id}/relationship-backfill/commit`,
        headers: {
          ...headers(financeToken, "relationship-backfill-commit"),
          "if-match": detail.json().data.version,
        },
        payload: { ...body, planHash: dryRun.json().data.planHash },
      });
    const committed = await commitRequest();
    expect(committed.statusCode, committed.body).toBe(201);
    expect(committed.json().data).toMatchObject({
      state: "cancelled",
      replacementDocumentId: replacement.id,
      idempotencyReplayed: false,
    });
    expect((await commitRequest()).json().data.idempotencyReplayed).toBe(true);
    const replacementDetail = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${org}/commercial-documents/${replacement.id}`,
      headers: { authorization: `Bearer ${financeToken}` },
    });
    expect(replacementDetail.json().data).toMatchObject({
      document_number: original.documentNumber,
      state: "draft",
      externalReference: expect.objectContaining({ externalId: "sales-backfill-1" }),
    });
  });

  it("enforces lifecycle, organization scope, allocation totals and final immutability", async () => {
    expect(
      (await command("sales-001", "capture", integrationToken, "invalid-sales-capture")).statusCode,
    ).toBe(409);
    const mismatch = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents`,
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
        `update commercial_documents set gross_minor=1 where organization_id='${org}' and id='sales-001'`,
      ),
    ).rejects.toThrow();
  });
});
