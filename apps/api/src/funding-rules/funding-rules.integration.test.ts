import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-976 funding rules & organization default", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = `org-fr-${randomUUID()}`;
  const ownerToken = `fr-owner-${org}`;
  const integrationToken = `fr-int-${org}`;
  let app: Awaited<ReturnType<typeof createApp>>;

  const headers = (token: string, key?: string, ifMatch?: string) => ({
    authorization: `Bearer ${token}`,
    ...(key ? { "idempotency-key": key } : {}),
    ...(ifMatch ? { "if-match": ifMatch } : {}),
  });

  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone) values($1,'Funding Rules Org','VND','Asia/Ho_Chi_Minh')`,
      [org],
    );
    await pool.query(
      `insert into fiscal_years(organization_id,year,starts_on,ends_on) values($1,2026,'2026-01-01','2026-12-31')`,
      [org],
    );
    await pool.query(
      `insert into fiscal_periods(organization_id,fiscal_year,period_number,starts_on,ends_on) values($1,2026,8,'2026-08-01','2026-08-31')`,
      [org],
    );
    await pool.query(
      `insert into accounts(organization_id,code,name,root_type) values
         ($1,'111-CASH','Tien mat','asset'),
         ($1,'112-BANK','Ngan hang','asset'),
         ($1,'331-AP','Phai tra NCC','liability'),
         ($1,'3388-OWNER','Phai tra chu','liability'),
         ($1,'642-OPEX','Chi phi QLDN','expense')`,
      [org],
    );
    await pool.query(
      `insert into financial_accounts(organization_id,id,code,kind,display_name,currency,ledger_account_code,status,created_by,updated_by) values
         ($1,'cash-owner-custody','CASH-OWNER-CUSTODY','cash','Quy chu giu ho','VND','111-CASH','active','owner-1','owner-1'),
         ($1,'cash-company','CASH-COMPANY','cash','Quy cong ty','VND','111-CASH','active','owner-1','owner-1')`,
      [org],
    );
    await pool.query(
      `insert into parties(organization_id,id,display_name,normalized_tax_id,status) values
         ($1,'SUP-PARKING','Bai xe','0110660175','active'),
         ($1,'SUP-OTHER','NCC khac','0300999888','active')`,
      [org],
    );
    await pool.query(
      `insert into party_roles(organization_id,party_id,role) values
         ($1,'SUP-PARKING','supplier'),($1,'SUP-OTHER','supplier')`,
      [org],
    );
    await pool.query(
      `insert into financial_statement_mapping_versions(organization_id,id,version,framework,state,effective_from,change_reason,created_by,approved_by,approved_at) values
         ($1,'map-bs',1,'TT133','approved','2026-01-01','Owner current mapping','owner-1','owner-1',now())`,
      [org],
    );
    await pool.query(
      `insert into financial_statement_mapping_lines(organization_id,mapping_id,mapping_version,line_number,statement,line_code,label,account_code,display_order,sign) values
         ($1,'map-bs',1,1,'balance_sheet','owner_current','Owner Current','3388-OWNER',10,1)`,
      [org],
    );
    const ownerHash = createHash("sha256").update(ownerToken).digest("hex");
    const intHash = createHash("sha256").update(integrationToken).digest("hex");
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles) values
         ($1,'cred-owner','owner-1',$2,'["owner"]'),
         ($1,'cred-int','n8n-bot',$3,'["integration"]')`,
      [org, ownerHash, intHash],
    );
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("manages default & rules, tests payloads, and applies them at purchase-invoice ingestion", async () => {
    const defRes = await app.inject({
      method: "PUT",
      url: `/api/v1/organizations/${org}/funding-rules/default`,
      headers: headers(ownerToken, "fr-def-1"),
      payload: {
        defaultFunding: { type: "company_cash", financialAccountId: "cash-company" },
      },
    });
    expect(defRes.statusCode, defRes.body).toBe(200);
    expect(defRes.json().data.defaultFunding.defaultFunding).toEqual({
      type: "company_cash",
      financialAccountId: "cash-company",
    });

    const createRule = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/funding-rules`,
      headers: headers(ownerToken, "fr-rule-1"),
      payload: {
        id: "rule-parking",
        name: "Parking supplier to owner custody",
        priority: 10,
        match: { supplierTaxId: "0110660175" },
        target: { type: "owner_custody_cash", financialAccountId: "cash-owner-custody" },
      },
    });
    expect(createRule.statusCode, createRule.body).toBe(201);
    const ruleVersion = createRule.json().data.rule.version as string;

    // Test endpoint matches rule by supplierTaxId
    const testMatch = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/funding-rules/test`,
      headers: headers(integrationToken),
      payload: { supplierTaxId: "0110660175", grossMinor: "50000" },
    });
    expect(testMatch.statusCode).toBe(201);
    expect(testMatch.json().data).toMatchObject({
      source: "rule",
      resolvedFunding: { type: "owner_custody_cash", financialAccountId: "cash-owner-custody" },
    });

    // Ingest purchase invoice without explicit funding -> resolves via supplierTaxId rule
    const piRule = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents`,
      headers: headers(integrationToken, "pi-rule-1"),
      payload: {
        id: "pi-fr-1",
        type: "purchase_invoice",
        documentNumber: "PI-FR-1",
        fiscalYear: 2026,
        partyId: "SUP-PARKING",
        documentDate: "2026-08-10",
        dueDate: "2026-08-10",
        currency: "VND",
        netMinor: "50000",
        taxMinor: "0",
        grossMinor: "50000",
        controlAccountCode: "331-AP",
        lines: [
          {
            description: "Gui xe",
            quantity: "1",
            unitPriceMinor: "50000",
            netMinor: "50000",
            taxMinor: "0",
            grossMinor: "50000",
            primaryAccountCode: "642-OPEX",
            allocations: [{ id: "a1", amountMinor: "50000", dimensions: { costCenter: "ADMIN" } }],
          },
        ],
      },
    });
    expect(piRule.statusCode, piRule.body).toBe(201);
    const storedRule = await pool.query(
      `select funding_financial_account_id from commercial_documents where organization_id=$1 and id='pi-fr-1'`,
      [org],
    );
    expect(storedRule.rows[0]?.funding_financial_account_id).toBe("cash-owner-custody");

    // Ingest purchase invoice for non-matching supplier -> uses organization default (company_cash)
    const piDefault = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${org}/commercial-documents`,
      headers: headers(integrationToken, "pi-def-1"),
      payload: {
        id: "pi-fr-2",
        type: "purchase_invoice",
        documentNumber: "PI-FR-2",
        fiscalYear: 2026,
        partyId: "SUP-OTHER",
        documentDate: "2026-08-11",
        dueDate: "2026-08-11",
        currency: "VND",
        netMinor: "80000",
        taxMinor: "0",
        grossMinor: "80000",
        controlAccountCode: "331-AP",
        lines: [
          {
            description: "Van phong pham",
            quantity: "1",
            unitPriceMinor: "80000",
            netMinor: "80000",
            taxMinor: "0",
            grossMinor: "80000",
            primaryAccountCode: "642-OPEX",
            allocations: [{ id: "a2", amountMinor: "80000", dimensions: { costCenter: "ADMIN" } }],
          },
        ],
      },
    });
    expect(piDefault.statusCode, piDefault.body).toBe(201);
    const storedDef = await pool.query(
      `select funding_financial_account_id from commercial_documents where organization_id=$1 and id='pi-fr-2'`,
      [org],
    );
    expect(storedDef.rows[0]?.funding_financial_account_id).toBe("cash-company");

    // Update and delete rule
    const updated = await app.inject({
      method: "PATCH",
      url: `/api/v1/organizations/${org}/funding-rules/rule-parking`,
      headers: headers(ownerToken, "fr-rule-upd", ruleVersion),
      payload: { priority: 5 },
    });
    expect(updated.statusCode).toBe(200);
    const nextVersion = updated.json().data.rule.version as string;
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/organizations/${org}/funding-rules/rule-parking`,
      headers: headers(ownerToken, "fr-rule-del", nextVersion),
    });
    expect(deleted.statusCode).toBe(200);
  });
});
