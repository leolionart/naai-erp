import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-857 accountant identity metadata", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const organizationId = `org-accountant-${randomUUID()}`;
  const token = `accountant-token-${randomUUID()}`;
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    await pool.query(
      `insert into organizations(id,legal_name,base_currency,timezone)
       values($1,'Accountant Metadata Org','VND','Asia/Ho_Chi_Minh')`,
      [organizationId],
    );
    await pool.query(
      `insert into api_credentials(organization_id,id,actor_id,token_hash,roles)
       values($1,'accountant-metadata','accountant-metadata-actor',$2,'["finance_admin"]')`,
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

  const headers = (key: string) => ({
    authorization: `Bearer ${token}`,
    "idempotency-key": key,
  });

  it("writes organization and party identity fields within the authenticated organization", async () => {
    const organizationKey = Buffer.from(JSON.stringify({ id: organizationId })).toString(
      "base64url",
    );
    const organization = await app.inject({
      method: "PATCH",
      url: `/api/v1/organizations/${organizationId}/master-data/organizations/${organizationKey}`,
      headers: { ...headers("organization-identity"), "if-match": "1" },
      payload: { data: { tax_id: "0317654321", registered_address: "2 Le Loi, HCMC" } },
    });
    expect(organization.statusCode, organization.body).toBe(200);
    expect(organization.json().data.resource).toMatchObject({
      tax_id: "0317654321",
      registered_address: "2 Le Loi, HCMC",
    });

    const party = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/master-data/parties`,
      headers: headers("party-identity"),
      payload: {
        data: {
          id: "client-identity",
          display_name: "Client Identity",
          legal_name: "Client Identity Company Limited",
          normalized_tax_id: "0312345678",
          registered_address: "1 Nguyen Hue, HCMC",
          email: "accounting@example.vn",
          phone: "+84 28 1234 5678",
          website: "https://example.vn",
          status: "active",
        },
      },
    });
    expect(party.statusCode, party.body).toBe(201);
    expect(party.json().data.resource).toMatchObject({
      legal_name: "Client Identity Company Limited",
      email: "accounting@example.vn",
      website: "https://example.vn",
    });
  });

  it("rejects invalid optional identity values without creating a party", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/master-data/parties`,
      headers: headers("invalid-party-identity"),
      payload: {
        data: { id: "invalid-party", display_name: "Invalid", email: "invalid", status: "active" },
      },
    });
    expect(response.statusCode).toBe(400);
    const persisted = await pool.query(
      "select 1 from parties where organization_id=$1 and id='invalid-party'",
      [organizationId],
    );
    expect(persisted.rowCount).toBe(0);
  });
});
