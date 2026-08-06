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

  it("routes ERP-630 financial statements, VAT, drilldown, and mapping workflows", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );

    const query = {
      startsOn: "2026-01-01",
      endsOn: "2026-01-31",
      asOfInstant: "2026-02-01T00:00:00Z",
      framework: "TT133",
      basis: "accrual",
    };
    await client.request("financial-statements", "profit-and-loss", query);
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/reports/financial-statements/profit-and-loss?startsOn=2026-01-01&endsOn=2026-01-31&asOfInstant=2026-02-01T00%3A00%3A00Z&framework=TT133&basis=accrual",
      expect.objectContaining({ method: "GET" }),
    );
    await client.request("financial-statements", "balance-sheet", query);
    expect(fetchFn).toHaveBeenLastCalledWith(
      expect.stringContaining("/reports/financial-statements/balance-sheet?"),
      expect.objectContaining({ method: "GET" }),
    );
    await client.request("financial-statements", "cash-flow", query);
    expect(fetchFn).toHaveBeenLastCalledWith(
      expect.stringContaining("/reports/financial-statements/cash-flow?"),
      expect.objectContaining({ method: "GET" }),
    );
    await client.request("vat-reconciliation", "get", query);
    expect(fetchFn).toHaveBeenLastCalledWith(
      expect.stringContaining("/reports/tax/vat-reconciliation?"),
      expect.objectContaining({ method: "GET" }),
    );
    await client.request("expense-exceptions", "get", {
      startsOn: "2026-01-01",
      endsOn: "2026-01-31",
      asOfInstant: "2026-02-01T00:00:00Z",
      state: "open",
    });
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/reports/tax/expense-exceptions?startsOn=2026-01-01&endsOn=2026-01-31&asOfInstant=2026-02-01T00%3A00%3A00Z&state=open",
      expect.objectContaining({ method: "GET" }),
    );
    await client.request("financial-statement-drilldown", "get", query, "profit_and_loss/revenue");
    expect(fetchFn).toHaveBeenLastCalledWith(
      expect.stringContaining(
        "/reports/financial-statements/drilldown?startsOn=2026-01-01&endsOn=2026-01-31&asOfInstant=2026-02-01T00%3A00%3A00Z&framework=TT133&basis=accrual&statement=profit_and_loss&lineCode=revenue",
      ),
      expect.objectContaining({ method: "GET" }),
    );

    await client.request("financial-statement-mappings", "list", {
      framework: "TT133",
      state: "approved",
    });
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/financial-statement-mappings?framework=TT133&state=approved",
      expect.objectContaining({ method: "GET" }),
    );
    await client.request(
      "financial-statement-mappings",
      "approve",
      { reason: "Reviewed" },
      "mapping-1",
      "3",
      "mapping-approve-1",
    );
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/financial-statement-mappings/mapping-1/versions/3/approve",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("routes ERP-640 executive metric configuration, ROI facts, and projections", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );

    await client.request("executive-metric-policies", "list");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/executive-metric-policies",
      expect.objectContaining({ method: "GET" }),
    );
    await client.request("executive-metric-policies", "get", { version: 2 }, "policy-1");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/executive-metric-policies/policy-1?version=2",
      expect.objectContaining({ method: "GET" }),
    );
    await client.request(
      "executive-metric-policies",
      "approve",
      { reason: "Reviewed" },
      "policy-1",
      "2",
      "approve-policy-1",
    );
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/executive-metric-policies/policy-1/versions/2/approve",
      expect.objectContaining({ method: "POST" }),
    );

    await client.request("roi-definitions", "get", { version: 3 }, "roi-project");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/roi-definitions/roi-project?version=3",
      expect.objectContaining({ method: "GET" }),
    );
    await client.request("roi-input-facts", "list", {
      definitionId: "roi-project",
      reviewState: "reviewed",
    });
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/roi-input-facts?definitionId=roi-project&reviewState=reviewed",
      expect.objectContaining({ method: "GET" }),
    );
    await client.request(
      "roi-input-facts",
      "review",
      { state: "reviewed", reason: "Source checked" },
      "fact-1",
    );
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/roi-input-facts/fact-1/review",
      expect.objectContaining({ method: "POST" }),
    );

    const reportQuery = {
      startsOn: "2026-01-01",
      endsOn: "2026-01-31",
      asOfInstant: "2026-02-01T00:00:00Z",
      framework: "TT133",
      projectId: "project-1",
    };
    await client.request("executive-metrics", "get", reportQuery);
    expect(fetchFn).toHaveBeenLastCalledWith(
      expect.stringContaining("/reports/executive-metrics?startsOn=2026-01-01"),
      expect.objectContaining({ method: "GET" }),
    );
    for (const projection of ["equity", "liquidity", "profitability", "returns", "roi"]) {
      await client.request("executive-metrics", projection, reportQuery);
      expect(fetchFn).toHaveBeenLastCalledWith(
        expect.stringContaining(`/reports/executive-metrics/${projection}?`),
        expect.objectContaining({ method: "GET" }),
      );
    }
  });

  it("routes ERP-650 snapshot and accountant export workflows", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request("report-snapshots", "list");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/report-snapshots",
      expect.objectContaining({ method: "GET" }),
    );
    await client.request("report-snapshots", "get", { version: 2 }, "snapshot-1");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/report-snapshots/snapshot-1?version=2",
      expect.objectContaining({ method: "GET" }),
    );
    await client.request("report-snapshots", "reproduce", undefined, "snapshot-1", "2");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/report-snapshots/snapshot-1/versions/2/reproduce",
      expect.objectContaining({ method: "POST" }),
    );
    await client.request("accountant-exports", "create", {
      snapshotId: "snapshot-1",
      snapshotVersion: 2,
      format: "xlsx",
      reportKind: "profit_and_loss",
    });
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/accountant-exports",
      expect.objectContaining({ method: "POST" }),
    );
    await client.request(
      "accountant-exports",
      "supersede",
      { reason: "Replaced" },
      "export-1",
      "3",
    );
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/accountant-exports/export-1/versions/3/supersede",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("downloads ERP-650 export bytes without JSON decoding", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([80, 75, 3, 4]), {
        status: 200,
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": 'attachment; filename="p-and-l.xlsx"',
        },
      }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    const file = await client.downloadAccountantExport("export-1", "2");
    expect([...file.content]).toEqual([80, 75, 3, 4]);
    expect(file.filename).toBe("p-and-l.xlsx");
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/api/v1/organizations/org-a/accountant-exports/export-1/versions/2/download",
      expect.objectContaining({ method: "GET" }),
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
    const fetchFn = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
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

  it.each([
    ["overhead-policies", "approve", "policy-1", "overhead-allocation-policies/policy-1/approve"],
    ["overhead-runs", "post", "run-1", "overhead-allocation-runs/run-1/post"],
    ["overhead-source-pools", "list", undefined, "overhead-source-pools"],
  ])("routes ERP-530 %s %s through public API", async (resource, action, key, suffix) => {
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
    await client.request(resource, action, { periodStart: "2026-08-01" }, key);
    expect(fetchFn.mock.calls[0]?.[0]).toContain(`/api/v1/organizations/org-a/${suffix}`);
    expect(fetchFn.mock.calls[0]?.[0]).not.toContain("master-data");
  });

  it.each([
    [
      "revenue-targets",
      "list",
      undefined,
      "revenue-targets?periodKind=month&actualBasis=recognized",
    ],
    ["forecast-versions", "publish", "forecast-1", "forecast-versions/forecast-1/publish"],
  ])("routes ERP-600 %s %s through planning API", async (resource, action, key, suffix) => {
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
      resource,
      action,
      action === "list"
        ? { periodKind: "month", actualBasis: "recognized" }
        : { schemaVersion: 1, expectedResourceVersion: "1", reason: "Publish" },
      key,
    );
    expect(fetchFn.mock.calls[0]?.[0]).toContain(`/api/v1/organizations/org-a/${suffix}`);
    expect(fetchFn.mock.calls[0]?.[0]).not.toContain("master-data");
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

  it("lists gets creates reviews and closes statement control sessions headlessly", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request("statement-sessions", "list", {
      financialAccountId: "bank-1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      state: "reviewed",
    });
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/banking/statement-sessions?financialAccountId=bank-1&periodStart=2026-08-01&periodEnd=2026-08-31&state=reviewed",
      expect.objectContaining({ method: "GET" }),
    );
    await client.request("statement-sessions", "get", undefined, "statement-1");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/banking/statement-sessions/statement-1",
      expect.objectContaining({ method: "GET" }),
    );
    await client.request(
      "statement-sessions",
      "create",
      { schemaVersion: 1, financialAccountId: "bank-1" },
      undefined,
      undefined,
      "statement-create-1",
    );
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/banking/statement-sessions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "idempotency-key": "statement-create-1" }),
      }),
    );
    for (const action of ["review", "close"]) {
      await client.request(
        "statement-sessions",
        action,
        { schemaVersion: 1, reason: "Controlled" },
        "statement-1",
        "2",
        `statement-${action}-1`,
      );
      expect(fetchFn).toHaveBeenLastCalledWith(
        `http://api/api/v1/organizations/org-a/banking/statement-sessions/statement-1/${action}`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "idempotency-key": `statement-${action}-1`,
            "if-match": "2",
          }),
        }),
      );
    }
  });

  it("creates a server-controlled suspense exception without resubmitting transactions", async () => {
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
      "statement-exceptions",
      "create",
      {
        schemaVersion: 1,
        kind: "suspense",
        bankTransactionId: "bank-1",
        amountMinor: "100",
        currency: "VND",
        ownerId: "finance-1",
        reviewDue: "2026-09-05",
        reason: "Needs review",
      },
      "statement-1",
      "2",
      "exception-create-1",
    );
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/api/v1/organizations/org-a/banking/statement-sessions/statement-1/exceptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "idempotency-key": "exception-create-1",
          "if-match": "2",
        }),
      }),
    );
  });

  it.each(["approve", "resolve", "reject"])(
    "%s statement suspense exception through a composite scoped key",
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
        "statement-exceptions",
        action,
        { schemaVersion: 1, reason: "Reviewed", resolutionReference: "rec-1" },
        "statement-1/exception-1",
        "3",
        `exception-${action}-1`,
      );
      expect(fetchFn).toHaveBeenCalledWith(
        `http://api/api/v1/organizations/org-a/banking/statement-sessions/statement-1/exceptions/exception-1/${action}`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "idempotency-key": `exception-${action}-1`,
            "if-match": "3",
          }),
        }),
      );
    },
  );

  it("rejects malformed statement exception composite keys before transport", () => {
    const fetchFn = vi.fn();
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    expect(() => client.request("statement-exceptions", "approve", {}, "exception-only")).toThrow(
      "<session-id>/<exception-id>",
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ["workers", "time/workers"],
    ["timesheets", "time/timesheets"],
    ["cost-rates", "time/cost-rates"],
    ["capacity-versions", "time/capacity-versions"],
    ["time-summary", "time/capacity-summary"],
  ])("lists %s through the canonical headless time API", async (resource, path) => {
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
    await client.request(resource, "list", { workerId: "worker-1", from: "2026-08-01" });
    expect(fetchFn).toHaveBeenCalledWith(
      `http://api/api/v1/organizations/org-a/${path}?workerId=worker-1&from=2026-08-01`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it.each(["submit", "approve", "reject", "revise", "lock", "mark-billed"])(
    "calls the timesheet %s lifecycle action with controlled mutation headers",
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
        "timesheets",
        action,
        { schemaVersion: 1, reason: "Reviewed", expectedResourceVersion: "2" },
        "sheet-1",
        "2",
        `sheet-${action}-1`,
      );
      expect(fetchFn).toHaveBeenCalledWith(
        `http://api/api/v1/organizations/org-a/time/timesheets/sheet-1/${action}`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "idempotency-key": `sheet-${action}-1`,
            "if-match": "2",
          }),
        }),
      );
    },
  );

  it("creates submits and approves append-only timesheet adjustments", async () => {
    const fetchFn = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request("timesheet-adjustments", "create", { schemaVersion: 1 }, "sheet-1");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/time/timesheets/sheet-1/adjustments",
      expect.objectContaining({ method: "POST" }),
    );
    for (const action of ["submit", "approve"]) {
      await client.request(
        "timesheet-adjustments",
        action,
        { schemaVersion: 1, reason: "Reviewed" },
        "sheet-1/adjustment-1",
      );
      expect(fetchFn).toHaveBeenLastCalledWith(
        `http://api/api/v1/organizations/org-a/time/timesheets/sheet-1/adjustments/adjustment-1/${action}`,
        expect.objectContaining({ method: "POST" }),
      );
    }
  });

  it.each(["approve", "retire"])("calls sensitive cost-rate %s", async (action) => {
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
      "cost-rates",
      action,
      { schemaVersion: 1, reason: "Finance review" },
      "rate-1",
    );
    expect(fetchFn).toHaveBeenCalledWith(
      `http://api/api/v1/organizations/org-a/time/cost-rates/rate-1/${action}`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it.each([
    ["project-costs", "project-costs"],
    ["project-cost-sources", "project-cost-sources/unallocated"],
    ["direct-cost-allocations", "direct-cost-allocations"],
  ])("lists %s through immutable source-linked cost routes", async (resource, path) => {
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
    await client.request(resource, "list", { projectId: "project-1", basis: "ledger" });
    expect(fetchFn).toHaveBeenCalledWith(
      `http://api/api/v1/organizations/org-a/${path}?projectId=project-1&basis=ledger`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it.each(["submit", "approve", "post", "reverse"])(
    "calls direct cost allocation %s with controlled mutation headers",
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
        "direct-cost-allocations",
        action,
        { schemaVersion: 1, expectedResourceVersion: "2", reason: "Reviewed" },
        "direct-1",
        "2",
        `direct-${action}-1`,
      );
      expect(fetchFn).toHaveBeenCalledWith(
        `http://api/api/v1/organizations/org-a/direct-cost-allocations/direct-1/${action}`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "idempotency-key": `direct-${action}-1`,
            "if-match": "2",
          }),
        }),
      );
    },
  );

  it.each([
    ["project-budgets", "project-budgets"],
    ["scope-changes", "scope-changes"],
    ["recognition-policies", "recognition-policies"],
    ["milestone-acceptances", "milestone-acceptances"],
    ["revenue-recognition-events", "revenue-recognition-events"],
  ])("lists %s through project economics APIs", async (resource, path) => {
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
    await client.request(resource, "list", { projectId: "project-1" });
    expect(fetchFn).toHaveBeenCalledWith(
      `http://api/api/v1/organizations/org-a/${path}?projectId=project-1`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it.each([
    ["project-budgets", "approve"],
    ["scope-changes", "approve"],
    ["recognition-policies", "retire"],
    ["milestone-acceptances", "accept"],
    ["revenue-recognition-events", "post"],
  ])("calls %s %s with idempotency and optimistic version", async (resource, action) => {
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
      resource,
      action,
      { schemaVersion: 1, expectedResourceVersion: "2", reason: "Reviewed" },
      "resource-1",
      "2",
      `${resource}-${action}`,
    );
    expect(fetchFn).toHaveBeenCalledWith(
      `http://api/api/v1/organizations/org-a/${resource}/resource-1/${action}`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "if-match": "2",
          "idempotency-key": `${resource}-${action}`,
        }),
      }),
    );
  });

  it("reads separate project revenue axes without combining recognized invoiced and collected", async () => {
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
    await client.request("project-revenue-axes", "get", { asOf: "2026-08-31" }, "project-1");
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/api/v1/organizations/org-a/project-revenue-position/project-1?asOf=2026-08-31",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("routes project profitability list filters to the report API", async () => {
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
    await client.request("project-profitability", "list", {
      startsOn: "2026-08-01",
      endsOn: "2026-08-31",
      groupBy: "client",
      confidenceCode: "overdue_ar",
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/api/v1/organizations/org-a/reports/project-profitability?startsOn=2026-08-01&endsOn=2026-08-31&groupBy=client&confidenceCode=overdue_ar",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("routes project profitability detail without falling through master data", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { projectId: "project-1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request(
      "project-profitability",
      "get",
      { startsOn: "2026-08-01", endsOn: "2026-08-31" },
      "project-1",
    );
    expect(fetchFn).toHaveBeenCalledWith(
      "http://api/api/v1/organizations/org-a/reports/project-profitability/projects/project-1?startsOn=2026-08-01&endsOn=2026-08-31",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("routes nested forecast component mutations and composition discovery", async () => {
    const fetchFn = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    await client.request(
      "forecast-components",
      "review",
      { schemaVersion: 1, expectedResourceVersion: "1", reason: "Reviewed" },
      "forecast-1/component-1",
      "1",
      "review-1",
    );
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/forecast-versions/forecast-1/components/component-1/review",
      expect.objectContaining({ method: "POST" }),
    );
    await client.request("forecast-composition", "get", undefined, "forecast-1");
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/forecast-versions/forecast-1/composition",
      expect.objectContaining({ method: "GET" }),
    );
    await client.request(
      "forecast-components",
      "list",
      { section: "revenue", sourceType: "milestone" },
      "forecast-1",
    );
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/forecast-versions/forecast-1/components?section=revenue&sourceType=milestone",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("routes aggregate performance comparisons and planning actual backfill", async () => {
    const fetchFn = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              actualVsRetainedForecast: {
                numeratorMinor: "120",
                denominatorMinor: "270",
                varianceMinor: "-150",
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const client = new NaaiErpClient(
      { baseUrl: "http://api", organizationId: "org-a", token: "secret" },
      fetchFn,
    );
    const report = await client.request("performance-comparisons", "get", {
      periodId: "CAL-2024-02",
      periodBasis: "calendar",
      actualBasis: "recognized",
      asOfInstant: "2024-02-15T16:59:59Z",
      teamId: "delivery",
    });
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/reports/performance-comparisons?periodId=CAL-2024-02&periodBasis=calendar&actualBasis=recognized&asOfInstant=2024-02-15T16%3A59%3A59Z&teamId=delivery",
      expect.objectContaining({ method: "GET" }),
    );
    expect(report).toMatchObject({
      data: { actualVsRetainedForecast: { varianceMinor: "-150" } },
    });
    await client.request(
      "planning-actual-facts",
      "backfill",
      {
        schemaVersion: 1,
        actualBasis: "recognized",
        from: "2024-02-01",
        to: "2024-02-29",
        reason: "Refresh",
      },
      undefined,
      undefined,
      "facts-1",
    );
    expect(fetchFn).toHaveBeenLastCalledWith(
      "http://api/api/v1/organizations/org-a/planning-actual-facts/backfill",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
