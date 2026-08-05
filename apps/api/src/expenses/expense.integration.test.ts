import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-310 expense workflow", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const integrationToken = "erp310-integration";
  const accountantToken = "erp310-accountant";

  beforeAll(async () => {
    await pool.query(`
      insert into organizations (id,legal_name,base_currency,timezone)
      values ('org-exp','Expense Org','VND','Asia/Ho_Chi_Minh');
      insert into fiscal_years (organization_id,year,starts_on,ends_on)
      values ('org-exp',2026,'2026-01-01','2026-12-31');
      insert into fiscal_periods (organization_id,fiscal_year,period_number,starts_on,ends_on)
      values ('org-exp',2026,8,'2026-08-01','2026-08-31');
      insert into parties (organization_id,id,display_name,status)
      values ('org-exp','EMP-01','Employee One','active'),
             ('org-exp','SUP-01','Supplier One','active');
      insert into accounts (organization_id,code,name,root_type,is_control_account,allow_manual_posting)
      values ('org-exp','111-CASH','Petty cash','asset',true,false),
             ('org-exp','331-AP','Accounts payable','liability',true,false),
             ('org-exp','334-EMP','Employee payable','liability',true,false),
             ('org-exp','642-OPEX','Operating expense','expense',false,true),
             ('org-exp','1331-VAT','Deductible VAT','asset',true,false);
    `);
    const hashes = [integrationToken, accountantToken].map((token) =>
      createHash("sha256").update(token).digest("hex"),
    );
    await pool.query(
      `insert into api_credentials (organization_id,id,actor_id,token_hash,roles) values
       ('org-exp','exp-integration','maker',$1,'["integration"]'),
       ('org-exp','exp-accountant','accountant',$2,'["accountant","approver"]')`,
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

  const headers = (token: string, key: string) => ({
    authorization: `Bearer ${token}`,
    "idempotency-key": key,
  });
  const command = (id: string, action: string, token: string, key: string) =>
    app.inject({
      method: "POST",
      url: `/api/v1/organizations/org-exp/expenses/${id}/${action}`,
      headers: headers(token, key),
      payload: { reason: `${action} reviewed` },
    });
  const review = (
    id: string,
    axis: "management" | "cit" | "vat",
    state: string,
    eligibleMinor: string,
    key: string,
  ) =>
    app.inject({
      method: "POST",
      url: `/api/v1/organizations/org-exp/expenses/${id}/review`,
      headers: headers(accountantToken, key),
      payload: { axis, lineNumber: 1, state, eligibleMinor, reason: `${axis} review` },
    });

  it("books and posts a non-invoice expense while keeping CIT and VAT ineligible", async () => {
    const input = {
      id: "expense-no-invoice",
      expenseClass: "non_documented",
      expenseDate: "2026-08-05",
      businessPurpose: "Office supplies paid from petty cash",
      currency: "VND",
      netMinor: "3000000",
      vatMinor: "0",
      grossMinor: "3000000",
      counterAccountCode: "111-CASH",
      lines: [
        {
          description: "Office supplies",
          netMinor: "3000000",
          vatMinor: "0",
          grossMinor: "3000000",
          postingAccountCode: "642-OPEX",
          allocations: [
            { id: "office", amountMinor: "3000000", dimensions: { costCenter: "ADMIN" } },
          ],
        },
      ],
    };
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-exp/expenses",
      headers: headers(integrationToken, "no-invoice-create"),
      payload: input,
    });
    expect(created.statusCode).toBe(201);
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-exp/expenses",
      headers: headers(integrationToken, "no-invoice-create"),
      payload: input,
    });
    expect(replay.json().data.idempotencyReplayed).toBe(true);
    expect(
      (await command(input.id, "submit", integrationToken, "no-invoice-submit")).statusCode,
    ).toBe(201);
    expect((await review(input.id, "management", "valid", "0", "no-invoice-mgmt")).statusCode).toBe(
      201,
    );
    expect((await review(input.id, "cit", "ineligible", "0", "no-invoice-cit")).statusCode).toBe(
      201,
    );
    expect((await review(input.id, "vat", "ineligible", "0", "no-invoice-vat")).statusCode).toBe(
      201,
    );
    expect(
      (await command(input.id, "approve", accountantToken, "no-invoice-approve")).statusCode,
    ).toBe(201);
    const posted = await command(input.id, "post", accountantToken, "no-invoice-post");
    expect(posted.statusCode).toBe(201);
    const journalId = posted.json().data.journalId as string;
    const lines = await pool.query<{
      account_code: string;
      debit_minor: string | null;
      credit_minor: string | null;
    }>(
      `select account_code,debit_minor::text,credit_minor::text from journal_lines
       where organization_id='org-exp' and journal_id=$1 order by line_number`,
      [journalId],
    );
    expect(lines.rows).toEqual([
      { account_code: "642-OPEX", debit_minor: "3000000", credit_minor: null },
      { account_code: "111-CASH", debit_minor: null, credit_minor: "3000000" },
    ]);
    await expect(
      pool.query(
        "update expense_lines set gross_minor=1 where organization_id='org-exp' and expense_id=$1 and line_number=1",
        [input.id],
      ),
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("posts eligible VAT separately, capitalizes ineligible VAT and uses employee payable", async () => {
    const cases = [
      {
        id: "expense-invoice",
        expenseClass: "invoice_backed",
        payeePartyId: "SUP-01",
        counterAccountCode: "331-AP",
        netMinor: "10000000",
        vatMinor: "1000000",
        grossMinor: "11000000",
        vatState: "eligible",
        vatEligibleMinor: "1000000",
        evidenceChecklist: { invoice: true },
      },
      {
        id: "expense-reimbursement",
        expenseClass: "employee_reimbursement",
        employeePartyId: "EMP-01",
        counterAccountCode: "334-EMP",
        netMinor: "5000000",
        vatMinor: "500000",
        grossMinor: "5500000",
        vatState: "ineligible",
        vatEligibleMinor: "0",
        evidenceChecklist: {},
      },
    ] as const;
    for (const item of cases) {
      const payload = {
        ...item,
        expenseDate: "2026-08-06",
        businessPurpose: item.id,
        currency: "VND",
        lines: [
          {
            description: item.id,
            netMinor: item.netMinor,
            vatMinor: item.vatMinor,
            grossMinor: item.grossMinor,
            postingAccountCode: "642-OPEX",
            vatAccountCode: "1331-VAT",
            allocations: [
              { id: `${item.id}-a`, amountMinor: item.netMinor, dimensions: { projectId: "A" } },
            ],
          },
        ],
      };
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/organizations/org-exp/expenses",
            headers: headers(integrationToken, `${item.id}-create`),
            payload,
          })
        ).statusCode,
      ).toBe(201);
      expect(
        (await command(item.id, "submit", integrationToken, `${item.id}-submit`)).statusCode,
      ).toBe(201);
      await review(item.id, "management", "valid", "0", `${item.id}-mgmt`);
      await review(item.id, "cit", "eligible", item.grossMinor, `${item.id}-cit`);
      await review(item.id, "vat", item.vatState, item.vatEligibleMinor, `${item.id}-vat`);
      if (item.expenseClass === "invoice_backed") {
        const evidence = await app.inject({
          method: "POST",
          url: "/api/v1/organizations/org-exp/evidence",
          headers: headers(accountantToken, `${item.id}-evidence`),
          payload: {
            subjectType: "expense",
            subjectId: item.id,
            evidenceType: "invoice",
            originalFilename: "invoice.pdf",
            declaredMediaType: "application/pdf",
            contentBase64: Buffer.from("%PDF-1.7\ninvoice fixture").toString("base64"),
            source: "integration-test",
          },
        });
        const evidenceId = evidence.json().data.evidenceId as string;
        expect(
          (
            await app.inject({
              method: "POST",
              url: `/api/v1/organizations/org-exp/evidence/${evidenceId}/review`,
              headers: headers(accountantToken, `${item.id}-evidence-review`),
              payload: { state: "accepted", reason: "Invoice checked" },
            })
          ).statusCode,
        ).toBe(201);
      }
      expect(
        (await command(item.id, "approve", accountantToken, `${item.id}-approve`)).statusCode,
      ).toBe(201);
      const posted = await command(item.id, "post", accountantToken, `${item.id}-post`);
      expect(posted.statusCode).toBe(201);
      const journal = await pool.query<{ account_code: string; debit: string; credit: string }>(
        `select account_code,coalesce(debit_minor,0)::text debit,coalesce(credit_minor,0)::text credit
         from journal_lines where organization_id='org-exp' and journal_id=$1 order by line_number`,
        [posted.json().data.journalId],
      );
      if (item.id === "expense-invoice") {
        expect(journal.rows).toEqual([
          { account_code: "642-OPEX", debit: "10000000", credit: "0" },
          { account_code: "1331-VAT", debit: "1000000", credit: "0" },
          { account_code: "331-AP", debit: "0", credit: "11000000" },
        ]);
      } else {
        expect(journal.rows).toEqual([
          { account_code: "642-OPEX", debit: "5500000", credit: "0" },
          { account_code: "334-EMP", debit: "0", credit: "5500000" },
        ]);
      }
    }
  });
});
