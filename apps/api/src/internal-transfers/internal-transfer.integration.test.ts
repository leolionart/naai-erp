import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const suite = enabled ? describe : describe.skip;
suite("ERP-420 internal transfers", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const token = "erp420-token",
    h = (k?: string) => ({
      authorization: `Bearer ${token}`,
      ...(k ? { "idempotency-key": k } : {}),
      "x-correlation-id": `corr-${k ?? "read"}`,
    });
  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone)values('org-erp420','ERP420','VND','Asia/Ho_Chi_Minh');insert into fiscal_years(organization_id,year,starts_on,ends_on)values('org-erp420',2026,'2026-01-01','2026-12-31');insert into fiscal_periods(organization_id,fiscal_year,period_number,starts_on,ends_on)values('org-erp420',2026,8,'2026-08-01','2026-08-31');insert into accounts(organization_id,code,name,root_type)values('org-erp420','112A','Bank A','asset'),('org-erp420','112B','Bank B','asset'),('org-erp420','113','Transfer transit','asset'),('org-erp420','642','Bank fee','expense');insert into financial_accounts(organization_id,id,code,kind,display_name,currency,ledger_account_code,bank_code,created_by,updated_by)values('org-erp420','fa','A','bank','A','VND','112A','A','finance','finance'),('org-erp420','fb','B','bank','B','VND','112B','B','finance','finance');insert into bank_transactions(organization_id,id,financial_account_id,fingerprint,booking_date,amount_minor,currency,reference,description)values('org-erp420','out','fa',repeat('1',64),'2026-08-05',-101,'VND','MOVE-1','Transfer plus fee'),('org-erp420','in','fb',repeat('2',64),'2026-08-06',100,'VND','MOVE-1','Transfer receipt');`,
    );
    await pool.query(
      "insert into api_credentials(organization_id,id,actor_id,token_hash,roles)values('org-erp420','cred','finance',$1,'[\"finance_admin\"]')",
      [createHash("sha256").update(token).digest("hex")],
    );
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });
  it("posts pending transit principal plus explicit fee then matches and reverses without transfer P&L", async () => {
    const candidates = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp420/banking/transactions/out/transfer-candidates",
      headers: h(),
    });
    expect(candidates.statusCode, candidates.body).toBe(200);
    expect(candidates.json().data).toMatchObject({
      outcome: "unique",
      selectedTransactionId: "in",
    });
    expect(candidates.json().data.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ transactionId: "in", eligible: true })]),
    );
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp420/banking/internal-transfers",
      headers: h("create"),
      payload: {
        schemaVersion: 1,
        id: "transfer-1",
        sourceTransactionId: "out",
        principalAmountMinor: "100",
        basePrincipalAmountMinor: "100",
        currency: "VND",
        transitAccountId: "113",
        postingMode: "transit",
        fee: {
          mode: "embedded",
          amountMinor: "1",
          baseAmountMinor: "1",
          expenseAccountId: "642",
          reason: "Bank fee",
        },
        reason: "Own account transfer",
      },
    });
    expect(create.statusCode, create.body).toBe(201);
    expect(create.json().data.transfer).toMatchObject({
      id: "transfer-1",
      state: "pending_counterpart",
      principalAmountMinor: "100",
      transitOutstandingMinor: "100",
    });
    const unavailableCandidates = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp420/banking/transactions/out/transfer-candidates",
      headers: h(),
    });
    expect(unavailableCandidates.statusCode).toBe(409);
    const match = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp420/banking/internal-transfers/transfer-1/match",
      headers: h("match"),
      payload: {
        schemaVersion: 1,
        counterpartTransactionId: "in",
        expectedResourceVersion: "1",
        reason: "Exact counterpart",
      },
    });
    expect(match.statusCode, match.body).toBe(201);
    expect(match.json().data.transfer).toMatchObject({
      state: "reconciled",
      transitOutstandingMinor: "0",
    });
    const balances = await pool.query(
      `select account_code,coalesce(sum(debit_minor),0)-coalesce(sum(credit_minor),0) balance from journal_lines l join journal_entries j on j.organization_id=l.organization_id and j.id=l.journal_id where l.organization_id='org-erp420'and j.state='posted'group by account_code`,
    );
    expect(
      Object.fromEntries(balances.rows.map((x) => [x.account_code, String(x.balance)])),
    ).toMatchObject({ "113": "0", "642": "1" });
    const un = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp420/banking/internal-transfers/transfer-1/unmatch",
      headers: h("unmatch"),
      payload: { schemaVersion: 1, expectedResourceVersion: "2", reason: "Wrong pairing" },
    });
    expect(un.statusCode, un.body).toBe(201);
    expect(un.json().data.transfer.state).toBe("unmatched");
    expect(un.json().data.transfer).toMatchObject({ currentAttemptNumber: 3 });
    expect(un.json().data.transfer.attempts).toHaveLength(3);
    expect(
      (
        await pool.query(
          "select count(*)::int count from journal_entries where organization_id='org-erp420'and reversal_of_id is not null",
        )
      ).rows[0].count,
    ).toBe(2);
  });

  it("accounts for a claimed separate fee, rejects invalid direct dates, and releases every claim on unmatch", async () => {
    await pool.query(
      `insert into bank_transactions(organization_id,id,financial_account_id,fingerprint,booking_date,amount_minor,currency,reference,description)values('org-erp420','out-separate','fa',repeat('3',64),'2026-08-07',-100,'VND','MOVE-2','Transfer principal'),('org-erp420','fee-separate','fa',repeat('4',64),'2026-08-07',-2,'VND','FEE-2','Transfer fee'),('org-erp420','in-separate','fb',repeat('5',64),'2026-08-08',100,'VND','MOVE-2','Transfer receipt'),('org-erp420','out-direct','fa',repeat('6',64),'2026-08-09',-100,'VND','MOVE-3','Direct source'),('org-erp420','in-direct','fb',repeat('7',64),'2026-08-10',100,'VND','MOVE-3','Direct destination'),('org-erp420','out-none','fa',repeat('8',64),'2026-08-11',-1000,'VND','MOVE-4','No eligible counterpart')`,
    );
    const ambiguous = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp420/banking/transactions/out-separate/transfer-candidates",
      headers: h(),
    });
    expect(ambiguous.statusCode, ambiguous.body).toBe(200);
    expect(ambiguous.json().data.outcome).toBe("ambiguous");
    const none = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp420/banking/transactions/out-none/transfer-candidates",
      headers: h(),
    });
    expect(none.statusCode, none.body).toBe(200);
    expect(none.json().data.outcome).toBe("none");
    expect(none.json().data.items.every((item: { eligible: boolean }) => !item.eligible)).toBe(
      true,
    );
    const missing = await app.inject({
      method: "GET",
      url: "/api/v1/organizations/org-erp420/banking/transactions/missing/transfer-candidates",
      headers: h(),
    });
    expect(missing.statusCode).toBe(404);
    const direct = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp420/banking/internal-transfers",
      headers: h("direct-date"),
      payload: {
        schemaVersion: 1,
        sourceTransactionId: "out-direct",
        destinationTransactionId: "in-direct",
        principalAmountMinor: "100",
        basePrincipalAmountMinor: "100",
        currency: "VND",
        transitAccountId: "113",
        postingMode: "direct",
        reason: "Dates must match",
      },
    });
    expect(direct.statusCode).toBe(422);
    expect(direct.json().error.code).toBe("INTERNAL_TRANSFER_DIRECT_DATE_MISMATCH");

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp420/banking/internal-transfers",
      headers: h("create-separate"),
      payload: {
        schemaVersion: 1,
        id: "transfer-separate",
        sourceTransactionId: "out-separate",
        destinationTransactionId: "in-separate",
        principalAmountMinor: "100",
        basePrincipalAmountMinor: "100",
        currency: "VND",
        transitAccountId: "113",
        postingMode: "transit",
        fee: {
          mode: "separate_transaction",
          transactionId: "fee-separate",
          amountMinor: "2",
          baseAmountMinor: "2",
          expenseAccountId: "642",
          reason: "Separate bank fee",
        },
        reason: "Own account transfer with separate fee",
      },
    });
    expect(create.statusCode, create.body).toBe(201);
    expect(create.json().data.transfer.attempts[0].journalIds).toHaveLength(3);
    expect(
      (
        await pool.query(
          "select count(*)::int count from internal_transfer_claims where organization_id='org-erp420' and transfer_id='transfer-separate'",
        )
      ).rows[0].count,
    ).toBe(3);

    const reused = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp420/banking/internal-transfers",
      headers: h("reuse-fee"),
      payload: {
        schemaVersion: 1,
        sourceTransactionId: "fee-separate",
        principalAmountMinor: "2",
        basePrincipalAmountMinor: "2",
        currency: "VND",
        transitAccountId: "113",
        postingMode: "transit",
        reason: "Must reject claimed fee",
      },
    });
    expect(reused.statusCode).toBe(409);

    const unmatch = await app.inject({
      method: "POST",
      url: "/api/v1/organizations/org-erp420/banking/internal-transfers/transfer-separate/unmatch",
      headers: h("unmatch-separate"),
      payload: { schemaVersion: 1, expectedResourceVersion: "1", reason: "Undo transfer" },
    });
    expect(unmatch.statusCode, unmatch.body).toBe(201);
    expect(unmatch.json().data.transfer.attempts[1].reversalJournalIds).toHaveLength(3);
    expect(
      (
        await pool.query(
          "select count(*)::int count from internal_transfer_claims where organization_id='org-erp420' and transfer_id='transfer-separate'",
        )
      ).rows[0].count,
    ).toBe(0);
    const reset = await pool.query(
      "select id,state from bank_transactions where organization_id='org-erp420' and id=any($1::text[]) order by id",
      [["out-separate", "in-separate", "fee-separate"]],
    );
    expect(reset.rows.every((row) => row.state === "needs_review")).toBe(true);
  });
});
