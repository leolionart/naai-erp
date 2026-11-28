import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("T-INT-READ-001 keyset lists: bank transactions and statement imports", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = `org-bank-list-${randomUUID()}`;
  const token = `bank-list-${org}`;
  let app: Awaited<ReturnType<typeof createApp>>;
  const base = `/api/v1/organizations/${org}`;
  const get = async (path: string) => {
    const response = await app.inject({
      method: "GET",
      url: `${base}${path}`,
      headers: { authorization: `Bearer ${token}` },
    });
    return { status: response.statusCode, body: response.json() };
  };
  const walk = async (path: string, limit: number) => {
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 20; guard += 1) {
      const sep = path.includes("?") ? "&" : "?";
      const { body } = await get(`${path}${sep}limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`);
      const items = Array.isArray(body.data) ? body.data : body.data.items;
      ids.push(...items.map((item: { id: string }) => item.id));
      cursor = body.page?.nextCursor ?? body.data.nextCursor;
      if (!cursor) break;
    }
    return ids;
  };

  beforeAll(async () => {
    await pool.query(
      `insert into organizations (id,legal_name,base_currency,timezone) values ($1,'Bank List Org','VND','Asia/Ho_Chi_Minh')`,
      [org],
    );
    await pool.query(
      `insert into accounts (organization_id,code,name,root_type,is_control_account,allow_manual_posting)
       values ($1,'112','Bank','asset',false,true)`,
      [org],
    );
    await pool.query(
      `insert into financial_accounts (organization_id,id,code,kind,display_name,currency,ledger_account_code,created_by,updated_by,bank_code)
       values ($1,'fa-1','BANK-1','bank','Bank One','VND','112','seed','seed','VCB')`,
      [org],
    );
    await pool.query(
      `insert into bank_transactions (organization_id,id,financial_account_id,fingerprint,booking_date,amount_minor,currency,description)
       select $1,'T'||lpad(n::text,4,'0'),'fa-1',md5(n::text)||md5(n::text||'x'),date '2026-01-01' + (n % 30),1000,'VND','Payment '||n
       from generate_series(1,130) n`,
      [org],
    );
    await pool.query(
      `insert into bank_statement_imports (organization_id,id,financial_account_id,adapter_id,adapter_version,source_filename,
         content_sha256,row_count,imported_count,duplicate_count,rejected_count,created_by,correlation_id,created_at)
       select $1,'I'||lpad(n::text,4,'0'),'fa-1','generic-csv',1,'f'||n||'.csv',md5(n::text)||md5(n::text||'y'),1,1,0,0,'seed','c',
              now() - (n || ' minutes')::interval from generate_series(1,70) n`,
      [org],
    );
    await pool.query(
      `insert into api_credentials (organization_id,id,actor_id,token_hash,roles)
       values ($1,'bank-list-owner','owner-user',$2,'["owner"]')`,
      [org, createHash("sha256").update(token).digest("hex")],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("bounds bank transactions by default and walks every page without gaps", async () => {
    const first = await get("/banking/transactions");
    expect(first.body.data.items).toHaveLength(50);
    expect(first.body.data.hasMore).toBe(true);
    const ids = await walk("/banking/transactions", 40);
    expect(ids).toHaveLength(130);
    expect(new Set(ids).size).toBe(130);
  });

  it("filters, searches and counts bank transactions on the server", async () => {
    const searched = await get("/banking/transactions?q=Payment%2077&limit=200");
    expect(
      searched.body.data.items.map((item: { description: string }) => item.description),
    ).toContain("Payment 77");
    const dated = await get(
      "/banking/transactions?from=2026-01-05&to=2026-01-05&limit=200&includeTotal=true",
    );
    expect(dated.body.data.total).toBe(dated.body.data.items.length);
    const ascending = await get("/banking/transactions?sort=date_asc&limit=5");
    const dates = ascending.body.data.items.map(
      (item: { booking_date: string }) => item.booking_date,
    );
    expect([...dates].sort()).toEqual(dates);
    expect((await get("/banking/transactions?sort=bogus")).status).toBe(400);
  });

  it("walks statement imports ordered by creation time", async () => {
    const ids = await walk("/banking/imports", 30);
    expect(ids).toHaveLength(70);
    expect(new Set(ids).size).toBe(70);
    expect(ids[0]).toBe("I0001");
  });
});
