import { createHash, createHmac } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-330 inbound webhooks", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let app: Awaited<ReturnType<typeof createApp>>;
  const secret = "erp330-signing-secret";
  const adminToken = "erp330-admin";
  beforeAll(async () => {
    process.env.ERP330_WEBHOOK_SECRET = secret;
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "insert into organizations(id,legal_name,base_currency,timezone) values('org-hook','Webhook Org','VND','Asia/Ho_Chi_Minh')",
      );
      await client.query(
        "insert into accounts(organization_id,code,name,root_type) values('org-hook','111','Cash','asset'),('org-hook','642','Expense','expense')",
      );
      await client.query(
        "insert into parties(organization_id,id,display_name) values('org-hook','party-client','Webhook Client')",
      );
      await client.query(
        `insert into integration_sources(organization_id,id,public_id,name,actor_id,secret_ref,allowed_event_types,created_by)
         values('org-hook','source-1','public-source-1','Source 1','webhook-source-1','ERP330_WEBHOOK_SECRET','["expense.create"]','admin')`,
      );
      await client.query(
        `insert into api_credentials(organization_id,id,actor_id,token_hash,roles)
         values('org-hook','hook-admin','admin',$1,'["finance_admin"]')`,
        [createHash("sha256").update(adminToken).digest("hex")],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    delete process.env.ERP330_WEBHOOK_SECRET;
    await app?.close();
    await pool.end();
  });
  const expenseData = {
    id: "hook-expense-1",
    expenseClass: "non_documented",
    expenseDate: "2026-08-05",
    businessPurpose: "Webhook office cost",
    currency: "VND",
    netMinor: "1000000",
    vatMinor: "0",
    grossMinor: "1000000",
    counterAccountCode: "111",
    lines: [
      {
        description: "Office cost",
        netMinor: "1000000",
        vatMinor: "0",
        grossMinor: "1000000",
        postingAccountCode: "642",
        allocations: [{ id: "a1", amountMinor: "1000000", dimensions: { costCenter: "ADMIN" } }],
      },
    ],
  };
  const send = async (
    body: Record<string, unknown>,
    key: string,
    overrideSignature?: string,
    offset = 0,
  ) => {
    const raw = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000) + offset);
    const signature =
      overrideSignature ??
      `sha256=${createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`;
    return app.inject({
      method: "POST",
      url: "/api/v1/inbound/public-source-1/events",
      headers: {
        "content-type": "application/json",
        "x-naai-timestamp": timestamp,
        "x-naai-signature": signature,
        "idempotency-key": key,
      },
      payload: raw,
    });
  };

  it("creates exactly one draft for exact retries and conflicts on changed payload", async () => {
    const envelope = {
      schemaVersion: 1,
      eventType: "expense.create",
      externalId: "external-expense-1",
      occurredAt: "2026-08-05T10:00:00Z",
      data: expenseData,
    };
    const first = await send(envelope, "hook-key-1");
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json().data.state).toBe("processed");
    const replay = await send(envelope, "hook-key-1");
    expect(replay.json().data.idempotencyReplayed).toBe(true);
    const count = await pool.query(
      "select count(*)::int count from expenses where organization_id='org-hook' and id='hook-expense-1'",
    );
    expect(count.rows[0].count).toBe(1);
    const changed = await send(
      { ...envelope, data: { ...expenseData, businessPurpose: "Changed" } },
      "hook-key-1",
    );
    expect(changed.statusCode).toBe(409);
  });

  it("rejects bad or stale signatures without inbox mutation and quarantines authenticated invalid payload", async () => {
    const before = await pool.query(
      "select count(*)::int count from inbound_messages where organization_id='org-hook'",
    );
    expect(
      (await send({ schemaVersion: 1 }, "bad-signature", "sha256=" + "00".repeat(32))).statusCode,
    ).toBe(401);
    expect((await send({ schemaVersion: 1 }, "stale", undefined, -301)).statusCode).toBe(401);
    const after = await pool.query(
      "select count(*)::int count from inbound_messages where organization_id='org-hook'",
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
    const quarantine = await send(
      {
        schemaVersion: 99,
        eventType: "expense.create",
        externalId: "bad-schema",
        occurredAt: "2026-08-05T10:00:00Z",
        data: {},
      },
      "quarantine-key",
    );
    expect(quarantine.statusCode, quarantine.body).toBe(201);
    expect(quarantine.json().data.state).toBe("quarantined");
    const effects = await pool.query(
      "select count(*)::int count from expenses where organization_id='org-hook' and id='bad-schema'",
    );
    expect(effects.rows[0].count).toBe(0);
  });

  it("ERP-710: credit_note.create webhook event, idempotent upsert, and duplicate prevention", async () => {
    const invoiceKey = "hook-invoice-key";
    const invoicePayload = {
      schemaVersion: 1,
      eventType: "sales_invoice.create",
      externalId: "ext-invoice-1",
      occurredAt: "2026-08-05T10:00:00Z",
      data: {
        id: "hook-invoice-1",
        type: "sales_invoice",
        documentNumber: "PI-123",
        series: "PI",
        fiscalYear: 2026,
        partyId: "party-client",
        documentDate: "2026-08-05",
        dueDate: "2026-08-05",
        currency: "VND",
        netMinor: "100000",
        taxMinor: "0",
        grossMinor: "100000",
        controlAccountCode: "111",
        lines: [
          {
            description: "Office rent",
            quantity: 1,
            unitPriceMinor: "100000",
            netMinor: "100000",
            taxMinor: "0",
            grossMinor: "100000",
            primaryAccountCode: "642",
            allocations: [{ id: "a1", amountMinor: "100000", dimensions: { costCenter: "ADMIN" } }],
          },
        ],
      },
    };

    await pool.query(
      'update integration_sources set allowed_event_types = \'["expense.create","sales_invoice.create","purchase_invoice.create","credit_note.create"]\' where id=\'source-1\'',
    );

    const firstDoc = await send(invoicePayload, invoiceKey);
    expect(firstDoc.statusCode).toBe(201);
    expect(firstDoc.json().data.state).toBe("processed");

    const secondDoc = await send(invoicePayload, "different-http-key");
    expect(secondDoc.statusCode).toBe(201);
    expect(secondDoc.json().data.idempotencyReplayed).toBe(true);

    const updatedPayload = {
      ...invoicePayload,
      data: {
        ...invoicePayload.data,
        documentNumber: "PI-123-UPDATED",
      },
    };
    const updateResult = await send(updatedPayload, "another-key-3");
    expect(updateResult.statusCode).toBe(409);

    const checkDoc = await pool.query(
      "select document_number from commercial_documents where id='hook-invoice-1'",
    );
    expect(checkDoc.rows[0].document_number).toBe("PI-123");

    const purchaseResult = await send(
      {
        ...invoicePayload,
        eventType: "purchase_invoice.create",
        externalId: "ext-purchase-duplicate-source",
        data: {
          ...invoicePayload.data,
          id: "hook-purchase-duplicate-source",
          type: "purchase_invoice",
          documentNumber: "PI-DUP-SOURCE",
        },
      },
      "purchase-duplicate-source-key",
    );
    expect(purchaseResult.statusCode).toBe(201);
    expect(purchaseResult.json().data.state).toBe("processed");

    const duplicateExpensePayload = {
      schemaVersion: 1,
      eventType: "expense.create",
      externalId: "ext-expense-dup",
      occurredAt: "2026-08-05T10:00:00Z",
      data: {
        id: "hook-expense-dup",
        expenseClass: "non_documented",
        expenseDate: "2026-08-05",
        businessPurpose: "Duplicate rent",
        currency: "VND",
        netMinor: "100000",
        vatMinor: "0",
        grossMinor: "100000",
        counterAccountCode: "111",
        payeePartyId: "party-client",
        lines: [
          {
            description: "Duplicate",
            netMinor: "100000",
            vatMinor: "0",
            grossMinor: "100000",
            postingAccountCode: "642",
            allocations: [{ id: "a1", amountMinor: "100000", dimensions: { costCenter: "ADMIN" } }],
          },
        ],
      },
    };

    const duplicateRes = await send(duplicateExpensePayload, "exp-key");
    expect(duplicateRes.statusCode).toBe(201);
    expect(duplicateRes.json().data.state).toBe("quarantined");
    expect(duplicateRes.json().data.error.code).toBe("DUPLICATE_DOCUMENT");

    await pool.query("update commercial_documents set state='issued' where id='hook-invoice-1'");

    const creditNotePayload = {
      schemaVersion: 1,
      eventType: "credit_note.create",
      externalId: "ext-credit-1",
      occurredAt: "2026-08-05T10:00:00Z",
      data: {
        id: "hook-credit-1",
        type: "credit_note",
        documentNumber: "CN-1",
        series: "CN",
        fiscalYear: 2026,
        partyId: "party-client",
        documentDate: "2026-08-05",
        dueDate: "2026-08-05",
        currency: "VND",
        netMinor: "50000",
        taxMinor: "0",
        grossMinor: "50000",
        controlAccountCode: "111",
        originalDocumentId: "hook-invoice-1",
        reason: "Rent discount",
        lines: [
          {
            originalLineNumber: 1,
            description: "Discount",
            quantity: 1,
            unitPriceMinor: "50000",
            netMinor: "50000",
            taxMinor: "0",
            grossMinor: "50000",
            primaryAccountCode: "642",
            allocations: [{ id: "a1", amountMinor: "50000", dimensions: { costCenter: "ADMIN" } }],
          },
        ],
      },
    };

    const creditRes = await send(creditNotePayload, "credit-key-1");
    expect(creditRes.statusCode).toBe(201);
    expect(creditRes.json().data.state).toBe("processed");
  });
});
