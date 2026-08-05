import { describe, expect, it, vi } from "vitest";
import { NaaiErpClient } from "./client.js";

describe("NAAI ERP JSON-first CLI client", () => {
  it.each([
    ["openapi", "http://api/api/v1/openapi.json"],
    ["capabilities", "http://api/api/v1/capabilities"],
  ])(
    "reads headless %s discovery without organization or master-data routing",
    async (action, url) => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ apiVersion: "v1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const client = new NaaiErpClient({ baseUrl: "http://api" }, fetchFn);
      await client.request("discovery", action);
      expect(fetchFn).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: "GET",
          headers: expect.not.objectContaining({ authorization: expect.anything() }),
        }),
      );
      expect(fetchFn.mock.calls[0]?.[0]).not.toContain("organizations");
      expect(fetchFn.mock.calls[0]?.[0]).not.toContain("master-data");
    },
  );

  it("still requires organization and token for business resources", async () => {
    const client = new NaaiErpClient({ baseUrl: "http://api" }, vi.fn());
    expect(() => client.request("internal-transfers", "list")).toThrow(
      "ORGANIZATION_AND_TOKEN_REQUIRED",
    );
  });

  it("calls REST API with scoped bearer and correlation headers", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ apiVersion: "v1", data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request("parties", "list");
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/api/v1/organizations/org-a/master-data/parties",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ authorization: "Bearer secret" }),
      }),
    );
  });

  it("sends mutation idempotency and optimistic version", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request("parties", "update", { data: { display_name: "Updated" } }, "key", "2");
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("/parties/key"),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({
          "if-match": "2",
          "idempotency-key": expect.any(String),
        }),
      }),
    );
  });

  it("has no database dependency", async () => {
    const packageJson = await import("../package.json", { with: { type: "json" } });
    expect(JSON.stringify(packageJson.default)).not.toContain("@naai-erp/database");
    expect(JSON.stringify(packageJson.default)).not.toContain("pg");
  });

  it("posts journals through the accounting API with idempotency", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { state: "posted" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request("journals", "post", undefined, "journal-1");
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/api/v1/organizations/org-a/journals/journal-1/post",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": expect.any(String) }),
      }),
    );
  });

  it("evaluates posting rules through the AI-native workflow endpoint", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { journal: {} } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request("posting-rules", "evaluate", { documentType: "expense" });
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/api/v1/organizations/org-a/posting-rules/evaluate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it.each(["approve", "reverse", "repost"])(
    "calls the journal %s workflow command",
    async (action) => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const client = new NaaiErpClient(
        { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
        fetchFn,
      );
      await client.request("journals", action, { reason: "Reviewed" }, "journal-1");
      expect(fetchFn).toHaveBeenCalledWith(
        `http://api/api/v1/organizations/org-a/journals/journal-1/${action}`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "idempotency-key": expect.any(String) }),
        }),
      );
    },
  );

  it.each(["close", "reopen"])("calls the fiscal period %s command", async (action) => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request("fiscal-periods", action, {
      fiscalYear: 2026,
      periodNumber: 8,
      targetState: action === "close" ? "soft_locked" : "open",
      reason: "Month-end control",
    });
    expect(fetchFn).toHaveBeenCalledWith(
      `http://api/api/v1/organizations/org-a/fiscal-periods/${action}`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reads Trial Balance and General Ledger through report query endpoints", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request("reports", "trial-balance", { from: "2026-01-01", to: "2026-01-31" });
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/api/v1/organizations/org-a/reports/trial-balance?from=2026-01-01&to=2026-01-31",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it.each(["dry-run", "create"])(
    "calls opening balance %s without database access",
    async (action) => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const client = new NaaiErpClient(
        { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
        fetchFn,
      );
      await client.request("opening-balances", action, { openingDate: "2026-01-01" });
      expect(fetchFn).toHaveBeenCalledWith(
        `http://api/api/v1/organizations/org-a/opening-balances${action === "dry-run" ? "/dry-run" : ""}`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "idempotency-key": expect.any(String) }),
        }),
      );
    },
  );

  it.each(["validate", "capture", "verify", "approve", "issue", "post", "cancel"])(
    "calls commercial document %s through its workflow API",
    async (action) => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const client = new NaaiErpClient(
        { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
        fetchFn,
      );
      await client.request("commercial-documents", action, { reason: "Reviewed" }, "doc-1");
      expect(fetchFn).toHaveBeenCalledWith(
        `http://api/api/v1/organizations/org-a/commercial-documents/doc-1/${action}`,
        expect.objectContaining({ method: "POST" }),
      );
    },
  );

  it.each(["submit", "mark-evidence-pending", "review", "approve", "reject", "post"])(
    "calls expense %s through the AI-native workflow API",
    async (action) => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const client = new NaaiErpClient(
        { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
        fetchFn,
      );
      await client.request(
        "expenses",
        action,
        { reason: "Reviewed" },
        "expense-1",
        undefined,
        "stable-retry-key",
      );
      expect(fetchFn).toHaveBeenCalledWith(
        `http://api/api/v1/organizations/org-a/expenses/expense-1/${action}`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "idempotency-key": "stable-retry-key" }),
        }),
      );
    },
  );

  it.each(["review", "download-url"])(
    "calls evidence %s through its controlled API",
    async (action) => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const client = new NaaiErpClient(
        { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
        fetchFn,
      );
      await client.request(
        "evidence",
        action,
        { reason: "Authorized" },
        "ev-1",
        undefined,
        "stable-key",
      );
      expect(fetchFn).toHaveBeenCalledWith(
        `http://api/api/v1/organizations/org-a/evidence/ev-1/${action}`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "idempotency-key": "stable-key" }),
        }),
      );
    },
  );

  it("replays a quarantined inbound event through the admin API", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request(
      "inbound-events",
      "replay",
      { reason: "Mapping corrected" },
      "msg-1",
      undefined,
      "replay-key",
    );
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/api/v1/organizations/org-a/inbound-events/msg-1/replay",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": "replay-key" }),
      }),
    );
  });

  it.each([
    ["outbound-events", "http://api/api/v1/organizations/org-a/outbound-events/outbox"],
    ["outbound-endpoints", "http://api/api/v1/organizations/org-a/outbound-events/endpoints"],
    ["outbound-deliveries", "http://api/api/v1/organizations/org-a/outbound-events/deliveries"],
  ])("lists %s through the REST admin contract", async (resource, expectedUrl) => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { items: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request(resource, "list");
    expect(fetchFn).toHaveBeenCalledWith(expectedUrl, expect.objectContaining({ method: "GET" }));
  });

  it("replays a dead-letter outbound event with a stable idempotency key", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { state: "pending" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request(
      "outbound-events",
      "replay",
      { reason: "Endpoint recovered" },
      "event-1",
      undefined,
      "outbound-replay-1",
    );
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/api/v1/organizations/org-a/outbound-events/outbox/event-1/replay",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": "outbound-replay-1" }),
      }),
    );
  });

  it.each([
    ["bank-accounts", "http://api/api/v1/organizations/org-a/banking/accounts"],
    ["bank-imports", "http://api/api/v1/organizations/org-a/banking/imports"],
    ["bank-transactions", "http://api/api/v1/organizations/org-a/banking/transactions"],
  ])("lists %s through the canonical banking API", async (resource, expectedUrl) => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { items: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request(resource, "list");
    expect(fetchFn).toHaveBeenCalledWith(expectedUrl, expect.objectContaining({ method: "GET" }));
  });

  it("dry-runs and imports versioned bank CSV through REST with stable idempotency", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: { valid: true, rows: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    const payload = {
      schemaVersion: 1,
      financialAccountId: "bank-1",
      adapterId: "generic-csv",
      adapterVersion: 1,
      filename: "statement.csv",
      csvText: "date,amount\n2026-08-05,-125000",
    };
    await client.request("bank-imports", "dry-run", payload, undefined, undefined, "bank-dry-1");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/banking/imports/dry-run",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": "bank-dry-1" }),
      }),
    );
    await client.request("bank-imports", "create", payload, undefined, undefined, "bank-import-1");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/banking/imports",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": "bank-import-1" }),
      }),
    );
  });

  it.each(["ignore", "mark-needs-review"])(
    "calls the bank transaction %s review branch without exposing reconcile",
    async (action) => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { state: action } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const client = new NaaiErpClient(
        { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
        fetchFn,
      );
      await client.request(
        "bank-transactions",
        action,
        { schemaVersion: 1, reason: "Reviewed" },
        "txn-1",
        undefined,
        "branch-1",
      );
      expect(fetchFn).toHaveBeenCalledWith(
        `http://api/api/v1/organizations/org-a/banking/transactions/txn-1/${action}`,
        expect.objectContaining({ method: "POST" }),
      );
    },
  );

  it("reads explainable reconciliation candidates", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { candidates: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request("bank-transactions", "candidates", undefined, "txn-1");
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/api/v1/organizations/org-a/banking/transactions/txn-1/candidates",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it.each(["suggest", "match", "reconcile", "unreconcile"])(
    "calls bank transaction %s with idempotency through the controlled reconciliation API",
    async (action) => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const client = new NaaiErpClient(
        { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
        fetchFn,
      );
      await client.request(
        "bank-transactions",
        action,
        { schemaVersion: 1, reason: "Reviewed" },
        "txn-1",
        undefined,
        `rec-${action}-1`,
      );
      expect(fetchFn).toHaveBeenCalledWith(
        `http://api/api/v1/organizations/org-a/banking/transactions/txn-1/${action}`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "idempotency-key": `rec-${action}-1` }),
        }),
      );
    },
  );

  it("lists and reads reconciliation drill-down without direct database access", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: { items: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request("reconciliations", "list");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/banking/reconciliations",
      expect.objectContaining({ method: "GET" }),
    );
    await client.request("reconciliations", "get", undefined, "rec-1");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/banking/reconciliations/rec-1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("reads internal-transfer candidates through the bank transaction API", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { items: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request("bank-transactions", "transfer-candidates", undefined, "txn-1");
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/api/v1/organizations/org-a/banking/transactions/txn-1/transfer-candidates",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates a headless internal transfer through the canonical REST contract", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "transfer-1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request(
      "internal-transfers",
      "create",
      {
        schemaVersion: 1,
        sourceTransactionId: "bank-out-101",
        principalAmountMinor: "100000000",
        basePrincipalAmountMinor: "100000000",
        currency: "VND",
        transitAccountId: "1388-TRANSIT",
        reason: "Own-account transfer",
      },
      undefined,
      undefined,
      "transfer-create-1",
    );
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/api/v1/organizations/org-a/banking/internal-transfers",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": "transfer-create-1" }),
      }),
    );
  });

  it.each(["match", "unmatch"])(
    "calls internal transfer %s with controlled mutation headers",
    async (action) => {
      const fetchFn = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const client = new NaaiErpClient(
        { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
        fetchFn,
      );
      await client.request(
        "internal-transfers",
        action,
        { schemaVersion: 1, reason: "Reviewed", expectedResourceVersion: "1" },
        "transfer-1",
        "1",
        `transfer-${action}-1`,
      );
      expect(fetchFn).toHaveBeenCalledWith(
        `http://api/api/v1/organizations/org-a/banking/internal-transfers/transfer-1/${action}`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "idempotency-key": `transfer-${action}-1`,
            "if-match": "1",
          }),
        }),
      );
    },
  );

  it("lists and reads internal-transfer history without a database path", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: { items: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request("internal-transfers", "list", { state: "pending_counterpart" });
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/banking/internal-transfers?state=pending_counterpart",
      expect.objectContaining({ method: "GET" }),
    );
    await client.request("internal-transfers", "get", undefined, "transfer-1");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/banking/internal-transfers/transfer-1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it.each(["ar-aging", "ap-aging"])(
    "lists and drills into %s through posted-ledger report routes",
    async (resource) => {
      const fetchFn = vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify({ data: { items: [] } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      );
      const client = new NaaiErpClient(
        { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
        fetchFn,
      );
      await client.request(resource, "list", {
        asOf: "2026-08-31",
        partyId: "party-1",
        bucket: "over_90",
        paymentStatus: "partially_paid",
        includeSettled: true,
        cursor: "cursor-1",
        limit: 25,
      });
      expect(fetchFn).toHaveBeenLastCalledWith(
        `http://api/api/v1/organizations/org-a/reports/${resource}?asOf=2026-08-31&partyId=party-1&bucket=over_90&paymentStatus=partially_paid&includeSettled=true&cursor=cursor-1&limit=25`,
        expect.objectContaining({ method: "GET" }),
      );
      await client.request(resource, "get", { asOf: "2026-08-31" }, "item-1");
      expect(fetchFn).toHaveBeenLastCalledWith(
        `http://api/api/v1/organizations/org-a/reports/${resource}/item-1?asOf=2026-08-31`,
        expect.objectContaining({ method: "GET" }),
      );
    },
  );
});
