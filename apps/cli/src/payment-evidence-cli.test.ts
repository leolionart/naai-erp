import { describe, expect, it, vi } from "vitest";
import { NaaiErpClient } from "./client.js";

describe("NaaiErpClient payment evidence routes", () => {
  it("requests GET /reports/tax/payment-evidence-gaps with query parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ apiVersion: "v1", data: { status: "ready", items: [] } }),
    });
    const client = new NaaiErpClient(
      { baseUrl: "http://localhost:3001", organizationId: "org-1", token: "tok-1" },
      fetchMock as unknown as typeof fetch,
    );

    await client.request("payment-evidence-gaps", "get", {
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "http://localhost:3001/api/v1/organizations/org-1/reports/tax/payment-evidence-gaps?startsOn=2026-08-01&endsOn=2026-08-31",
    );
    expect(init.method).toBe("GET");
  });

  it("sends PATCH /expenses/:id/payment-evidence and /commercial-documents/:id/payment-evidence with If-Match and Idempotency-Key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ apiVersion: "v1", data: { paymentEvidenceMissing: false } }),
    });
    const client = new NaaiErpClient(
      { baseUrl: "http://localhost:3001", organizationId: "org-1", token: "tok-1" },
      fetchMock as unknown as typeof fetch,
    );

    await client.request(
      "expenses",
      "update-payment-evidence",
      { paymentMethod: "bank_transfer", paidOn: "2026-08-12", paymentEvidenceRef: "UNC-01" },
      "exp-1",
      "4",
      "idem-exp-1",
    );
    await client.request(
      "commercial-documents",
      "update-payment-evidence",
      { paymentMethod: "card", paidOn: "2026-08-12", paymentEvidenceRef: "POS-99" },
      "doc-1",
      "5",
      "idem-doc-1",
    );
    await client.request(
      "organization-workflow-policy",
      "update",
      { nonCashThresholdMinor: "5000000" },
      undefined,
      undefined,
      "idem-pol-1",
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "http://localhost:3001/api/v1/organizations/org-1/expenses/exp-1/payment-evidence",
    );
    expect(fetchMock.mock.calls[0]![1].method).toBe("PATCH");
    expect(fetchMock.mock.calls[0]![1].headers["if-match"]).toBe("4");
    expect(fetchMock.mock.calls[0]![1].headers["idempotency-key"]).toBe("idem-exp-1");

    expect(fetchMock.mock.calls[1]![0]).toBe(
      "http://localhost:3001/api/v1/organizations/org-1/commercial-documents/doc-1/payment-evidence",
    );
    expect(fetchMock.mock.calls[1]![1].method).toBe("PATCH");
    expect(fetchMock.mock.calls[2]![0]).toBe(
      "http://localhost:3001/api/v1/organizations/org-1/organization-workflow-policy",
    );
    expect(fetchMock.mock.calls[2]![1].method).toBe("PATCH");
  });
});
