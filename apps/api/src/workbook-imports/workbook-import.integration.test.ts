import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-740 Workbook Import API Integration", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const importToken = "import-secret-token";

  beforeAll(async () => {
    // Set up database schema references, organizations, fiscal period, accounts
    await pool.query(`
      insert into organizations (id, legal_name, base_currency, timezone)
      values ('org-import', 'Import Org', 'VND', 'Asia/Ho_Chi_Minh')
      on conflict (id) do nothing;

      insert into users (id, email, display_name)
      values ('maker-import', 'maker-import@example.com', 'Workbook Importer')
      on conflict (id) do nothing;

      insert into organization_memberships (organization_id, user_id)
      values ('org-import', 'maker-import')
      on conflict do nothing;

      insert into fiscal_years (organization_id, year, starts_on, ends_on)
      values ('org-import', 2025, '2025-01-01', '2025-12-31')
      on conflict do nothing;

      insert into fiscal_periods (organization_id, fiscal_year, period_number, starts_on, ends_on, state)
      values ('org-import', 2025, 1, '2025-01-01', '2025-01-31', 'open')
      on conflict do nothing;

      insert into accounts (organization_id, code, name, root_type, is_control_account, allow_manual_posting)
      values
        ('org-import', '111', 'Petty Cash', 'asset', false, true),
        ('org-import', '131', 'AR Control', 'asset', true, false),
        ('org-import', '331', 'AP Control', 'liability', true, false),
        ('org-import', '3331', 'VAT Output', 'liability', false, true),
        ('org-import', '1331', 'VAT Input', 'asset', false, true),
        ('org-import', '511', 'Service Revenue', 'revenue', false, true),
        ('org-import', '642', 'Opex Management', 'expense', false, true),
        ('org-import', '632', 'Direct Cost Services', 'expense', false, true)
      on conflict do nothing;
    `);

    const tokenHash = createHash("sha256").update(importToken).digest("hex");
    await pool.query(
      `insert into api_credentials (organization_id, id, actor_id, token_hash, roles)
       values ('org-import', 'import-actor-id', 'maker-import', $1, '["integration"]')
       on conflict do nothing`,
      [tokenHash],
    );

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const payload = {
    mappingVersion: 1 as const,
    sources: [
      { kind: "finance" as const, sha256: "test-workbook-sha256", filename: "fixture.xlsx" },
    ],
    inventory: [
      {
        workbook: "finance",
        sheet: "Doanh thu",
        rowCount: 2,
        dataRowCount: 1,
        formulaCellCount: 0,
        disposition: "sales" as const,
      },
      {
        workbook: "finance",
        sheet: "Chi phí",
        rowCount: 2,
        dataRowCount: 1,
        formulaCellCount: 0,
        disposition: "expenses" as const,
      },
    ],
    issues: [],
    controls: [
      {
        workbook: "finance",
        sheet: "Tỷ suất lợi nhuận",
        year: 2025,
        salesMinor: "100000000",
        expenseMinor: "20000000",
        profitMinor: "80000000",
      },
    ],
    varianceRules: [],
    parties: [
      {
        id: "party-client-1",
        displayName: "Client Company One",
        normalizedTaxId: null,
        status: "active" as const,
        roles: ["client"],
      },
      {
        id: "party-supplier-1",
        displayName: "Supplier Company One",
        normalizedTaxId: null,
        status: "active" as const,
        roles: ["supplier"],
      },
    ],
    projects: [
      {
        id: "prj-project-1",
        code: "PRJ1",
        name: "Project One",
        clientPartyId: "party-client-1",
        ownerUserId: "user-import",
        contractType: "fixed_fee" as const,
        currency: "VND",
        budgetMinor: "150000000",
        startsOn: "2025-01-01",
        endsOn: null,
        state: "active" as const,
      },
    ],
    salesInvoices: [
      {
        id: "inv-row2-gross-2025-01-10",
        documentNumber: "INV-2025-2",
        partyId: "party-client-1",
        projectId: "prj-project-1",
        documentDate: "2025-01-10",
        dueDate: "2025-01-10",
        currency: "VND",
        netMinor: "100000000",
        taxMinor: "10000000",
        grossMinor: "110000000",
        controlAccountCode: "131",
        sourceRowIndex: 2,
        sourceIdentity: "test-workbook-sha256:Doanh thu:2",
      },
    ],
    expenses: [
      {
        id: "exp-row2-gross-2025-01-15",
        amountMinor: "22000000",
        taxMinor: "2000000",
        date: "2025-01-15",
        class: "petty_cash",
        payeePartyId: "party-supplier-1",
        businessPurpose: "Office Rent",
        currency: "VND",
        sourceRowIndex: 2,
        sourceIdentity: "test-workbook-sha256:Chi phí:2",
        projectId: "prj-project-1",
      },
    ],
  };

  it("dry-run does not write to database but calculates correct control totals", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-import/workbook-imports/dry-run",
      headers: {
        authorization: `Bearer ${importToken}`,
      },
      payload,
    });

    expect(res.statusCode, res.payload).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.valid).toBe(true);
    expect(body.data.errors).toEqual([]);

    // Reconciliation checks:
    // Sales = netMinor = 100,000,000
    // Expense = amountMinor - taxMinor = 22,000,000 - 2,000,000 = 20,000,000
    // Profit = 100,000,000 - 20,000,000 = 80,000,000
    expect(body.data.reconciliation).toEqual({
      totalSales: "100000000",
      totalExpense: "20000000",
      totalProfit: "80000000",
      controls: payload.controls,
      variances: [],
    });

    // Verify ZERO mutations
    const partiesCount = await pool.query(
      "select count(*) from parties where organization_id='org-import' and id in ('party-client-1', 'party-supplier-1')",
    );
    expect(partiesCount.rows[0].count).toBe("0");

    const projectsCount = await pool.query(
      "select count(*) from projects where organization_id='org-import' and id='prj-project-1'",
    );
    expect(projectsCount.rows[0].count).toBe("0");

    const docsCount = await pool.query(
      "select count(*) from commercial_documents where organization_id='org-import' and id='inv-row2-gross-2025-01-10'",
    );
    expect(docsCount.rows[0].count).toBe("0");
  });

  it("rollback completely on invalid commit", async () => {
    // Send invalid payload (e.g. referencing non-existent party in sales invoice)
    const invalidPayload = {
      ...payload,
      salesInvoices: [
        {
          ...payload.salesInvoices[0],
          partyId: "non-existent-party-id",
        },
      ],
    };

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-import/workbook-imports/commit",
      headers: {
        authorization: `Bearer ${importToken}`,
      },
      payload: invalidPayload,
    });

    expect(res.statusCode, res.payload).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.valid).toBe(false);
    expect(body.data.errors).toContain(
      'Sales invoice INV-2025-2 at row 2 references unknown party ID "non-existent-party-id"',
    );

    // Verify nothing got committed (even projects or parties)
    const partiesCount = await pool.query(
      "select count(*) from parties where organization_id='org-import' and id in ('party-client-1', 'party-supplier-1')",
    );
    expect(partiesCount.rows[0].count).toBe("0");
  });

  it("does not authorize a workbook token outside its organization", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-other/workbook-imports/dry-run",
      headers: { authorization: `Bearer ${importToken}` },
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error.code).toBe("UNAUTHORIZED");
  });

  it("reports cross-sheet variance and blocks commit when it is not classified", async () => {
    const divergent = {
      ...payload,
      controls: [{ ...payload.controls[0], salesMinor: "100000001", profitMinor: "80000001" }],
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-import/workbook-imports/commit",
      headers: { authorization: `Bearer ${importToken}` },
      payload: divergent,
    });
    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.payload).data;
    expect(data.valid).toBe(false);
    expect(data.reconciliation.variances).toEqual([
      expect.objectContaining({ metric: "sales", varianceMinor: "1" }),
      expect.objectContaining({ metric: "profit", varianceMinor: "1" }),
    ]);
    expect(data.errors).toContain("Unexplained control variance Tỷ suất lợi nhuận/2025/sales: 1");
    const count = await pool.query(
      "select count(*) from commercial_documents where organization_id='org-import'",
    );
    expect(count.rows[0].count).toBe("0");
  });

  it("accepts an exact variance only when mapping v1 explicitly classifies it", async () => {
    const classified = {
      ...payload,
      controls: [{ ...payload.controls[0], salesMinor: "100000001", profitMinor: "80000001" }],
      varianceRules: [
        {
          id: "legacy-summary-sales-rounding",
          mappingVersion: 1 as const,
          sheet: "Tỷ suất lợi nhuận",
          metric: "sales" as const,
          varianceMinor: "1",
          classification: "legacy summary adjustment",
        },
        {
          id: "legacy-summary-profit-rounding",
          mappingVersion: 1 as const,
          sheet: "Tỷ suất lợi nhuận",
          metric: "profit" as const,
          varianceMinor: "1",
          classification: "legacy summary adjustment",
        },
      ],
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-import/workbook-imports/dry-run",
      headers: { authorization: `Bearer ${importToken}` },
      payload: classified,
    });
    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.payload).data;
    expect(data.valid).toBe(true);
    expect(data.reconciliation.variances).toEqual([
      expect.objectContaining({ metric: "sales", classifiedBy: "legacy-summary-sales-rounding" }),
      expect.objectContaining({ metric: "profit", classifiedBy: "legacy-summary-profit-rounding" }),
    ]);
  });

  it("mapping v2 preserves calendar totals while reconciling controls from row treatments", async () => {
    const v2 = {
      ...payload,
      mappingVersion: 2 as const,
      salesInvoices: [
        {
          ...payload.salesInvoices[0],
          documentDate: "2026-01-10",
          dueDate: "2026-01-10",
          legacyControlTreatment: {
            sourceSheet: "Doanh thu",
            sourceRow: 2,
            controlYear: 2025,
            controlMonth: 1,
            included: true,
            classification: "source_month_period_basis",
            evidence: "Doanh thu!H2=1",
          },
        },
      ],
      expenses: [
        {
          ...payload.expenses[0],
          date: "2026-01-15",
          legacyControlTreatment: {
            sourceSheet: "Chi phí",
            sourceRow: 2,
            controlYear: 2025,
            controlMonth: 1,
            included: true,
            classification: "source_month_period_basis",
            evidence: "Chi phí!C2=1",
          },
        },
      ],
      varianceRules: [],
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-import/workbook-imports/dry-run",
      headers: { authorization: `Bearer ${importToken}` },
      payload: v2,
    });
    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.payload).data;
    expect(data.valid).toBe(true);
    expect(data.reconciliation).toMatchObject({
      totalSales: "0",
      totalExpense: "0",
      totalProfit: "0",
      variances: [],
      legacyControl: {
        totalSales: "100000000",
        totalExpense: "20000000",
        totalProfit: "80000000",
      },
    });
    expect(data.reconciliation.legacyControl.components).toEqual([
      expect.objectContaining({ kind: "sales", sourceSheet: "Doanh thu", sourceRow: 2 }),
      expect.objectContaining({ kind: "expense", sourceSheet: "Chi phí", sourceRow: 2 }),
    ]);
  });

  it("mapping v2 rejects missing treatment and unaudited exclusions", async () => {
    const invalidV2 = {
      ...payload,
      mappingVersion: 2 as const,
      expenses: [
        {
          ...payload.expenses[0],
          legacyControlTreatment: {
            sourceSheet: "Chi phí",
            sourceRow: 2,
            controlYear: 2025,
            controlMonth: 1,
            included: false,
          },
        },
      ],
      varianceRules: [],
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-import/workbook-imports/dry-run",
      headers: { authorization: `Bearer ${importToken}` },
      payload: invalidV2,
    });
    const data = JSON.parse(res.payload).data;
    expect(data.valid).toBe(false);
    expect(data.errors).toContain("sales row 2 is missing mapping v2 legacy control treatment");
    expect(data.errors).toContain(
      "expense row 2 legacy control exclusion requires classification and evidence",
    );
    expect(data.reconciliation.legacyControl.components).toEqual([
      expect.objectContaining({ kind: "expense", included: false }),
    ]);
  });

  it("successful commit writes all entities and balanced journal entries", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-import/workbook-imports/commit",
      headers: {
        authorization: `Bearer ${importToken}`,
      },
      payload,
    });

    expect(res.statusCode, res.payload).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.valid).toBe(true);
    expect(body.data.details).toBeDefined();

    // Verify parties created
    const parties = await pool.query(
      "select id, display_name from parties where organization_id='org-import' and id in ('party-client-1', 'party-supplier-1')",
    );
    expect(parties.rows).toHaveLength(2);

    // Verify projects created
    const projects = await pool.query(
      "select id, name from projects where organization_id='org-import' and id='prj-project-1'",
    );
    expect(projects.rows).toHaveLength(1);

    // Verify sales invoice commercial document
    const doc = await pool.query(
      "select id, state, net_minor, tax_minor, gross_minor from commercial_documents where organization_id='org-import' and id='inv-row2-gross-2025-01-10'",
    );
    expect(doc.rows).toHaveLength(1);
    expect(doc.rows[0].state).toBe("posted");
    expect(doc.rows[0].gross_minor).toBe("110000000");

    // Verify expense created
    const exp = await pool.query(
      "select id, state, net_minor, vat_minor, gross_minor from expenses where organization_id='org-import' and id='exp-row2-gross-2025-01-15'",
    );
    expect(exp.rows).toHaveLength(1);
    expect(exp.rows[0].state).toBe("posted");
    expect(exp.rows[0].gross_minor).toBe("22000000");

    // Verify balanced double-entry journal entries for sales invoice
    // DR AR 131: 110,000,000
    // CR Revenue 511: 100,000,000
    // CR VAT 3331: 10,000,000
    const salesJournalId = `journal-sales-import-inv-row2-gross-2025-01-10`;
    const salesJournalLines = await pool.query(
      "select account_code, debit_minor, credit_minor from journal_lines where organization_id='org-import' and journal_id=$1",
      [salesJournalId],
    );
    expect(salesJournalLines.rows).toHaveLength(3);
    const arLine = salesJournalLines.rows.find((l) => l.account_code === "131");
    const revLine = salesJournalLines.rows.find((l) => l.account_code === "511");
    const vatLine = salesJournalLines.rows.find((l) => l.account_code === "3331");

    expect(arLine?.debit_minor).toBe("110000000");
    expect(arLine?.credit_minor).toBeNull();
    expect(revLine?.debit_minor).toBeNull();
    expect(revLine?.credit_minor).toBe("100000000");
    expect(vatLine?.debit_minor).toBeNull();
    expect(vatLine?.credit_minor).toBe("10000000");

    // Verify balanced double-entry journal entries for expense
    // Since it's project linked, it posts to 632:
    // DR Direct cost 632: 20,000,000
    // DR VAT Input 1331: 2,000,000
    // CR Cash/Bank 111: 22,000,000
    const expJournalId = `journal-expense-import-exp-row2-gross-2025-01-15`;
    const expJournalLines = await pool.query(
      "select account_code, debit_minor, credit_minor from journal_lines where organization_id='org-import' and journal_id=$1",
      [expJournalId],
    );
    expect(expJournalLines.rows).toHaveLength(3);
    const opexLine = expJournalLines.rows.find((l) => l.account_code === "632");
    const vatInLine = expJournalLines.rows.find((l) => l.account_code === "1331");
    const cashLine = expJournalLines.rows.find((l) => l.account_code === "111");

    expect(opexLine?.debit_minor).toBe("20000000");
    expect(vatInLine?.debit_minor).toBe("2000000");
    expect(cashLine?.credit_minor).toBe("22000000");
  });

  it("repeat import commit is idempotent and does not create duplicate entries", async () => {
    // Run commit on the exact same payload again
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-import/workbook-imports/commit",
      headers: {
        authorization: `Bearer ${importToken}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.valid).toBe(true);
    // details created should be 0 because on conflict do nothing skips them
    expect(body.data.details.salesInvoicesCreated).toBe(0);
    expect(body.data.details.expensesCreated).toBe(0);

    // Verify total counts of entities remain 1
    const docCount = await pool.query(
      "select count(*) from commercial_documents where organization_id='org-import' and id='inv-row2-gross-2025-01-10'",
    );
    expect(docCount.rows[0].count).toBe("1");

    const expCount = await pool.query(
      "select count(*) from expenses where organization_id='org-import' and id='exp-row2-gross-2025-01-15'",
    );
    expect(expCount.rows[0].count).toBe("1");
  });
});
