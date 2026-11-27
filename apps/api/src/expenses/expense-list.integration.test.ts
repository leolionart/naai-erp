import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-995/996 T-INT-READ-001 bounded expense list", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const organizationId = `org-read-${randomUUID()}`;
  const token = `read-owner-${organizationId}`;
  let app: Awaited<ReturnType<typeof createApp>>;
  const base = `/api/v1/organizations/${organizationId}/expenses`;
  const get = async (query: string) => {
    const response = await app.inject({
      method: "GET",
      url: `${base}${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
    return { status: response.statusCode, body: response.json() };
  };

  beforeAll(async () => {
    await pool.query(
      `insert into organizations (id,legal_name,base_currency,timezone)
       values ($1,'Read Org','VND','Asia/Ho_Chi_Minh')`,
      [organizationId],
    );
    await pool.query(
      `insert into accounts (organization_id,code,name,root_type,is_control_account,allow_manual_posting)
       values ($1,'642-OPEX','Operating expense','expense',false,true)`,
      [organizationId],
    );
    await pool.query(
      `insert into expenses (organization_id,id,expense_class,state,expense_date,business_purpose,currency,
         net_minor,vat_minor,gross_minor,counter_account_code,created_by)
       select $1,'E'||lpad(n::text,4,'0'),'non_documented','draft',
              date '2026-01-01' + (n % 40),'Purpose '||n,'VND',1000,0,1000,'642-OPEX','seed'
       from generate_series(1,150) n`,
      [organizationId],
    );
    await pool.query(
      `insert into api_credentials (organization_id,id,actor_id,token_hash,roles)
       values ($1,'read-owner','owner-user',$2,'["owner"]')`,
      [organizationId, createHash("sha256").update(token).digest("hex")],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("applies the default limit of 50 when no limit is sent", async () => {
    const { status, body } = await get("");
    expect(status).toBe(200);
    expect(body.data.items).toHaveLength(50);
    expect(body.data.hasMore).toBe(true);
    expect(body.meta.limitClamped).toBe(false);
  });

  it("clamps oversized limits and rejects invalid ones", async () => {
    const clamped = await get("?limit=100000");
    expect(clamped.body.data.items.length).toBeLessThanOrEqual(200);
    expect(clamped.body.meta.limitClamped).toBe(true);
    expect((await get("?limit=abc")).status).toBe(400);
    expect((await get("?limit=abc")).body.error.code).toBe("LIMIT_INVALID");
    expect((await get("?cursor=garbage")).body.error.code).toBe("CURSOR_INVALID");
  });

  it("walks every page with a stable order, no duplicates and no gaps", async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 20; guard += 1) {
      const { body } = await get(`?limit=40${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...body.data.items.map((item: { id: string }) => item.id));
      cursor = body.data.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(150);
    expect(new Set(seen).size).toBe(150);
  });

  it("returns counts and grouped summaries without records", async () => {
    expect((await get("?limit=1&includeTotal=true")).body.data.total).toBe(150);
    expect((await get("/count?state=draft")).body.data.total).toBe(150);
    const summary = await get("/summary?groupBy=month");
    expect(summary.body.data.groups.length).toBeGreaterThan(0);
    const total = summary.body.data.groups.reduce(
      (sum: number, group: { count: number }) => sum + group.count,
      0,
    );
    expect(total).toBe(150);
    expect((await get("/summary?groupBy=bogus")).status).toBe(400);
  });

  it("bounds the journals list and drops lines for view=summary", async () => {
    await pool.query(
      `insert into journal_entries (organization_id,id,journal_date,description,currency,state,created_by)
       select $1,'J'||lpad(n::text,4,'0'),date '2026-01-01' + (n % 20),'Seed '||n,'VND','draft','seed'
       from generate_series(1,120) n`,
      [organizationId],
    );
    const journals = async (query: string) => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/journals${query}`,
        headers: { authorization: `Bearer ${token}` },
      });
      return response.json();
    };
    const first = await journals("");
    expect(first.data.items).toHaveLength(50);
    expect(first.data.items[0]).toHaveProperty("lines");
    expect(first.data.items[0]).not.toHaveProperty("journal_date_key");
    const summary = await journals("?view=summary&limit=200");
    expect(summary.data.items).toHaveLength(120);
    expect(summary.data.items[0]).not.toHaveProperty("lines");
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await journals(`?limit=45${cursor ? `&cursor=${cursor}` : ""}`);
      for (const item of page.data.items) seen.add(item.id);
      cursor = page.data.nextCursor;
      if (!cursor) break;
    }
    expect(seen.size).toBe(120);
  });

  it("bounds the commercial documents list and supports summary view", async () => {
    await pool.query(
      `insert into parties (organization_id,id,display_name,status) values ($1,'CUST-1','Customer','active')`,
      [organizationId],
    );
    await pool.query(
      `insert into commercial_documents (organization_id,id,type,state,document_number,fiscal_year,party_id,
         document_date,due_date,currency,net_minor,tax_minor,gross_minor,control_account_code,created_by)
       select $1,'D'||lpad(n::text,4,'0'),'purchase_invoice','draft','N-'||n,2026,'CUST-1',
              date '2026-02-01' + (n % 25),date '2026-03-30','VND',1000,0,1000,'642-OPEX','seed'
       from generate_series(1,130) n`,
      [organizationId],
    );
    const docs = async (query: string) => {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/commercial-documents${query}`,
        headers: { authorization: `Bearer ${token}` },
      });
      return response.json();
    };
    expect((await docs("")).data.items).toHaveLength(50);
    const summary = await docs("?view=summary&limit=500");
    expect(summary.meta.limitClamped).toBe(true);
    expect(summary.data.items[0].lines).toEqual([]);
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await docs(`?limit=60${cursor ? `&cursor=${cursor}` : ""}`);
      for (const item of page.data.items) seen.add(item.id);
      cursor = page.data.nextCursor;
      if (!cursor) break;
    }
    expect(seen.size).toBe(130);
  });
});
