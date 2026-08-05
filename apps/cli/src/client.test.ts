import { describe, expect, it, vi } from "vitest";
import { NaaiErpClient } from "./client.js";

describe("NAAI ERP JSON-first CLI client", () => {
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
});
