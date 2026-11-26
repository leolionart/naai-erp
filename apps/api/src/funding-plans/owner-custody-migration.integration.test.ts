import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
import {
  applyMigration0076,
  authHeaders,
  seedOwnerCustodyBaseOrg,
} from "./owner-custody-test-fixture.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("T-INT-FUND-007 historical 111-CASH to 111-OWNER-CUSTODY migration", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const legacyOrg = `org-980-legacy-${randomUUID()}`;
  const legacyToken = `tok-980-${legacyOrg}`;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    await seedOwnerCustodyBaseOrg(pool, legacyOrg, legacyToken);
    await applyMigration0076(pool, legacyOrg);
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("dry-runs and commits controlled reclassification of historical 111-CASH entries linked to CASH-OWNER-CUSTODY", async () => {
    await pool.query(
      `insert into financial_accounts(organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,status,created_by,updated_by) values
         ($1,'l-bank','BANK-MAIN','bank','VCB','VND','112-BANK','VCB','active','owner-1','owner-1'),
         ($1,'l-cash','CASH-COMPANY','cash','Ket cong ty','VND','111-CASH',null,'active','owner-1','owner-1'),
         ($1,'l-custody','CASH-OWNER-CUSTODY','cash','Quy chu giu','VND','111-CASH',null,'active','owner-1','owner-1')`,
      [legacyOrg],
    );
    await pool.query(
      `insert into bank_transactions(organization_id,id,financial_account_id,fingerprint,booking_date,amount_minor,currency,description,state) values
         ($1,'l-tx-out','l-bank',repeat('a',64),'2026-08-02',-4000000,'VND','Transfer out','reconciled'),
         ($1,'l-tx-in','l-custody',repeat('b',64),'2026-08-02',4000000,'VND','Transfer in','reconciled')`,
      [legacyOrg],
    );
    await pool.query(
      `insert into journal_entries(organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by) values
         ($1,'lj-open','2026-08-01','Open','VND','posted',2,'owner-1',now(),'owner-1','seed',now(),'owner-1'),
         ($1,'lj-transfer','2026-08-02','Transfer','VND','posted',2,'owner-1',now(),'owner-1','seed',now(),'owner-1'),
         ($1,'lj-exp','2026-08-03','Custody exp','VND','posted',2,'owner-1',now(),'owner-1','seed',now(),'owner-1'),
         ($1,'lj-pi','2026-08-04','Custody pi','VND','posted',2,'owner-1',now(),'owner-1','seed',now(),'owner-1')`,
      [legacyOrg],
    );
    await pool.query(
      `insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions) values
         ($1,'lj-open',1,'111-CASH',2000000,null,'Company cash','{}'),
         ($1,'lj-open',2,'112-BANK',10000000,null,'Bank','{}'),
         ($1,'lj-open',3,'411-CAPITAL',null,12000000,'Capital','{}'),
         ($1,'lj-transfer',1,'111-CASH',4000000,null,'Custody in','{}'),
         ($1,'lj-transfer',2,'112-BANK',null,4000000,'Bank out','{}'),
         ($1,'lj-exp',1,'642-OPEX',1200000,null,'Exp','{}'),
         ($1,'lj-exp',2,'111-CASH',null,1200000,'Cash','{}'),
         ($1,'lj-pi',1,'642-OPEX',300000,null,'PI','{}'),
         ($1,'lj-pi',2,'111-CASH',null,300000,'Cash','{}')`,
      [legacyOrg],
    );
    await pool.query(
      `insert into internal_transfers(organization_id,id,state,currency,transfer_amount_minor,base_principal_amount_minor,transit_account_code,current_attempt_number,created_by)
       values ($1,'l-it-1','reconciled','VND',4000000,4000000,'113-TRANSIT',1,'owner-1')`,
      [legacyOrg],
    );
    await pool.query(
      `insert into internal_transfer_attempts(organization_id,id,transfer_id,attempt_number,state,posting_mode,outgoing_transaction_id,incoming_transaction_id,outgoing_journal_id,matched_by,matched_at,correlation_id,created_by)
       values ($1,'l-ita-1','l-it-1',1,'reconciled','direct','l-tx-out','l-tx-in','lj-transfer','owner-1',now(),'corr-1','owner-1')`,
      [legacyOrg],
    );
    await pool.query(
      `insert into expenses(organization_id,id,expense_class,state,payee_party_id,expense_date,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,funding_financial_account_id,journal_id,created_by)
       values ($1,'l-exp-1','receipt_backed','posted','SUP-1','2026-08-03','Custody exp','VND',1200000,0,1200000,'111-CASH','l-custody','lj-exp','owner-1')`,
      [legacyOrg],
    );
    await pool.query(
      `insert into commercial_documents(organization_id,id,type,state,document_number,fiscal_year,party_id,document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,funding_financial_account_id,journal_id,created_by)
       values ($1,'l-pi-1','purchase_invoice','paid','L-PI-1',2026,'SUP-1','2026-08-04','2026-08-04','VND',300000,0,300000,'111-CASH','l-custody','lj-pi','owner-1')`,
      [legacyOrg],
    );

    const dashBefore = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${legacyOrg}/reports/operating-dashboard?asOf=2026-08-31&startsOn=2026-08-01&endsOn=2026-08-31`,
      headers: authHeaders(legacyToken),
    });
    expect(dashBefore.json().data.financials.configurationWarnings).toContain(
      "owner_custody_ledger_migration_required",
    );

    const dryRun = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${legacyOrg}/funding-plans/owner-custody-migration/dry-run`,
      headers: authHeaders(legacyToken),
      payload: {},
    });
    expect(dryRun.statusCode, dryRun.body).toBe(201);
    const plan = dryRun.json().data;
    expect(plan).toMatchObject({
      dryRun: true,
      mutationCount: 0,
      reclassifiedCount: 3,
      totalDebitMinor: "5500000",
      totalCreditMinor: "5500000",
      beforeBalances: {
        companyCashMinor: "4500000",
        ownerCustodyCashMinor: "0",
        totalCash111Minor: "4500000",
      },
      afterBalances: {
        companyCashMinor: "2000000",
        ownerCustodyCashMinor: "2500000",
        totalCash111Minor: "4500000",
      },
    });

    const stale = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${legacyOrg}/funding-plans/owner-custody-migration/commit`,
      headers: authHeaders(legacyToken, "mig-stale"),
      payload: { planHash: "wrong-hash", reason: "Migrate custody cash" },
    });
    expect(stale.statusCode).toBe(409);

    const locked = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${legacyOrg}/funding-plans/owner-custody-migration/commit`,
      headers: authHeaders(legacyToken, "mig-locked"),
      payload: {
        planHash: plan.planHash,
        effectiveOn: "2026-09-15",
        reason: "Migrate in locked period",
      },
    });
    expect(locked.statusCode).toBe(409);

    const committed = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${legacyOrg}/funding-plans/owner-custody-migration/commit`,
      headers: authHeaders(legacyToken, "mig-commit-1"),
      payload: {
        planHash: plan.planHash,
        effectiveOn: "2026-08-15",
        reason: "Tach quy chu giu sang 111-OWNER-CUSTODY",
      },
    });
    expect(committed.statusCode, committed.body).toBe(201);
    expect(committed.json().data).toMatchObject({
      dryRun: false,
      reclassifiedCount: 3,
      totalDebitMinor: "5500000",
      totalCreditMinor: "5500000",
      afterBalances: {
        companyCashMinor: "2000000",
        ownerCustodyCashMinor: "2500000",
        totalCash111Minor: "4500000",
      },
      idempotencyReplayed: false,
    });

    const replay = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${legacyOrg}/funding-plans/owner-custody-migration/commit`,
      headers: authHeaders(legacyToken, "mig-commit-1"),
      payload: {
        planHash: plan.planHash,
        effectiveOn: "2026-08-15",
        reason: "Tach quy chu giu sang 111-OWNER-CUSTODY",
      },
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json().data.idempotencyReplayed).toBe(true);
    expect(replay.json().data.journalId).toBe(committed.json().data.journalId);

    const dryRunAfter = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${legacyOrg}/funding-plans/owner-custody-migration/dry-run`,
      headers: authHeaders(legacyToken),
      payload: {},
    });
    expect(dryRunAfter.json().data.reclassifiedCount).toBe(0);

    const dashAfter = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${legacyOrg}/reports/operating-dashboard?asOf=2026-08-31&startsOn=2026-08-01&endsOn=2026-08-31`,
      headers: authHeaders(legacyToken),
    });
    expect(dashAfter.json().data.financials).toMatchObject({
      companyCashOnHandMinor: "2000000",
      ownerCashCustodyMinor: "2500000",
      ownerHoldsCompanyFundsMinor: "2500000",
      cashOnHandMinor: "4500000",
      companyFundsReconciliationGapMinor: "0",
    });
    expect(dashAfter.json().data.financials.configurationWarnings).not.toContain(
      "owner_custody_ledger_migration_required",
    );
  });
});
