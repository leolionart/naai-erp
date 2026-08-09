import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const suite = enabled ? describe : describe.skip;
suite("ERP-640 executive metric policy persistence", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const maker = "erp640-maker",
    approver = "erp640-approver",
    owner = "erp640-owner",
    h = (token = maker) => ({
      authorization: `Bearer ${token}`,
      "idempotency-key": crypto.randomUUID(),
    });
  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone)values('org-erp640','ERP 640','VND','Asia/Ho_Chi_Minh');
       insert into accounts(organization_id,code,name,root_type,is_control_account,allow_manual_posting)values
       ('org-erp640','411-CAPITAL','Capital','equity',false,true),('org-erp640','421-RE','Retained earnings','equity',false,true),
       ('org-erp640','341-OWNER','Owner loan','liability',false,true),('org-erp640','111-CASH','Cash','asset',false,true),
       ('org-erp640','511-REV','Revenue','revenue',false,true),('org-erp640','642-OPEX','Operating expense','expense',false,true);
       insert into financial_accounts(organization_id,id,code,display_name,kind,currency,ledger_account_code,status,version,created_by,updated_by)
       values('org-erp640','fa-cash','CASH','Cash','cash','VND','111-CASH','active',1,'fixture','fixture');
       insert into financial_statement_mapping_versions(organization_id,id,version,framework,state,effective_from,effective_to,change_reason,report_policy,created_by,approved_by,approved_at)
       values('org-erp640','erp640-fs',1,'TT133','approved','2026-01-01',null,'Fixture map','{"maxLedgerDifferenceMinor":"0","maxUnreviewedInputMinor":"0","maxUnresolvedItemCount":0,"maxMissingEvidenceCount":0}','maker','approver',now()),
             ('org-erp640','erp640-fs-opening',1,'TT133','approved','2025-01-01','2025-12-31','Historical opening map','{"maxLedgerDifferenceMinor":"0","maxUnreviewedInputMinor":"0","maxUnresolvedItemCount":0,"maxMissingEvidenceCount":0}','maker','approver',now());
       insert into financial_statement_mapping_lines(organization_id,mapping_id,mapping_version,line_number,statement,line_code,label,account_code,display_order,sign,cash_flow_class)
       values
       ('org-erp640','erp640-fs',1,1,'profit_and_loss','revenue','Revenue','511-REV',10,1,null),
       ('org-erp640','erp640-fs',1,2,'profit_and_loss','opex','Operating expense','642-OPEX',20,1,null),
       ('org-erp640','erp640-fs',1,3,'balance_sheet','cash','Cash','111-CASH',10,1,null),
       ('org-erp640','erp640-fs',1,4,'balance_sheet','capital','Capital','411-CAPITAL',20,1,null),
       ('org-erp640','erp640-fs',1,5,'balance_sheet','owner_loan','Owner loan','341-OWNER',30,1,null),
       ('org-erp640','erp640-fs',1,6,'cash_flow','operating','Operating','511-REV',10,1,'operating'),
       ('org-erp640','erp640-fs',1,7,'cash_flow','operating','Operating','642-OPEX',20,1,'operating'),
       ('org-erp640','erp640-fs-opening',1,1,'balance_sheet','cash','Cash','111-CASH',10,1,null),
       ('org-erp640','erp640-fs-opening',1,2,'balance_sheet','capital','Capital','411-CAPITAL',20,1,null),
       ('org-erp640','erp640-fs-opening',1,3,'balance_sheet','owner_loan','Owner loan','341-OWNER',30,1,null);
       insert into journal_entries(organization_id,id,journal_date,description,currency,state,posted_at,posted_by,approved_at,approved_by,approval_reason)
       values('org-erp640','opening','2026-01-01','Opening capital','VND','posted','2026-01-01T01:00:00Z','maker','2026-01-01T00:30:00Z','approver','Fixture'),
             ('org-erp640','revenue','2026-08-10','Revenue','VND','posted','2026-08-10T01:00:00Z','maker','2026-08-10T00:30:00Z','approver','Fixture'),
             ('org-erp640','expense','2026-08-20','Expense','VND','posted','2026-08-20T01:00:00Z','maker','2026-08-20T00:30:00Z','approver','Fixture');
       insert into journal_lines(organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)values
       ('org-erp640','opening',1,'111-CASH',100,null,'Cash','{}'),('org-erp640','opening',2,'411-CAPITAL',null,100,'Capital','{}'),
       ('org-erp640','revenue',1,'111-CASH',100,null,'Receipt','{}'),('org-erp640','revenue',2,'511-REV',null,100,'Revenue','{}'),
       ('org-erp640','expense',1,'642-OPEX',20,null,'Expense','{}'),('org-erp640','expense',2,'111-CASH',null,20,'Payment','{}');`,
    );
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles)values('org-erp640','m','maker',$1,'["finance_admin"]'),('org-erp640','a','approver',$2,'["approver"]'),('org-erp640','o','owner',$3,'["owner"]')`,
      [
        createHash("sha256").update(maker).digest("hex"),
        createHash("sha256").update(approver).digest("hex"),
        createHash("sha256").update(owner).digest("hex"),
      ],
    );
    app = await createApp();
    await app.init();
  });
  it("allows the owner to self-approve policy in owner-final mode", async () => {
    await pool.query(
      `insert into accounting_workflow_policies(organization_id,operating_mode,allow_self_approval,updated_by)
       values('org-erp640','solopreneur',false,'owner')
       on conflict(organization_id) do update set operating_mode='solopreneur',updated_by='owner',updated_at=now()`,
    );
    const body = {
      id: "erp640-owner-policy",
      effectiveFrom: "2026-01-01",
      formulaVersion: "executive-metrics-v1",
      formulaPolicy: {
        averageBurnMonths: 3,
        equityConsumedDenominator: "contributed_capital",
        runwayCashSemantic: "unrestricted_cash",
        runwayFlowClass: "operating",
        signedRevenueDenominator: true,
      },
      changeReason: "Solopreneur policy",
      mappings: [{ semantic: "unrestricted_cash", accountCode: "111-CASH" }],
    };
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp640/executive-metric-policies",
      headers: h(owner),
      payload: body,
    });
    expect(created.statusCode).toBe(201);
    const approved = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp640/executive-metric-policies/erp640-owner-policy/versions/1/approve",
      headers: h(owner),
      payload: { reason: "Owner reviewed canonical mappings" },
    });
    expect(approved.statusCode).toBe(201);
    expect(approved.json().data).toMatchObject({ state: "approved" });
  });
  afterAll(async () => {
    if (app) await app.close();
    await pool.end();
  });
  it("enforces maker-checker and idempotent policy versioning", async () => {
    const body = {
      id: "erp640-policy",
      effectiveFrom: "2026-01-01",
      formulaVersion: "executive-metrics-v1",
      formulaPolicy: {
        averageBurnMonths: 3,
        equityConsumedDenominator: "contributed_capital",
        runwayCashSemantic: "unrestricted_cash",
        runwayFlowClass: "operating",
        signedRevenueDenominator: true,
      },
      changeReason: "Initial policy",
      mappings: [
        { semantic: "contributed_capital", accountCode: "411-CAPITAL" },
        { semantic: "retained_earnings", accountCode: "421-RE" },
        { semantic: "unrestricted_cash", accountCode: "111-CASH" },
        { semantic: "owner_loan", accountCode: "341-OWNER" },
      ],
    };
    const key = "create-policy";
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp640/executive-metric-policies",
      headers: { ...h(), "idempotency-key": key },
      payload: body,
    });
    expect(first.statusCode).toBe(201);
    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp640/executive-metric-policies",
      headers: { ...h(), "idempotency-key": key },
      payload: body,
    });
    expect(replay.json().data.idempotencyReplayed).toBe(true);
    const self = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp640/executive-metric-policies/erp640-policy/versions/1/approve",
      headers: h(),
      payload: { reason: "Approve" },
    });
    expect(self.statusCode).toBe(409);
    expect(self.json().error.code).toBe("MAKER_CHECKER_VIOLATION");
    const ok = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp640/executive-metric-policies/erp640-policy/versions/1/approve",
      headers: h(approver),
      payload: { reason: "Independent review" },
    });
    expect(ok.statusCode).toBe(201);

    const partialPeriodVersion = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp640/executive-metric-policies",
      headers: h(),
      payload: {
        ...body,
        effectiveFrom: "2026-08-15",
        formulaVersion: "executive-metrics-v2-partial-period",
        changeReason: "Must not apply to a report period that starts before this version",
      },
    });
    expect(partialPeriodVersion.statusCode).toBe(201);
    expect(partialPeriodVersion.json().data.version).toBe(2);
    const partialPeriodApproval = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp640/executive-metric-policies/erp640-policy/versions/2/approve",
      headers: h(approver),
      payload: { reason: "Approve future partial-period version" },
    });
    expect(partialPeriodApproval.statusCode).toBe(201);
  });
  it("derives executive formulas from the controlled ledger cutoff", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp640/reports/executive-metrics?startsOn=2026-08-01&endsOn=2026-08-31&asOfInstant=2026-08-31T16%3A59%3A59.000Z&framework=TT133",
      headers: h(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      policyVersionId: "erp640-policy:1",
      grossMargin: { valueBps: 10_000 },
      operatingMargin: { valueBps: 8_000 },
      netMargin: { valueBps: 8_000 },
      ownerLoansMinor: "0",
      unrestrictedCashMinor: "180",
      averageOperatingNetCashFlowMinor: "26",
      netBurnMinor: "0",
      runwayStatus: "cash_generating",
      equityRollForward: { status: "tied_out", actualClosingEquityMinor: "180" },
    });
    expect(response.json().data.sourceBoundary.ledgerCutoffFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(response.json().data.sourceBoundary.sourceIds).toContain("opening");
  });
  it("uses the historical mapping for an opening balance before the report period", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp640/reports/executive-metrics?startsOn=2026-01-01&endsOn=2026-12-31&asOfInstant=2026-12-31T16%3A59%3A59.000Z&framework=TT133",
      headers: h(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.policyVersionId).toBe("erp640-policy:1");
  });
});
