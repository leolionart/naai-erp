import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-630 financial statements and tax reconciliation", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const makerToken = "erp630-maker";
  const approverToken = "erp630-approver";
  const otherToken = "erp630-other";
  const headers = (token = makerToken) => ({ authorization: `Bearer ${token}` });
  const reportQuery =
    "startsOn=2026-08-01&endsOn=2026-08-31&asOfInstant=2026-08-31T16%3A59%3A59.000Z&framework=TT133";

  const mapping = {
    id: "erp630-map",
    framework: "TT133",
    effectiveFrom: "2026-01-01",
    changeReason: "ERP-630 controlled reporting map",
    lines: [
      ["profit_and_loss", "revenue", "Revenue", "511-REV", 10],
      ["profit_and_loss", "direct_cost", "Direct cost", "632-COGS", 20],
      ["profit_and_loss", "opex", "Operating expense", "642-OPEX", 30],
      ["profit_and_loss", "other_income", "Other income", "515-OTHER", 40],
      ["profit_and_loss", "other_expense", "Other expense", "635-OTHER", 50],
      ["profit_and_loss", "tax_expense", "Income tax", "821-TAX", 60],
      ["balance_sheet", "cash", "Cash", "111-BANK", 10],
      ["balance_sheet", "cash", "Cash", "111-CASH", 11],
      ["balance_sheet", "equipment", "Equipment", "211-EQUIP", 20],
      ["balance_sheet", "payables", "Payables", "331-AP", 30],
      ["balance_sheet", "loan", "Loan", "341-LOAN", 40],
      ["balance_sheet", "capital", "Capital", "411-CAPITAL", 50],
      ["cash_flow", "operating", "Operating", "511-REV", 10, "operating"],
      ["cash_flow", "operating", "Operating", "632-COGS", 11, "operating"],
      ["cash_flow", "operating", "Operating", "642-OPEX", 12, "operating"],
      ["cash_flow", "operating", "Operating", "515-OTHER", 13, "operating"],
      ["cash_flow", "operating", "Operating", "635-OTHER", 14, "operating"],
      ["cash_flow", "investing", "Investing", "211-EQUIP", 20, "investing"],
      ["cash_flow", "financing", "Financing", "341-LOAN", 30, "financing"],
      ["cash_flow", "financing", "Financing", "411-CAPITAL", 31, "financing"],
      ["vat_reconciliation", "output_vat", "Output VAT", "3331-VAT", 10, null, "output"],
      ["vat_reconciliation", "input_vat", "Input VAT", "1331-VAT", 20, null, "input_eligible"],
    ].map(
      ([statement, lineCode, label, accountCode, displayOrder, cashFlowClass, vatTreatment]) => ({
        statement,
        lineCode,
        label,
        accountCode,
        displayOrder,
        ...(cashFlowClass ? { cashFlowClass } : {}),
        ...(vatTreatment ? { vatTreatment } : {}),
      }),
    ),
  };

  beforeAll(async () => {
    await pool.query(`
      insert into organizations (id,legal_name,base_currency,timezone)
      values ('org-erp630','ERP 630 Org','VND','Asia/Ho_Chi_Minh'),
             ('org-erp630-other','ERP 630 Other','VND','Asia/Ho_Chi_Minh');
      insert into accounts (organization_id,code,name,root_type,is_control_account,allow_manual_posting)
      select o.id,a.code,a.name,a.root_type::account_root_type,false,true
      from (values ('org-erp630'),('org-erp630-other')) o(id)
      cross join (values
        ('111-BANK','Bank','asset'),('111-CASH','Cash','asset'),('131-AR','Receivables','asset'),('1331-VAT','Input VAT','asset'),
        ('211-EQUIP','Equipment','asset'),('331-AP','Payables','liability'),('3331-VAT','Output VAT','liability'),
        ('341-LOAN','Loan','liability'),('411-CAPITAL','Capital','equity'),('511-REV','Revenue','revenue'),
        ('515-OTHER','Other income','revenue'),('632-COGS','Direct cost','expense'),
        ('635-OTHER','Other expense','expense'),('642-OPEX','Opex','expense'),('821-TAX','Income tax','expense'),
        ('998-UNMAPPED-REV','Unmapped revenue','revenue'),('999-UNMAPPED','Unmapped asset','asset'),
        ('997-UNMAPPED-EXP','Unmapped expense','expense')) a(code,name,root_type);
    `);
    await pool.query(
      `
      insert into api_credentials (organization_id,id,actor_id,token_hash,roles)
      values ('org-erp630','erp630-maker','maker',$1,'["finance_admin"]'),
             ('org-erp630','erp630-approver','approver',$2,'["approver","accountant"]'),
             ('org-erp630-other','erp630-other','other',$3,'["viewer"]');
    `,
      [
        createHash("sha256").update(makerToken).digest("hex"),
        createHash("sha256").update(approverToken).digest("hex"),
        createHash("sha256").update(otherToken).digest("hex"),
      ],
    );
    await pool.query(`
      insert into financial_accounts
        (organization_id,id,code,display_name,kind,currency,ledger_account_code,bank_code,status,version,created_by,updated_by)
      values ('org-erp630','fa-bank','BANK','Bank','bank','VND','111-BANK','TESTBANK','active',1,'fixture','fixture'),
             ('org-erp630','fa-cash','CASH','Cash','cash','VND','111-CASH',null,'active',1,'fixture','fixture');
    `);

    const journal = async (
      id: string,
      date: string,
      postedAt: string,
      lines: Array<[string, "d" | "c", string]>,
    ) => {
      await pool.query(
        `insert into journal_entries
          (organization_id,id,journal_date,description,currency,state,posted_at,posted_by,approved_at,approved_by,approval_reason)
         values ('org-erp630',$1,$2,$1,'VND','posted',$3,'maker',$3,'approver','Fixture approved')`,
        [id, date, postedAt],
      );
      for (const [index, [account, side, amount]] of lines.entries())
        await pool.query(
          `insert into journal_lines (organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
           values ('org-erp630',$1,$2,$3,$4,$5,$6,'{}')`,
          [
            id,
            index + 1,
            account,
            side === "d" ? amount : null,
            side === "c" ? amount : null,
            `${id}:${account}`,
          ],
        );
    };
    await journal("opening", "2026-07-31", "2026-07-31T10:00:00Z", [
      ["111-BANK", "d", "300"],
      ["411-CAPITAL", "c", "300"],
    ]);
    await journal("sale", "2026-08-05", "2026-08-05T10:00:00Z", [
      ["111-BANK", "d", "100"],
      ["511-REV", "c", "100"],
    ]);
    await journal("direct", "2026-08-06", "2026-08-06T10:00:00Z", [
      ["632-COGS", "d", "40"],
      ["111-BANK", "c", "40"],
    ]);
    await journal("opex", "2026-08-07", "2026-08-07T10:00:00Z", [
      ["642-OPEX", "d", "20"],
      ["331-AP", "c", "20"],
    ]);
    await journal("other-income", "2026-08-08", "2026-08-08T10:00:00Z", [
      ["111-BANK", "d", "5"],
      ["515-OTHER", "c", "5"],
    ]);
    await journal("other-expense", "2026-08-09", "2026-08-09T10:00:00Z", [
      ["635-OTHER", "d", "2"],
      ["111-BANK", "c", "2"],
    ]);
    await journal("tax", "2026-08-10", "2026-08-10T10:00:00Z", [
      ["821-TAX", "d", "5"],
      ["331-AP", "c", "5"],
    ]);
    await journal("equipment", "2026-08-11", "2026-08-11T10:00:00Z", [
      ["211-EQUIP", "d", "30"],
      ["111-BANK", "c", "30"],
    ]);
    await journal("loan", "2026-08-12", "2026-08-12T10:00:00Z", [
      ["111-BANK", "d", "50"],
      ["341-LOAN", "c", "50"],
    ]);
    await journal("capital-contribution", "2026-08-12", "2026-08-12T11:00:00Z", [
      ["111-BANK", "d", "20"],
      ["411-CAPITAL", "c", "20"],
    ]);
    await journal("loan-repayment", "2026-08-12", "2026-08-12T12:00:00Z", [
      ["341-LOAN", "d", "10"],
      ["111-BANK", "c", "10"],
    ]);
    await journal("owner-withdrawal", "2026-08-12", "2026-08-12T13:00:00Z", [
      ["411-CAPITAL", "d", "5"],
      ["111-BANK", "c", "5"],
    ]);
    await journal("transfer", "2026-08-13", "2026-08-13T10:00:00Z", [
      ["111-CASH", "d", "10"],
      ["111-BANK", "c", "10"],
    ]);
    await journal("unclassified-cash", "2026-08-14", "2026-08-14T10:00:00Z", [
      ["111-BANK", "d", "1"],
      ["999-UNMAPPED", "c", "1"],
    ]);
    await journal("vat-sale", "2026-08-15", "2026-08-15T10:00:00Z", [
      ["131-AR", "d", "110"],
      ["511-REV", "c", "100"],
      ["3331-VAT", "c", "10"],
    ]);
    await journal("vat-expense", "2026-08-16", "2026-08-16T10:00:00Z", [
      ["642-OPEX", "d", "50"],
      ["1331-VAT", "d", "5"],
      ["331-AP", "c", "55"],
    ]);
    await pool.query(`
      insert into parties(organization_id,id,display_name) values
        ('org-erp630','client630','Client 630'),('org-erp630','supplier630','Supplier 630');
      insert into tax_code_versions(organization_id,code,name,kind,rate,effective_from,review_state,reviewed_by,reviewed_at,review_reason)
      values ('org-erp630','VAT10O','Output VAT 10','vat_output',0.1,'2026-01-01','accountant_approved','approver',now(),'Fixture'),
             ('org-erp630','VAT10I','Input VAT 10','vat_input',0.1,'2026-01-01','accountant_approved','approver',now(),'Fixture');
      insert into commercial_documents(organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,journal_id,original_document_id,created_by)
      values ('org-erp630','sale-doc','sales_invoice','posted','S-630','AA',2026,'client630','2026-08-15','2026-08-15','VND',100,10,110,'131-AR','vat-sale',null,'maker'),
             ('org-erp630','purchase-doc','purchase_invoice','captured','P-630',null,2026,'supplier630','2026-08-17','2026-08-17','VND',80,8,88,'331-AP',null,null,'maker'),
             ('org-erp630','purchase-credit-doc','credit_note','captured','PC-630','PC',2026,'supplier630','2026-08-18','2026-08-18','VND',20,2,22,'331-AP',null,'purchase-doc','maker');
      insert into commercial_document_lines(organization_id,document_id,line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,primary_account_code,tax_account_code,tax_code)
      values ('org-erp630','sale-doc',1,'Sale',1,100,100,10,110,'511-REV','3331-VAT','VAT10O'),
             ('org-erp630','purchase-doc',1,'Purchase',1,80,80,8,88,'642-OPEX','1331-VAT','VAT10I');
      insert into commercial_document_lines(organization_id,document_id,line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,primary_account_code,tax_account_code,tax_code)
      values ('org-erp630','purchase-credit-doc',1,'Purchase credit',1,20,20,2,22,'642-OPEX','1331-VAT','VAT10I');
      insert into expenses(organization_id,id,expense_class,state,payee_party_id,expense_date,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,cit_state,vat_state,journal_id,created_by)
      values ('org-erp630','expense630','invoice_backed','posted','supplier630','2026-08-16','Operations','VND',50,5,55,'331-AP','eligible','eligible','vat-expense','maker');
      insert into expense_lines(organization_id,expense_id,line_number,description,net_minor,vat_minor,gross_minor,posting_account_code,vat_account_code,management_state,cit_state,vat_state,cit_eligible_minor,vat_eligible_minor,reviewed_by,reviewed_at,review_reason,review_reference)
      values ('org-erp630','expense630',1,'Operations',50,5,55,'642-OPEX','1331-VAT','valid','eligible','eligible',55,5,'approver',now(),'Reviewed','TAX-630');
      insert into evidence_records(organization_id,id,subject_type,subject_id,evidence_type,current_version,created_by)
      values ('org-erp630','evidence-sale-630','commercial_document','sale-doc','invoice',1,'maker');
      insert into evidence_versions(organization_id,evidence_id,version_number,status,review_state,object_bucket,object_key,original_filename,declared_media_type,detected_media_type,byte_size,sha256,source,uploaded_by)
      values ('org-erp630','evidence-sale-630',1,'active','pending','test','erp630/sale.pdf','sale.pdf','application/pdf','application/pdf',1,'${"a".repeat(64)}','fixture','maker');
    `);
    await journal("unmapped-pnl", "2026-08-15", "2026-08-15T10:00:00Z", [
      ["997-UNMAPPED-EXP", "d", "1"],
      ["998-UNMAPPED-REV", "c", "1"],
    ]);
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("creates and approves a mapping idempotently and isolates organization scope", async () => {
    const create = {
      method: "POST" as const,
      url: "/api/v1/organizations/org-erp630/financial-statement-mappings",
      headers: { ...headers(), "idempotency-key": "map-create" },
      payload: mapping,
    };
    const created = await app.inject(create);
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().data).toMatchObject({
      id: "erp630-map",
      version: 1,
      state: "draft",
      idempotencyReplayed: false,
    });
    expect((await app.inject(create)).json().data.idempotencyReplayed).toBe(true);
    const approve = {
      method: "POST" as const,
      url: "/api/v1/organizations/org-erp630/financial-statement-mappings/erp630-map/versions/1/approve",
      headers: { ...headers(approverToken), "idempotency-key": "map-approve" },
      payload: { reason: "Independent review complete" },
    };
    expect((await app.inject(approve)).json().data).toMatchObject({
      state: "approved",
      idempotencyReplayed: false,
    });
    expect((await app.inject(approve)).json().data.idempotencyReplayed).toBe(true);
    const nextVersion = await app.inject({
      ...create,
      headers: { ...headers(), "idempotency-key": "map-create-v2" },
      payload: { ...mapping, changeReason: "Second reviewed mapping version" },
    });
    expect(nextVersion.statusCode, nextVersion.body).toBe(201);
    expect(nextVersion.json().data).toMatchObject({ id: "erp630-map", version: 2, state: "draft" });
    const crossOrg = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp630-other/financial-statement-mappings",
      headers: headers(),
    });
    expect(crossOrg.statusCode).toBe(403);
  });

  it("derives P&L totals, retains unmapped visibility, and provides exact drill-down", async () => {
    const mislabeledCash = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/org-erp630/reports/financial-statements/profit-and-loss?${reportQuery}&basis=cash`,
      headers: headers(),
    });
    expect(mislabeledCash.statusCode).toBe(400);
    const result = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/org-erp630/reports/financial-statements/profit-and-loss?${reportQuery}`,
      headers: headers(),
    });
    expect(result.statusCode, result.body).toBe(200);
    expect(result.json().data).toMatchObject({
      revenueMinor: "200",
      directCostMinor: "40",
      grossProfitMinor: "160",
      operatingExpenseMinor: "70",
      operatingProfitMinor: "90",
      otherIncomeMinor: "5",
      otherExpenseMinor: "2",
      profitBeforeTaxMinor: "93",
      incomeTaxMinor: "5",
      sectionFormulaNetProfitMinor: "88",
      netProfitMinor: "88",
      unclassifiedNetMinor: "0",
      status: "review_required",
      control: { status: "tied_out", differenceMinor: "0" },
    });
    const drill = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/org-erp630/reports/financial-statements/drilldown?${reportQuery}&statement=profit_and_loss&lineCode=revenue`,
      headers: headers(),
    });
    expect(drill.statusCode, drill.body).toBe(200);
    expect(drill.json().data.items.map((x: { journalId: string }) => x.journalId)).toEqual([
      "sale",
      "vat-sale",
    ]);
    expect(
      drill
        .json()
        .data.items.reduce(
          (sum: bigint, item: { amountMinor: string }) => sum + BigInt(item.amountMinor),
          0n,
        ),
    ).toBe(200n);
    const vatSale = drill
      .json()
      .data.items.find((item: { journalId: string }) => item.journalId === "vat-sale");
    expect(vatSale.refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceType: "journal_line", id: "vat-sale:2" }),
        expect.objectContaining({ resourceType: "journal_entry", id: "vat-sale" }),
        expect.objectContaining({ resourceType: "commercial_document", id: "sale-doc" }),
        expect.objectContaining({ resourceType: "evidence", id: "evidence-sale-630" }),
      ]),
    );
    const resolved = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp630/reports/financial-statements/source-resolver?journalId=vat-sale&lineNumber=2",
      headers: headers(),
    });
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect(resolved.json().data).toMatchObject({
      journalId: "vat-sale",
      lineNumber: 2,
      amountMinor: "100",
    });
    const isolated = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp630-other/reports/financial-statements/source-resolver?journalId=vat-sale&lineNumber=2",
      headers: { authorization: `Bearer ${otherToken}` },
    });
    expect(isolated.statusCode).toBe(404);
  });

  it("builds an exactly balanced Balance Sheet and rejects a deliberately unbalanced ledger", async () => {
    const url = `/api/v1/organizations/org-erp630/reports/financial-statements/balance-sheet?endsOn=2026-08-31&asOfInstant=2026-08-31T16%3A59%3A59.000Z&framework=TT133`;
    const balanced = await app.inject({ method: "GET", url, headers: headers() });
    expect(balanced.statusCode, balanced.body).toBe(200);
    expect(balanced.json().data).toMatchObject({
      equationDifferenceMinor: "0",
      control: { status: "tied_out" },
    });
    const assetSources = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/org-erp630/reports/financial-statements/drilldown?endsOn=2026-08-31&asOfInstant=2026-08-31T16%3A59%3A59.000Z&framework=TT133&statement=balance_sheet&lineCode=assets`,
      headers: headers(),
    });
    expect(assetSources.statusCode, assetSources.body).toBe(200);
    expect(assetSources.json().data.items.length).toBeGreaterThan(0);
    expect(assetSources.json().data.items[0]).toEqual(
      expect.objectContaining({ sourceId: expect.any(String), sourceType: "journal_entry" }),
    );
    await pool.query(`insert into journal_entries (organization_id,id,journal_date,description,currency,state,posted_at,posted_by,approved_at,approved_by,approval_reason)
      values ('org-erp630','bad-ledger','2026-08-31','bad','VND','posted','2026-09-01T01:00:00Z','maker','2026-09-01T01:00:00Z','approver','test')`);
    await pool.query(`insert into journal_lines (organization_id,journal_id,line_number,account_code,debit_minor,description,dimensions)
      values ('org-erp630','bad-ledger',1,'999-UNMAPPED',1,'deliberate mismatch','{}')`);
    const mismatch = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp630/reports/financial-statements/balance-sheet?endsOn=2026-08-31&asOfInstant=2026-09-01T01%3A00%3A00.000Z&framework=TT133",
      headers: headers(),
    });
    expect(mismatch.statusCode, mismatch.body).toBe(400);
    expect(mismatch.json().error).toMatchObject({
      code: "BALANCE_SHEET_SOURCE_LEDGER_IS_UNBALANCED",
    });
  });

  it("classifies direct cash flow, excludes internal transfer, ties opening/net/closing, and flags unclassified", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/org-erp630/reports/financial-statements/cash-flow?${reportQuery}`,
      headers: headers(),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({
      operatingCashFlowMinor: "63",
      investingCashFlowMinor: "-30",
      financingCashFlowMinor: "55",
      unclassifiedCashFlowMinor: "1",
      netCashFlowMinor: "89",
      openingCashMinor: "300",
      closingCashMinor: "389",
      internalTransferJournalIds: ["transfer"],
      status: "review_required",
    });
    expect(response.json().data.confidenceFlags[0]).toMatchObject({
      code: "unclassified_cash_flow",
      sourceIds: ["unclassified-cash"],
    });
  });

  it("reconciles VAT eligibility, ledger differences, thresholds, and exact sources", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/org-erp630/reports/tax/vat-reconciliation?${reportQuery}`,
      headers: headers(),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({
      status: "review_required",
      outputVatMinor: "10",
      inputVatMinor: "11",
      eligibleInputVatMinor: "5",
      ineligibleInputVatMinor: "0",
      unreviewedInputVatMinor: "6",
      netVatPayableMinor: "5",
      outputVatLedgerMinor: "10",
      inputVatLedgerMinor: "5",
      outputDifferenceMinor: "0",
      inputDifferenceMinor: "6",
      sourceIds: ["expense630", "purchase-credit-doc", "purchase-doc", "sale-doc"],
      journalIds: ["vat-expense", "vat-sale"],
    });
    expect(response.json().data.unreviewedItemIds).toEqual([
      "document:purchase-credit-doc:1",
      "document:purchase-doc:1",
    ]);
  });

  it("exposes tax expense exceptions with independent CIT/VAT review and source IDs", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/org-erp630/reports/tax/expense-exceptions?${reportQuery}&state=exception`,
      headers: headers(),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({
      status: "review_required",
      accountingBookedMinor: "50",
      citEligibleMinor: "50",
      vatEligibleMinor: "5",
      missingEvidenceItemIds: ["expense630:1"],
      count: 1,
    });
    expect(response.json().data.items[0]).toMatchObject({
      expense_id: "expense630",
      cit_state: "eligible",
      vat_state: "eligible",
      sourceIds: { expenseId: "expense630", journalId: "vat-expense", lineId: "expense630:1" },
      exceptionCodes: [],
    });
  });

  it("keeps a prior cutoff stable when a backdated journal is posted later", async () => {
    const url = `/api/v1/organizations/org-erp630/reports/financial-statements/profit-and-loss?${reportQuery}`;
    const before = (await app.inject({ method: "GET", url, headers: headers() })).json().data;
    await pool.query(`insert into journal_entries (organization_id,id,journal_date,description,currency,state,posted_at,posted_by,approved_at,approved_by,approval_reason)
      values ('org-erp630','late-backdate','2026-08-15','late','VND','posted','2026-09-01T01:00:00Z','maker','2026-09-01T01:00:00Z','approver','late')`);
    await pool.query(`insert into journal_lines (organization_id,journal_id,line_number,account_code,debit_minor,description,dimensions) values
      ('org-erp630','late-backdate',1,'111-BANK',9,'late bank','{}');
      insert into journal_lines (organization_id,journal_id,line_number,account_code,credit_minor,description,dimensions) values
      ('org-erp630','late-backdate',2,'511-REV',9,'late revenue','{}')`);
    const after = (await app.inject({ method: "GET", url, headers: headers() })).json().data;
    expect(after.ledgerCutoff.sourceFingerprint).toBe(before.ledgerCutoff.sourceFingerprint);
    expect(after.netProfitMinor).toBe(before.netProfitMinor);
  });
});
