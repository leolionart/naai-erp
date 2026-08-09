import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;
const client = url ? new pg.Client({ connectionString: url }) : undefined;
suite("T-DB-ERP-870-002 subscription constraints", () => {
  const rejected = async (sql: string) => {
    await client!.query("savepoint constraint_case");
    try {
      await client!.query(sql);
      throw new Error("EXPECTED_CONSTRAINT");
    } catch (error) {
      await client!.query("rollback to savepoint constraint_case");
      return error;
    } finally {
      await client!.query("release savepoint constraint_case");
    }
  };
  beforeAll(async () => {
    await client!.connect();
    await client!.query("begin");
    await client!.query(
      `insert into organizations(id,legal_name,base_currency,timezone)values('erp870-org-a','A','VND','Asia/Ho_Chi_Minh'),('erp870-org-b','B','VND','Asia/Ho_Chi_Minh');insert into users(id,email,display_name)values('erp870-user','erp870@example.test','Owner');insert into organization_memberships(organization_id,user_id)values('erp870-org-a','erp870-user');insert into parties(organization_id,id,display_name)values('erp870-org-a','erp870-client','Client'),('erp870-org-a','erp870-other','Other'),('erp870-org-b','erp870-client-b','Client B');insert into party_roles(organization_id,party_id,role)values('erp870-org-a','erp870-client','client'),('erp870-org-b','erp870-client-b','client');insert into projects(organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on)values('erp870-org-a','erp870-project','ERP870','Project','erp870-client','erp870-user','retainer','VND',0,'2026-01-01');insert into service_plans(organization_id,id,code,name,service_line_code,default_unit_price_minor,currency,recurrence_frequency,recurrence_interval,billing_day,created_by,updated_by)values('erp870-org-a','erp870-plan','PLAN','Plan','OPS',100,'VND','month',1,1,'test','test')`,
    );
  });
  afterAll(async () => {
    await client?.query("rollback");
    await client?.end();
  });
  it("enforces organization-scoped plan relationship", async () => {
    expect(
      await rejected(
        `insert into customer_service_subscriptions(organization_id,id,customer_party_id,service_plan_id,starts_on,quantity,unit_price_minor,currency,recurrence_frequency,recurrence_interval,billing_day,created_by,updated_by)values('erp870-org-b','bad','erp870-client-b','erp870-plan','2026-01-01',1,100,'VND','month',1,1,'test','test')`,
      ),
    ).toMatchObject({ code: "23503" });
  });
  it("rejects non-client and project/customer mismatch", async () => {
    expect(
      await rejected(
        `insert into customer_service_subscriptions(organization_id,id,customer_party_id,service_plan_id,starts_on,quantity,unit_price_minor,currency,recurrence_frequency,recurrence_interval,billing_day,created_by,updated_by)values('erp870-org-a','bad-role','erp870-other','erp870-plan','2026-01-01',1,100,'VND','month',1,1,'test','test')`,
      ),
    ).toMatchObject({ code: "23514" });
  });
  it("keeps optimistic versions positive", async () => {
    expect(
      await rejected(
        `insert into customer_service_subscriptions(organization_id,id,customer_party_id,service_plan_id,project_id,starts_on,quantity,unit_price_minor,currency,recurrence_frequency,recurrence_interval,billing_day,version,created_by,updated_by)values('erp870-org-a','bad-version','erp870-client','erp870-plan','erp870-project','2026-01-01',1,100,'VND','month',1,1,0,'test','test')`,
      ),
    ).toMatchObject({ code: "23514" });
  });
});
