import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function configure() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NAAI_ERP_DEV_UPSTREAM_BASE_URL", "https://erp.naai.studio");
  vi.stubEnv("NAAI_ERP_DEV_UPSTREAM_TOKEN", "server-only-token");
  vi.stubEnv("NAAI_ERP_DEV_UPSTREAM_ORGANIZATION", "naai");
}

const context = (organizationId: string) => ({
  params: Promise.resolve({
    path: ["api", "v1", "organizations", organizationId, "master-data", "parties"],
  }),
});

describe("development production-data proxy", () => {
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
});
