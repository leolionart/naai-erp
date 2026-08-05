import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-346 expense, evidence and journal drill-down", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const integrationToken = "erp346-integration";
  const accountantToken = "erp346-accountant";
  const otherOrganizationToken = "erp346-other-accountant";

  beforeAll(async () => {
    await pool.query(`
      insert into organizations (id,legal_name,base_currency,timezone) values
        ('org-erp346','ERP-346 Org','VND','Asia/Ho_Chi_Minh'),
        ('org-erp346-other','ERP-346 Other Org','VND','Asia/Ho_Chi_Minh');
      insert into fiscal_years (organization_id,year,starts_on,ends_on)
        values ('org-erp346',2026,'2026-01-01','2026-12-31');
      insert into fiscal_periods (organization_id,fiscal_year,period_number,starts_on,ends_on)
        values ('org-erp346',2026,8,'2026-08-01','2026-08-31');
      insert into parties (organization_id,id,display_name,status)
        values ('org-erp346','SUP-346','ERP-346 Supplier','active');
      insert into accounts
        (organization_id,code,name,root_type,is_control_account,allow_manual_posting) values
        ('org-erp346','331-AP','Accounts payable','liability',true,false),
        ('org-erp346','642-OPEX','Operating expense','expense',false,true),
        ('org-erp346','1331-VAT','Deductible VAT','asset',true,false);
    `);
    const hashes = [integrationToken, accountantToken, otherOrganizationToken].map((token) =>
      createHash("sha256").update(token).digest("hex"),
    );
    await pool.query(
      `insert into api_credentials (organization_id,id,actor_id,token_hash,roles) values
       ('org-erp346','erp346-maker','erp346-maker',$1,'["integration"]'),
       ('org-erp346','erp346-accountant','erp346-accountant',$2,'["accountant","approver"]'),
       ('org-erp346-other','erp346-other','erp346-other',$3,'["accountant"]')`,
      hashes,
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const headers = (token: string, key?: string) => ({
    authorization: `Bearer ${token}`,
    ...(key ? { "idempotency-key": key } : {}),
  });

  it("posts an invoice-backed expense and drills through its accepted evidence and exact journal", async () => {
    const expenseId = "expense-erp346";
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp346/expenses",
      headers: headers(integrationToken, "erp346-expense-create"),
      payload: {
        id: expenseId,
        expenseClass: "invoice_backed",
        payeePartyId: "SUP-346",
        expenseDate: "2026-08-05",
        businessPurpose: "ERP-346 hosted service invoice",
        currency: "VND",
        netMinor: "10000000",
        vatMinor: "1000000",
        grossMinor: "11000000",
        counterAccountCode: "331-AP",
        evidenceChecklist: { invoice: true },
        lines: [
          {
            description: "Hosted service",
            netMinor: "10000000",
            vatMinor: "1000000",
            grossMinor: "11000000",
            postingAccountCode: "642-OPEX",
            vatAccountCode: "1331-VAT",
            allocations: [
              {
                id: "erp346-allocation",
                amountMinor: "10000000",
                dimensions: { costCenter: "DELIVERY" },
              },
            ],
          },
        ],
      },
    });
    expect(created.statusCode).toBe(201);

    const transition = (action: string, token: string, key: string) =>
      app.inject({
        method: "POST",
        url: `/api/v1/organizations/org-erp346/expenses/${expenseId}/${action}`,
        headers: headers(token, key),
        payload: { reason: `ERP-346 ${action}` },
      });
    expect((await transition("submit", integrationToken, "erp346-submit")).statusCode).toBe(201);

    for (const review of [
      { axis: "management", state: "valid", eligibleMinor: "0" },
      { axis: "cit", state: "eligible", eligibleMinor: "11000000" },
      { axis: "vat", state: "eligible", eligibleMinor: "1000000" },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/org-erp346/expenses/${expenseId}/review`,
        headers: headers(accountantToken, `erp346-review-${review.axis}`),
        payload: { ...review, lineNumber: 1, reason: `ERP-346 ${review.axis} review` },
      });
      expect(response.statusCode).toBe(201);
    }

    const evidence = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp346/evidence",
      headers: headers(accountantToken, "erp346-evidence-upload"),
      payload: {
        subjectType: "expense",
        subjectId: expenseId,
        evidenceType: "invoice",
        originalFilename: "erp346-invoice.pdf",
        declaredMediaType: "application/pdf",
        contentBase64: Buffer.from("%PDF-1.7\nERP-346 accepted invoice").toString("base64"),
        source: "erp-346-integration-test",
      },
    });
    expect(evidence.statusCode).toBe(201);
    const evidenceId = evidence.json().data.evidenceId as string;
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/organizations/org-erp346/evidence/${evidenceId}/review`,
          headers: headers(accountantToken, "erp346-evidence-review"),
          payload: { state: "accepted", reason: "ERP-346 invoice matched" },
        })
      ).statusCode,
    ).toBe(201);

    expect((await transition("approve", accountantToken, "erp346-approve")).statusCode).toBe(201);
    const posted = await transition("post", accountantToken, "erp346-post");
    expect(posted.statusCode).toBe(201);
    const journalId = posted.json().data.journalId as string;

    const journal = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/org-erp346/journals/${journalId}`,
      headers: headers(accountantToken),
    });
    expect(journal.statusCode).toBe(200);
    expect(journal.json().data).toMatchObject({ id: journalId, state: "posted" });
    expect(
      journal
        .json()
        .data.lines.map(
          (line: {
            account_code: string;
            debit_minor: number | null;
            credit_minor: number | null;
          }) => ({
            accountCode: line.account_code,
            debitMinor: line.debit_minor,
            creditMinor: line.credit_minor,
          }),
        ),
    ).toEqual([
      { accountCode: "642-OPEX", debitMinor: 10000000, creditMinor: null },
      { accountCode: "1331-VAT", debitMinor: 1000000, creditMinor: null },
      { accountCode: "331-AP", debitMinor: null, creditMinor: 11000000 },
    ]);

    const evidenceList = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/org-erp346/evidence?subjectType=expense&subjectId=${expenseId}`,
      headers: headers(accountantToken),
    });
    expect(evidenceList.statusCode).toBe(200);
    expect(evidenceList.json().data.items).toEqual([
      expect.objectContaining({ id: evidenceId, subject_id: expenseId, review_state: "accepted" }),
    ]);

    const authorized = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/org-erp346/evidence/${evidenceId}/download-url`,
      headers: headers(accountantToken, "erp346-evidence-download"),
      payload: { reason: "ERP-346 drill-down", expiresInSeconds: 120 },
    });
    expect(authorized.statusCode).toBe(201);
    expect(authorized.json().data).toMatchObject({ evidenceId, expiresInSeconds: 120 });

    const crossOrganizationRead = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/org-erp346/evidence/${evidenceId}`,
      headers: headers(otherOrganizationToken),
    });
    expect(crossOrganizationRead.statusCode).toBe(403);
  });
});
