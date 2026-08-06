import { afterEach, describe, expect, it } from "vitest";
import { apiBodyLimit, createApp, webOrigin } from "./bootstrap.js";

describe("API CORS bootstrap", () => {
  const apps: Awaited<ReturnType<typeof createApp>>[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("allows full workbook import payloads while validating overrides", () => {
    expect(apiBodyLimit({})).toBe(5 * 1024 * 1024);
    expect(apiBodyLimit({ API_BODY_LIMIT_BYTES: "8388608" })).toBe(8 * 1024 * 1024);
    expect(() => apiBodyLimit({ API_BODY_LIMIT_BYTES: "not-a-number" })).toThrow();
    expect(() => apiBodyLimit({ API_BODY_LIMIT_BYTES: "1024" })).toThrow();
  });

  it("defaults only development to the local web origin", () => {
    expect(webOrigin({ NODE_ENV: "development" })).toBe("http://localhost:3000");
    expect(webOrigin({ NODE_ENV: "test" })).toBeUndefined();
    expect(webOrigin({ NODE_ENV: "production" })).toBeUndefined();
    expect(webOrigin({ NODE_ENV: "production", WEB_ORIGIN: "https://erp.naai.studio" })).toBe(
      "https://erp.naai.studio",
    );
    expect(() => webOrigin({ NODE_ENV: "production", WEB_ORIGIN: "*" })).toThrow();
    expect(() =>
      webOrigin({ NODE_ENV: "production", WEB_ORIGIN: "https://erp.naai.studio/path" }),
    ).toThrow();
  });

  it("answers local development preflight with an explicit credentialed origin", async () => {
    const app = await createApp({ environment: { NODE_ENV: "development" } });
    apps.push(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/organizations/org-demo/master-data/parties",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toContain("OPTIONS");
    expect(response.headers["access-control-allow-headers"]?.toLowerCase()).toContain(
      "authorization",
    );
    expect(response.headers["access-control-allow-headers"]?.toLowerCase()).toContain(
      "content-type",
    );
  });

  it("does not open production CORS without an explicit origin", async () => {
    const app = await createApp({ environment: { NODE_ENV: "production" } });
    apps.push(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/organizations/org-demo/master-data/parties",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "GET",
      },
    });
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
