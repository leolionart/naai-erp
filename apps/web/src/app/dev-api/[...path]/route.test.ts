import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH, POST } from "./route";

const execFileSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ execFileSync: execFileSyncMock }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  execFileSyncMock.mockReset();
});

function configure() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NAAI_ERP_DEV_UPSTREAM_BASE_URL", "https://erp.naai.studio");
  vi.stubEnv("NAAI_ERP_DEV_UPSTREAM_TOKEN", "server-only-token");
  vi.stubEnv("NAAI_ERP_DEV_UPSTREAM_ORGANIZATION", "naai");
}

const projectContext = (organizationId: string, key = "encoded-project-key") => ({
  params: Promise.resolve({
    path: ["api", "v1", "organizations", organizationId, "master-data", "projects", key],
  }),
});

const context = (organizationId: string) => ({
  params: Promise.resolve({
    path: ["api", "v1", "organizations", organizationId, "master-data", "parties"],
  }),
});

describe("development production-data proxy", () => {
  it("loads server-only production configuration from Keychain when the managed dev server has no upstream env", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NAAI_ERP_DEV_UPSTREAM_BASE_URL", "");
    vi.stubEnv("NAAI_ERP_DEV_UPSTREAM_TOKEN", "");
    vi.stubEnv("NAAI_ERP_DEV_UPSTREAM_ORGANIZATION", "");
    execFileSyncMock.mockImplementation((_command, args: string[]) =>
      args.includes("naai-erp-organization") ? "naai\n" : "keychain-server-token\n",
    );
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { items: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(
      new Request("http://localhost:3000/dev-api/api/v1/organizations/naai/revenue-targets"),
      {
        params: Promise.resolve({
          path: ["api", "v1", "organizations", "naai", "revenue-targets"],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith(
      "https://erp.naai.studio/api/v1/organizations/naai/revenue-targets",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer keychain-server-token" }),
      }),
    );
  });

  it("proxies an organization-scoped GET with the server-only token", async () => {
    configure();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { items: [{ id: "client-1" }] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(
      new Request(
        "http://localhost:3000/dev-api/api/v1/organizations/naai/master-data/parties?limit=100",
      ),
      context("naai"),
    );

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith(
      "https://erp.naai.studio/api/v1/organizations/naai/master-data/parties?limit=100",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ authorization: "Bearer server-only-token" }),
        cache: "no-store",
      }),
    );
  });

  it("rejects a different organization and stays disabled outside development", async () => {
    configure();
    const wrongOrganization = await GET(
      new Request("http://localhost:3000/dev-api/api/v1/organizations/other/master-data/parties"),
      context("other"),
    );
    expect(wrongOrganization.status).toBe(503);

    vi.stubEnv("NODE_ENV", "production");
    const production = await GET(
      new Request("http://localhost:3000/dev-api/api/v1/organizations/naai/master-data/parties"),
      context("naai"),
    );
    expect(production.status).toBe(503);
  });

  it("forwards an explicitly enabled project-only PATCH with mutation guards", async () => {
    configure();
    vi.stubEnv("NAAI_ERP_DEV_ALLOW_PROJECT_UPDATES", "1");
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "project-1", state: "on_hold" } }), {
        status: 200,
        headers: { "content-type": "application/json", etag: '"4"' },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    const response = await PATCH(
      new Request(
        "http://localhost:3000/dev-api/api/v1/organizations/naai/master-data/projects/encoded-project-key",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "project-update-1",
            "if-match": "3",
          },
          body: JSON.stringify({ data: { state: "on_hold" } }),
        },
      ),
      projectContext("naai"),
    );

    expect(response.status).toBe(200);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      "https://erp.naai.studio/api/v1/organizations/naai/master-data/projects/encoded-project-key",
    );
    expect(init).toEqual(
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ data: { state: "on_hold" } }),
      }),
    );
    const forwardedHeaders = new Headers(init.headers);
    expect(forwardedHeaders.get("authorization")).toBe("Bearer server-only-token");
    expect(forwardedHeaders.get("idempotency-key")).toBe("project-update-1");
    expect(forwardedHeaders.get("if-match")).toBe("3");
  });

  it("keeps project PATCH disabled by default and rejects other resource paths", async () => {
    configure();
    const disabled = await PATCH(
      new Request(
        "http://localhost:3000/dev-api/api/v1/organizations/naai/master-data/projects/key",
        { method: "PATCH", body: "{}" },
      ),
      projectContext("naai", "key"),
    );
    expect(disabled.status).toBe(405);

    vi.stubEnv("NAAI_ERP_DEV_ALLOW_PROJECT_UPDATES", "1");
    const otherResource = await PATCH(
      new Request(
        "http://localhost:3000/dev-api/api/v1/organizations/naai/master-data/parties/key",
        { method: "PATCH", body: "{}" },
      ),
      {
        params: Promise.resolve({
          path: ["api", "v1", "organizations", "naai", "master-data", "parties", "key"],
        }),
      },
    );
    expect(otherResource.status).toBe(503);
  });

  it("allows only explicitly enabled expense creation and forwards idempotency", async () => {
    configure();
    const request = () =>
      new Request("http://localhost:3000/dev-api/api/v1/organizations/naai/expenses", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "expense-create-1" },
        body: JSON.stringify({ businessPurpose: "Chi phí vận hành" }),
      });
    const expenseContext = {
      params: Promise.resolve({
        path: ["api", "v1", "organizations", "naai", "expenses"],
      }),
    };
    expect((await POST(request(), expenseContext)).status).toBe(405);

    vi.stubEnv("NAAI_ERP_DEV_ALLOW_EXPENSE_CREATES", "1");
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "expense-1" } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    expect((await POST(request(), expenseContext)).status).toBe(201);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://erp.naai.studio/api/v1/organizations/naai/expenses");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("idempotency-key")).toBe("expense-create-1");
  });

  it("allows explicitly enabled commercial-document creation on its exact route", async () => {
    configure();
    vi.stubEnv("NAAI_ERP_DEV_ALLOW_DOCUMENT_CREATES", "1");
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "invoice-1" } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(
      new Request("http://localhost:3000/dev-api/api/v1/organizations/naai/commercial-documents", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "invoice-create-1" },
        body: JSON.stringify({ type: "sales_invoice", partyId: "client-1" }),
      }),
      {
        params: Promise.resolve({
          path: ["api", "v1", "organizations", "naai", "commercial-documents"],
        }),
      },
    );
    expect(response.status).toBe(201);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://erp.naai.studio/api/v1/organizations/naai/commercial-documents",
    );
  });
});
