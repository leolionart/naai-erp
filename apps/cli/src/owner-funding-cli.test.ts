import { describe, expect, it, vi } from "vitest";
import { NaaiErpClient } from "./client.js";
import { buildOwnerFundingCliPayload } from "./owner-funding-cli.js";

describe("ERP-983 owner-funding CLI routing", () => {
  it("routes owner-funding record, repay, list and get to canonical banking endpoint", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ apiVersion: "v1", data: { ok: true } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );

    await client.request(
      "owner-funding",
      "record",
      { bankTransactionId: "bt-1", reason: "Owner deposit" },
      undefined,
      undefined,
      "idem-of-1",
    );
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/api/v1/organizations/org-a/banking/owner-funding",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ bankTransactionId: "bt-1", reason: "Owner deposit" }),
        headers: expect.objectContaining({ "idempotency-key": "idem-of-1" }),
      }),
    );

    await client.request(
      "owner-funding",
      "repay",
      {
        financialAccountId: "bank-1",
        bookingDate: "2026-08-20",
        amountMinor: "3000000",
        reference: "REP-01",
        description: "Hoàn tiền chủ",
        reason: "Hoàn trả một phần",
      },
      undefined,
      undefined,
      "idem-rep-1",
    );
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/banking/owner-funding",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"movementType":"owner_repayment"'),
      }),
    );

    await client.listOwnerFunding({ movementType: "owner_funding", from: "2026-08-01" });
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/banking/owner-funding?movementType=owner_funding&from=2026-08-01",
      expect.objectContaining({ method: "GET" }),
    );

    await client.getOwnerFunding("ofm-1");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/banking/owner-funding/ofm-1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("builds CLI payloads from ergonomic flags", () => {
    expect(
      buildOwnerFundingCliPayload("record", {
        "account-id": "bank-1",
        date: "2026-08-15",
        "amount-minor": "10000000",
        reference: "UNC-01",
        description: "Nạp tiền",
        reason: "Tạm ứng vốn",
      }),
    ).toEqual({
      schemaVersion: 1,
      financialAccountId: "bank-1",
      bookingDate: "2026-08-15",
      amountMinor: "10000000",
      reference: "UNC-01",
      description: "Nạp tiền",
      reason: "Tạm ứng vốn",
    });
  });
});
