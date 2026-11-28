import { expect, test, type Page, type Route } from "@playwright/test";

type MockState = {
  tokenRequests: number;
  webhookCreateBodies: Array<Record<string, unknown>>;
  apiCredentials: Array<{
    kind: "api_credential";
    id: string;
    name: string | null;
    actorId: string;
    roles: string[];
    status: "active" | "revoked";
    autoRecord: boolean;
    isOwnerCredential: boolean;
    version: string;
  }>;
  webhookSources: Array<{
    kind: "webhook_source";
    id: string;
    publicId: string;
    name: string;
    actorId: string;
    secretRef: string;
    secretMode?: "managed" | "env";
    status: "active" | "revoked";
    allowedEventTypes: string[];
    autoRecord: boolean;
    version: string;
  }>;
};

async function installIntegrationMocks(page: Page): Promise<MockState> {
  const state: MockState = {
    tokenRequests: 0,
    webhookCreateBodies: [],
    apiCredentials: [
      {
        kind: "api_credential",
        id: "cred-owner-internal",
        name: "Internal Owner Login Session",
        actorId: "owner-session-actor",
        roles: ["owner"],
        status: "active",
        autoRecord: true,
        isOwnerCredential: true,
        version: "1",
      },
    ],
    webhookSources: [],
  };

  await page.route("**/auth/automation-token", (route) => {
    state.tokenRequests += 1;
    return route.fulfill({
      status: 410,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store, private" },
      body: JSON.stringify({
        error: {
          code: "OWNER_SESSION_TOKEN_RETIRED",
          message: "Retired",
        },
      }),
    });
  });

  const handleApiRoute = async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const pathname = new URL(req.url()).pathname;

    if (method === "GET" && pathname.endsWith("/integration-sources")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            operatingMode: "solopreneur",
            webhookSources: state.webhookSources,
            apiCredentials: state.apiCredentials,
          },
        }),
      });
    }

    if (method === "POST" && pathname.endsWith("/api-credentials")) {
      const body = (req.postDataJSON() ?? {}) as Record<string, unknown>;
      const created = {
        kind: "api_credential" as const,
        id: `cred-${state.apiCredentials.length + 1}`,
        name: String(body.name ?? "Service Key"),
        actorId: String(body.actorId ?? "claude-code-agent"),
        roles: Array.isArray(body.roles) ? body.roles.map(String) : ["accountant"],
        status: "active" as const,
        autoRecord: Boolean(body.autoRecord),
        isOwnerCredential: false,
        version: "1",
      };
      state.apiCredentials.push(created);
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            credential: created,
            secretToken: "naai_sk_e2e_one_time_secret",
          },
        }),
      });
    }

    if (method === "POST" && pathname.endsWith("/integration-sources")) {
      const body = (req.postDataJSON() ?? {}) as Record<string, unknown>;
      state.webhookCreateBodies.push(body);
      const created = {
        kind: "webhook_source" as const,
        id: `wh-${state.webhookSources.length + 1}`,
        publicId: "pub_paperless_ocr",
        name: String(body.name ?? "Paperless OCR"),
        actorId: String(body.actorId ?? "paperless-ocr"),
        secretRef: "managed",
        secretMode: "managed" as const,
        status: "active" as const,
        allowedEventTypes: ["purchase_invoice.create"],
        autoRecord: Boolean(body.autoRecord),
        version: "1",
      };
      state.webhookSources.push(created);
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            source: created,
            signingSecret: "naai_whsec_e2e_one_time_secret",
          },
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [] } }),
    });
  };

  await page.route("**/dev-api/**", handleApiRoute);
  await page.route("**/api/v1/organizations/**", handleApiRoute);

  return state;
}

test("@desktop /settings/automation manages self-service Service Keys, Webhooks, and AI-native discovery without session token leakage", async ({
  page,
}) => {
  const state = await installIntegrationMocks(page);

  await page.goto("/settings/automation");

  await expect(
    page.getByRole("heading", { name: "Kết nối tích hợp & Khóa dịch vụ" }),
  ).toBeVisible();
  await expect(page.getByText("Doanh nghiệp một người", { exact: true })).toBeVisible();

  // Internal owner session credential is strictly excluded from the Service Keys table
  await expect(page.getByText("Internal Owner Login Session")).toHaveCount(0);
  await expect(page.getByText("owner-session-actor")).toHaveCount(0);
  await expect(page.getByText(/Chưa có khóa kết nối dịch vụ nào/)).toBeVisible();

  // Create a Service Key and verify one-time secret banner lifecycle
  await page.getByRole("button", { name: "+ Tạo khóa kết nối" }).click();
  const keyDialog = page.getByRole("dialog", { name: "Tạo khóa kết nối dịch vụ" });
  await expect(keyDialog).toBeVisible();
  await keyDialog.getByLabel("Tên kết nối").fill("Claude Code Agent");
  await keyDialog.getByLabel("Bật tự động ghi sổ (autoRecord)").click();
  await keyDialog.getByRole("button", { name: "Khởi tạo khóa" }).click();

  const secretBanner = page.getByTestId("issued-secret-banner");
  await expect(secretBanner).toBeVisible();
  await expect(secretBanner).toContainText(
    "Khóa bí mật vừa khởi tạo (chỉ hiển thị một lần duy nhất)",
  );
  await expect(secretBanner).toContainText("naai_sk_e2e_one_time_secret");
  await expect(page.getByRole("cell", { name: "Claude Code Agent", exact: true })).toBeVisible();

  await secretBanner.getByRole("button", { name: "Đã lưu an toàn" }).click();
  await expect(page.getByTestId("issued-secret-banner")).toHaveCount(0);
  await expect(page.getByText("naai_sk_e2e_one_time_secret")).toHaveCount(0);

  // Create a self-service Webhook Source with zero server env var input
  await page.getByRole("button", { name: "+ Tạo nguồn Webhook" }).click();
  const webhookDialog = page.getByRole("dialog", { name: "Tạo nguồn Webhook đầu vào" });
  await expect(webhookDialog).toBeVisible();
  await expect(webhookDialog.getByLabel(/Biến môi trường|secretRef/i)).toHaveCount(0);
  await expect(webhookDialog.getByRole("textbox")).toHaveCount(2);
  await webhookDialog.getByLabel("Tên nguồn").fill("Paperless OCR");
  await webhookDialog.getByLabel("Bật tự động ghi sổ (autoRecord)").click();
  await webhookDialog.getByRole("button", { name: "Tạo nguồn Webhook" }).click();

  expect(state.webhookCreateBodies).toHaveLength(1);
  expect(state.webhookCreateBodies[0]).not.toHaveProperty("secretRef");

  await expect(secretBanner).toBeVisible();
  await expect(secretBanner).toContainText("naai_whsec_e2e_one_time_secret");
  await expect(secretBanner).toContainText("/api/v1/webhooks/inbound/pub_paperless_ocr");
  await secretBanner.getByRole("button", { name: "Đã lưu an toàn" }).click();
  await expect(page.getByText("naai_whsec_e2e_one_time_secret")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Paperless OCR", exact: true })).toBeVisible();
  await expect(page.getByText("Quản lý tự động", { exact: true })).toBeVisible();

  // Verify AI-Native Discovery Card
  await expect(
    page.getByText("Tự khám phá hợp đồng máy (AI-Native Discovery)", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("code", { hasText: "/api/v1/capabilities" })).toBeVisible();
  await expect(page.locator("code", { hasText: "/api/v1/openapi.json" })).toBeVisible();
  await expect(page.locator("code", { hasText: "naai-erp discovery capabilities" })).toBeVisible();

  expect(state.tokenRequests).toBe(0);
});

test("@mobile /settings/automation renders cleanly at 390px with zero horizontal overflow and zero session token calls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await installIntegrationMocks(page);

  await page.goto("/settings/automation");

  await expect(
    page.getByRole("heading", { name: "Kết nối tích hợp & Khóa dịch vụ" }),
  ).toBeVisible();
  await expect(
    page.getByText("Tự khám phá hợp đồng máy (AI-Native Discovery)", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("code", { hasText: "/api/v1/capabilities" })).toBeVisible();
  await expect(page.locator("code", { hasText: "/api/v1/openapi.json" })).toBeVisible();
  await expect(page.getByText("Internal Owner Login Session")).toHaveCount(0);

  expect(state.tokenRequests).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth + 1),
  );
});
