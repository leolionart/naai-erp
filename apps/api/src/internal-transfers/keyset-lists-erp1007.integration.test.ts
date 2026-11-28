import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("T-INT-READ-002 keyset lists: ERP-1007 routes", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const org = `org-erp1007-${randomUUID().slice(0, 8)}`;
  const ownerToken = `erp1007-owner-${org}`;
  const viewerToken = `erp1007-viewer-${org}`;
  let app: Awaited<ReturnType<typeof createApp>>;
  const base = `/api/v1/organizations/${org}`;

  const get = async (path: string, token = ownerToken) => {
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
    for (let guard = 0; guard < 25; guard += 1) {
      const sep = path.includes("?") ? "&" : "?";
      const { status, body } = await get(
        `${path}${sep}limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      expect(status).toBe(200);
      const items = Array.isArray(body.data) ? body.data : body.data.items;
      ids.push(...items.map((item: { id: string }) => item.id));
      cursor = body.page?.nextCursor ?? body.data.nextCursor;
      if (!cursor) break;
    }
    return ids;
  };

  beforeAll(async () => {
    await pool.query(`insert into users (id,email,display_name) values ($1,$2,'ERP-1007 Owner')`, [
      `${org}-owner`,
      `${org}@example.test`,
    ]);
    await pool.query(
      `insert into organizations (id,legal_name,base_currency,timezone)
       values ($1,'ERP 1007 Keyset Org','VND','Asia/Ho_Chi_Minh')`,
      [org],
    );
    await pool.query(
      `insert into organization_memberships (organization_id,user_id) values ($1,$2)`,
      [org, `${org}-owner`],
    );
    await pool.query(
      `insert into api_credentials (organization_id,id,actor_id,token_hash,roles)
       values ($1,'cred-owner','owner-user',$2,'["owner","accountant"]'),
              ($1,'cred-viewer','viewer-user',$3,'["viewer"]')`,
      [
        org,
        createHash("sha256").update(ownerToken).digest("hex"),
        createHash("sha256").update(viewerToken).digest("hex"),
      ],
    );
    await pool.query(
      `insert into accounts (organization_id,code,name,root_type,is_control_account,allow_manual_posting)
       values ($1,'112','Bank','asset',false,true),
              ($1,'113','Transit','asset',false,true),
              ($1,'331','AP','liability',true,false),
              ($1,'642','Freelance','expense',false,true)`,
      [org],
    );
    await pool.query(
      `insert into financial_accounts (organization_id,id,code,kind,display_name,currency,ledger_account_code,created_by,updated_by,bank_code)
       values ($1,'fa-1','BANK-1','bank','Bank One','VND','112','seed','seed','VCB'),
              ($1,'fa-2','BANK-2','bank','Bank Two','VND','112','seed','seed','ACB')`,
      [org],
    );
    await pool.query(
      `insert into parties (organization_id,id,display_name,status)
       values ($1,'fl-1','Freelancer One','active')`,
      [org],
    );
    await pool.query(
      `insert into party_roles (organization_id,party_id,role) values ($1,'fl-1','freelancer')`,
      [org],
    );
    await pool.query(
      `insert into projects (organization_id,id,code,name,client_party_id,owner_user_id,contract_type,currency,budget_minor,starts_on,state)
       values ($1,'proj-1','PRJ1','Project One','fl-1',$2,'fixed_fee','VND',0,'2026-01-01','active')`,
      [org, `${org}-owner`],
    );
    await pool.query(
      `insert into journal_entries (organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)
       values ($1,'j-seed','2026-08-01','Seed journal','VND','posted',1,'seed',now(),'seed','Seed',now(),'seed')`,
      [org],
    );

    // 1. Seed 120 internal transfers (with duplicate created_at buckets to test id tiebreaker)
    await pool.query(
      `insert into bank_transactions (organization_id,id,financial_account_id,fingerprint,booking_date,amount_minor,currency,reference,description)
       select $1,'BT'||lpad(n::text,4,'0'),case when n % 2 = 0 then 'fa-1' else 'fa-2' end,
              md5(n::text)||md5(n::text||'bt'),date '2026-08-01' + (n % 20),-1000,'VND',
              'REF-'||n,'Transfer leg '||n
         from generate_series(1,120) n`,
      [org],
    );
    await pool.query(
      `insert into internal_transfers (organization_id,id,state,currency,transfer_amount_minor,base_principal_amount_minor,transit_account_code,current_attempt_number,version,created_by,created_at)
       select $1,'IT'||lpad(n::text,4,'0'),'pending_counterpart','VND',1000,1000,'113',1,1,'seed',
              timestamptz '2026-08-15T12:00:00Z' - ((n / 3) || ' minutes')::interval
         from generate_series(1,120) n`,
      [org],
    );
    await pool.query(
      `insert into internal_transfer_attempts (organization_id,id,transfer_id,attempt_number,state,posting_mode,outgoing_transaction_id,correlation_id,created_by)
       select $1,'ITA'||lpad(n::text,4,'0'),'IT'||lpad(n::text,4,'0'),1,'pending_counterpart','transit',
              'BT'||lpad(n::text,4,'0'),'corr-'||n,'seed'
         from generate_series(1,120) n`,
      [org],
    );

    // 2. Seed 120 project freelance payables
    await pool.query(
      `insert into expenses (organization_id,id,expense_class,state,payee_party_id,expense_date,freelance_due_date,business_purpose,currency,net_minor,vat_minor,gross_minor,counter_account_code,cit_state,vat_state,evidence_checklist,journal_id,version,created_by,approved_by,approved_at,posted_by,posted_at)
       select $1,'EXP'||lpad(n::text,4,'0'),'freelancer','posted','fl-1',date '2026-08-01',
              date '2026-08-01' + (n % 25),'Freelance task '||n,'VND',5000,0,5000,'331',
              'eligible','ineligible','{}','j-seed',1,'seed','seed',now(),'seed',now()
         from generate_series(1,120) n`,
      [org],
    );
    await pool.query(
      `insert into project_freelance_payables (organization_id,id,expense_id,project_id,freelancer_party_id,due_date,amount_minor,currency,journal_id,created_by)
       select $1,'PFP'||lpad(n::text,4,'0'),'EXP'||lpad(n::text,4,'0'),'proj-1','fl-1',
              date '2026-08-01' + (n % 25),5000,'VND','j-seed','seed'
         from generate_series(1,120) n`,
      [org],
    );

    // 3. Seed 120 report snapshots + 120 accountant exports
    await pool.query(
      `insert into report_snapshots (
         organization_id,id,version,report_kind,state,readiness,period_starts_on,period_ends_on,
         dimensions,accounting_basis,framework,currency,canonical_request,request_hash,
         canonical_result,result_hash,formula_versions,mapping_versions,ledger_cutoff,
         source_manifest,source_fingerprint,readiness_summary,unresolved_items,captured_by,captured_at
       )
       select $1,'SNAP'||lpad(n::text,4,'0'),1,'profit_and_loss','captured','final',
              date '2026-08-01',date '2026-08-31','{}'::jsonb,'accrual','TT133','VND',
              jsonb_build_object('seq',n),md5('req-'||n)||md5('req2-'||n),
              '{"currency":"VND"}'::jsonb,md5('res-'||n)||md5('res2-'||n),
              '{"pnl":"v1"}'::jsonb,'{}'::jsonb,
              jsonb_build_object(
                'throughDate','2026-08-31',
                'maxPostedAt','2026-08-31T16:59:59.000Z',
                'journalCount',0,
                'lineCount',0,
                'sourceFingerprint',md5('fp-'||n)||md5('fp2-'||n)
              ),
              '[]'::jsonb,md5('fp-'||n)||md5('fp2-'||n),
              '{"mappings":[]}'::jsonb,'[]'::jsonb,'seed',
              timestamptz '2026-08-31T18:00:00Z' - ((n / 2) || ' minutes')::interval
         from generate_series(1,120) n`,
      [org],
    );
    await pool.query(
      `insert into accountant_exports (
         organization_id,id,version,snapshot_id,snapshot_version,format,state,label,manifest,
         content,content_hash,size_bytes,media_type,filename,generated_by,generated_at
       )
       select $1,'EXPX'||lpad(n::text,4,'0'),1,'SNAP'||lpad(n::text,4,'0'),1,'csv','generated',
              'Export label '||n,
              jsonb_build_object('workbookHash',md5('wb-'||n)||md5('wb2-'||n),'isFinal',true),
              case when n % 2 = 0 then decode('616263','hex') else null end,
              md5('ch-'||n)||md5('ch2-'||n),3,'text/csv','export-'||n||'.csv','seed',
              timestamptz '2026-08-31T20:00:00Z' - ((n / 2) || ' minutes')::interval
         from generate_series(1,120) n`,
      [org],
    );

    // 4. Seed 120 workbook import review rows
    await pool.query(
      `insert into workbook_import_review_rows (
         organization_id,id,import_identity,source_identity,workbook,sheet,source_row,kind,
         proposed_resource_type,status,review_flags,raw_data,mapped_data,notes,created_by,updated_by,created_at
       )
       select $1,'WRR'||lpad(n::text,4,'0'),'imp-1','src:'||n,'finance','Chi phí',n,'expense',
              'purchase_invoice',case when n % 5 = 0 then 'approved'::workbook_import_review_status else 'pending_review'::workbook_import_review_status end,
              '["check"]'::jsonb,'{}'::jsonb,'{}'::jsonb,'Review note '||n,'seed','seed',
              timestamptz '2026-08-20T10:00:00Z' - ((n / 3) || ' minutes')::interval
         from generate_series(1,120) n`,
      [org],
    );

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("pages internal transfers in SQL and expands view only for page rows", async () => {
    const first = await get("/banking/internal-transfers?includeTotal=true");
    expect(first.status).toBe(200);
    expect(first.body.data.items).toHaveLength(50);
    expect(first.body.data.hasMore).toBe(true);
    expect(first.body.data.total).toBe(120);
    expect(first.body.data.items[0].attempts).toHaveLength(1);

    const ids = await walk("/banking/internal-transfers", 35);
    expect(ids).toHaveLength(120);
    expect(new Set(ids).size).toBe(120);

    const filtered = await get(
      "/banking/internal-transfers?financialAccountId=fa-1&includeTotal=true",
    );
    expect(filtered.body.data.total).toBe(60);

    const searched = await get("/banking/internal-transfers?q=Transfer%20leg%2077&limit=200");
    expect(searched.body.data.items.map((x: { id: string }) => x.id)).toContain("IT0077");

    const ascIds = await walk("/banking/internal-transfers?sort=date_asc", 50);
    expect(ascIds).toHaveLength(120);
    expect((await get("/banking/internal-transfers?sort=bogus")).status).toBe(400);
    expect((await get("/banking/internal-transfers?limit=abc")).status).toBe(400);
    expect((await get("/banking/internal-transfers?cursor=not-a-cursor")).status).toBe(400);
  });

  it("pages project freelance payables while preserving bare-array data and direct get", async () => {
    const first = await get("/project-freelance-payables?includeTotal=true");
    expect(first.status).toBe(200);
    expect(Array.isArray(first.body.data)).toBe(true);
    expect(first.body.data).toHaveLength(50);
    expect(first.body.page.hasMore).toBe(true);
    expect(first.body.page.total).toBe(120);

    const ids = await walk("/project-freelance-payables", 40);
    expect(ids).toHaveLength(120);
    expect(new Set(ids).size).toBe(120);

    // Direct get works beyond page 1
    const deep = await get("/project-freelance-payables/PFP0115");
    expect(deep.status).toBe(200);
    expect(deep.body.data.id).toBe("PFP0115");

    const searched = await get("/project-freelance-payables?q=Freelance%20task%2088&limit=200");
    expect(searched.body.data.map((x: { id: string }) => x.id)).toContain("PFP0088");

    const asc = await get("/project-freelance-payables?sort=date_asc&limit=10");
    const dueDates = asc.body.data.map((x: { dueDate: string }) => x.dueDate);
    expect([...dueDates].sort()).toEqual(dueDates);
    expect((await get("/project-freelance-payables?sort=invalid")).status).toBe(400);
  });

  it("pages report snapshots and accountant exports without gaps or duplicates", async () => {
    const firstSnap = await get("/report-snapshots?includeTotal=true");
    expect(firstSnap.status).toBe(200);
    expect(firstSnap.body.data.items).toHaveLength(50);
    expect(firstSnap.body.data.hasMore).toBe(true);
    expect(firstSnap.body.data.total).toBe(120);

    const snapIds = await walk("/report-snapshots", 45);
    expect(snapIds).toHaveLength(120);
    expect(new Set(snapIds).size).toBe(120);

    const snapSearch = await get("/report-snapshots?q=SNAP0099&limit=20");
    expect(snapSearch.body.data.items.map((x: { id: string }) => x.id)).toEqual(["SNAP0099"]);
    expect((await get("/report-snapshots?sort=wrong")).status).toBe(400);

    const firstExp = await get("/accountant-exports?includeTotal=true");
    expect(firstExp.status).toBe(200);
    expect(firstExp.body.data.items).toHaveLength(50);
    expect(firstExp.body.data.hasMore).toBe(true);
    expect(firstExp.body.data.total).toBe(120);

    const expIds = await walk("/accountant-exports", 45);
    expect(expIds).toHaveLength(120);
    expect(new Set(expIds).size).toBe(120);

    const expSearch = await get("/accountant-exports?q=export-42.csv&limit=20");
    expect(expSearch.body.data.items).toHaveLength(1);
    expect(expSearch.body.data.items[0]).toMatchObject({
      id: "EXPX0042",
      contentAvailable: true,
    });
    const expPruned = await get("/accountant-exports?q=export-43.csv&limit=20");
    expect(expPruned.body.data.items[0]).toMatchObject({
      id: "EXPX0043",
      contentAvailable: false,
    });
    expect((await get("/accountant-exports?sort=wrong")).status).toBe(400);
  });

  it("enforces RBAC first and pages workbook import review rows in SQL", async () => {
    expect((await get("/workbook-imports/review-rows?sort=wrong", viewerToken)).status).toBe(403);

    const first = await get("/workbook-imports/review-rows?includeTotal=true");
    expect(first.status).toBe(200);
    expect(first.body.data.items).toHaveLength(50);
    expect(first.body.data.hasMore).toBe(true);
    expect(first.body.data.total).toBe(120);

    const ids = await walk("/workbook-imports/review-rows", 40);
    expect(ids).toHaveLength(120);
    expect(new Set(ids).size).toBe(120);

    const approved = await get("/workbook-imports/review-rows?status=approved&includeTotal=true");
    expect(approved.body.data.total).toBe(24);

    const searched = await get("/workbook-imports/review-rows?q=Review%20note%20105&limit=20");
    expect(searched.body.data.items.map((x: { id: string }) => x.id)).toEqual(["WRR0105"]);
    expect((await get("/workbook-imports/review-rows?sort=bad")).status).toBe(400);
  });
});
