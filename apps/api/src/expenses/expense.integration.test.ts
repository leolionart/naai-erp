import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-310 expense workflow", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const organizationId = `org-exp-${randomUUID()}`;
  let app: Awaited<ReturnType<typeof createApp>>;
  const integrationToken = `erp310-integration-${organizationId}`;
  const accountantToken = `erp310-accountant-${organizationId}`;

  beforeAll(async () => {
    await pool.query(`
      insert into organizations (id,legal_name,base_currency,timezone)
      values ('${organizationId}','Expense Org','VND','Asia/Ho_Chi_Minh');
      insert into fiscal_years (organization_id,year,starts_on,ends_on)
      values ('${organizationId}',2026,'2026-01-01','2026-12-31');
      insert into fiscal_periods (organization_id,fiscal_year,period_number,starts_on,ends_on)
      values ('${organizationId}',2026,8,'2026-08-01','2026-08-31');
      insert into parties (organization_id,id,display_name,status)
      values ('${organizationId}','EMP-01','Employee One','active'),
             ('${organizationId}','SUP-01','Supplier One','active');
      insert into accounts (organization_id,code,name,root_type,is_control_account,allow_manual_posting)
      values ('${organizationId}','111-CASH','Petty cash','asset',true,false),
             ('${organizationId}','331-AP','Accounts payable','liability',true,false),
             ('${organizationId}','334-EMP','Employee payable','liability',true,false),
             ('${organizationId}','642-OPEX','Operating expense','expense',false,true),
             ('${organizationId}','1331-VAT','Deductible VAT','asset',true,false);
    `);
    const hashes = [integrationToken, accountantToken].map((token) =>
      createHash("sha256").update(token).digest("hex"),
    );
    await pool.query(
      `insert into api_credentials (organization_id,id,actor_id,token_hash,roles) values
       ($3,'exp-integration','maker',$1,'["integration"]'),
       ($3,'exp-accountant','accountant',$2,'["accountant","approver"]')`,
      [...hashes, organizationId],
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
      url: `/api/v1/organizations/${organizationId}/expenses/${id}/${action}`,
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
      url: `/api/v1/organizations/${organizationId}/expenses/${id}/review`,
      headers: headers(accountantToken, key),
      payload: { axis, lineNumber: 1, state, eligibleMinor, reason: `${axis} review` },
    });

  it("updates only category metadata on a posted expense with audit and idempotent readback", async () => {
    const id = "expense-posted-category-metadata";
    await pool.query(
      `insert into dimension_values(organization_id,kind,code,name,is_active)
       values($1,'category','MEAL','Ăn uống',true),($1,'category','INACTIVE','Ngừng dùng',false)
       on conflict do nothing`,
      [organizationId],
    );
    await pool.query(
      `insert into expenses
        (organization_id,id,expense_class,state,expense_date,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,version,created_by,posted_by,posted_at)
       values($1,$2,'non_documented','posted','2026-08-01','Posted category metadata','VND',1000,0,1000,'111-CASH',2,'maker','accountant',now())`,
      [organizationId, id],
    );
    await pool.query(
      `insert into expense_lines
        (organization_id,expense_id,line_number,description,net_minor,vat_minor,gross_minor,posting_account_code,management_state,cit_state,vat_state,dimensions)
       values($1,$2,1,'Meal',1000,0,1000,'642-OPEX','valid','ineligible','ineligible','{"project":"P-1"}')`,
      [organizationId, id],
    );

    const request = () =>
      app.inject({
        method: "PATCH",
        url: `/api/v1/organizations/${organizationId}/expenses/${id}/category`,
        headers: headers(integrationToken, "posted-expense-category"),
        payload: { category: "MEAL" },
      });
    const updated = await request();
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json().data).toMatchObject({
      expenseId: id,
      category: "MEAL",
      version: "3",
      idempotencyReplayed: false,
    });
    const replay = await request();
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json().data).toMatchObject({ idempotencyReplayed: true, version: "3" });

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${organizationId}/expenses/${id}`,
      headers: headers(integrationToken, "unused-detail-key"),
    });
    expect(detail.json().data.lines[0]).toMatchObject({
      dimensions: { project: "P-1", category: "MEAL" },
      expenseCategoryCode: null,
      fundingTreatment: null,
    });
    const listing = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${organizationId}/expenses`,
      headers: headers(integrationToken, "unused-list-key"),
    });
    expect(listing.json().data.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id, category: "MEAL" })]),
    );
    const audit = await pool.query<{ count: number }>(
      `select count(*)::int count from resource_audit_events
       where organization_id=$1 and resource_type='expense' and resource_key=$2 and action='update_category'`,
      [organizationId, id],
    );
    expect(audit.rows[0]?.count).toBe(1);

    await expect(
      pool.query(
        "update expense_lines set gross_minor=2 where organization_id=$1 and expense_id=$2 and line_number=1",
        [organizationId, id],
      ),
    ).rejects.toMatchObject({ code: "55000" });
    const inactive = await app.inject({
      method: "PATCH",
      url: `/api/v1/organizations/${organizationId}/expenses/${id}/category`,
      headers: headers(integrationToken, "inactive-expense-category"),
      payload: { category: "INACTIVE" },
    });
    expect(inactive.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("manages an organization category and snapshots its treatment on the expense line", async () => {
    const categoryUrl = `/api/v1/organizations/${organizationId}/master-data/expense-categories`;
    const category = await app.inject({
      method: "POST",
      url: categoryUrl,
      headers: headers(integrationToken, "category-create"),
      payload: {
        data: {
          code: "DOMAIN",
          name: "Domain and hosting",
          funding_treatment: "owner_paid_company_cost",
          is_active: true,
        },
      },
    });
    expect(category.statusCode, category.body).toBe(201);
    const categoryKey = Buffer.from(JSON.stringify({ code: "DOMAIN" })).toString("base64url");
    const id = "expense-category-snapshot";
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/expenses`,
      headers: headers(integrationToken, `${id}-create`),
      payload: {
        id,
        expenseClass: "invoice_backed",
        expenseDate: "2026-08-01",
        businessPurpose: "Domain renewal",
        currency: "VND",
        netMinor: "1000000",
        vatMinor: "0",
        grossMinor: "1000000",
        counterAccountCode: "334-EMP",
        lines: [
          {
            description: "Domain renewal",
            netMinor: "1000000",
            vatMinor: "0",
            grossMinor: "1000000",
            postingAccountCode: "642-OPEX",
            expenseCategoryCode: "DOMAIN",
            allocations: [
              { id: `${id}-a`, amountMinor: "1000000", dimensions: { costCenter: "ADMIN" } },
            ],
          },
        ],
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const changed = await app.inject({
      method: "PATCH",
      url: `${categoryUrl}/${categoryKey}`,
      headers: {
        ...headers(integrationToken, "category-update"),
        "if-match": category.json().data.mutation.resourceVersion,
      },
      payload: { data: { funding_treatment: "tax_only_non_cash" } },
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json().data.resource.version).toBe("2");
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${organizationId}/expenses/${id}`,
      headers: { authorization: `Bearer ${integrationToken}` },
    });
    expect(detail.json().data.lines[0]).toMatchObject({
      expenseCategoryCode: "DOMAIN",
      fundingTreatment: "owner_paid_company_cost",
    });
  });

  it("discards only a version-matched draft and replays idempotently", async () => {
    const id = "expense-inferred-payroll-2023";
    const created = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/expenses`,
      headers: headers(integrationToken, `${id}-create`),
      payload: {
        id,
        expenseClass: "payroll_personnel",
        expenseDate: "2026-08-01",
        businessPurpose: "Inferred payroll draft to discard",
        currency: "VND",
        netMinor: "1000000",
        vatMinor: "0",
        grossMinor: "1000000",
        counterAccountCode: "334-EMP",
        lines: [
          {
            description: "Inferred payroll",
            netMinor: "1000000",
            vatMinor: "0",
            grossMinor: "1000000",
            postingAccountCode: "642-OPEX",
            allocations: [
              {
                id: `${id}-allocation`,
                amountMinor: "1000000",
                dimensions: { source: "inferred" },
              },
            ],
          },
        ],
      },
    });
    expect(created.statusCode, created.body).toBe(201);

    const discardRequest = {
      method: "DELETE" as const,
      url: `/api/v1/organizations/${organizationId}/expenses/${id}`,
      headers: {
        ...headers(integrationToken, `${id}-discard`),
        "if-match": "1",
      },
      payload: { reason: "2023 payroll was inferred and is outside confirmed scope" },
    };
    const discarded = await app.inject(discardRequest);
    expect(discarded.statusCode, discarded.body).toBe(200);
    expect(discarded.json().data).toMatchObject({
      expenseId: id,
      state: "discarded",
      idempotencyReplayed: false,
    });
    const replay = await app.inject(discardRequest);
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json().data.idempotencyReplayed).toBe(true);
    expect(
      (
        await pool.query(
          "select count(*)::int count from expenses where organization_id=$1 and id=$2",
          [organizationId, id],
        )
      ).rows[0]?.count,
    ).toBe(0);
    expect(
      (
        await pool.query(
          "select count(*)::int count from resource_audit_events where organization_id=$1 and resource_type='expense' and resource_key=$2 and action='discard'",
          [organizationId, id],
        )
      ).rows[0]?.count,
    ).toBe(1);
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
      url: `/api/v1/organizations/${organizationId}/expenses`,
      headers: headers(integrationToken, "no-invoice-create"),
      payload: input,
    });
    expect(created.statusCode).toBe(201);

    const filtered = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${organizationId}/expenses?class=non_documented`,
      headers: { authorization: `Bearer ${integrationToken}` },
    });
    expect(filtered.statusCode, filtered.body).toBe(200);
    expect(filtered.json().data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: input.id, expense_date: "2026-08-05" }),
      ]),
    );

    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${organizationId}/expenses/${input.id}`,
      headers: { authorization: `Bearer ${integrationToken}` },
    });
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().data.expense_date).toBe("2026-08-05");

    const replay = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/expenses`,
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
       where organization_id=$1 and journal_id=$2 order by line_number`,
      [organizationId, journalId],
    );
    expect(lines.rows).toEqual([
      { account_code: "642-OPEX", debit_minor: "3000000", credit_minor: null },
      { account_code: "111-CASH", debit_minor: null, credit_minor: "3000000" },
    ]);
    await expect(
      pool.query(
        "update expense_lines set gross_minor=1 where organization_id=$1 and expense_id=$2 and line_number=1",
        [organizationId, input.id],
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
            url: `/api/v1/organizations/${organizationId}/expenses`,
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
          url: `/api/v1/organizations/${organizationId}/evidence`,
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
              url: `/api/v1/organizations/${organizationId}/evidence/${evidenceId}/review`,
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
         from journal_lines where organization_id=$1 and journal_id=$2 order by line_number`,
        [organizationId, posted.json().data.journalId],
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
