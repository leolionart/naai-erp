import { expect, test, type Page, type Route } from "@playwright/test";

const envelope = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp-800-e2e",
  organizationId: "naai",
  data,
});

type ReviewFixture = {
  id: string;
  sourceIdentity: string;
  workbook: string;
  sheet: string;
  sourceRow: number;
  kind: string;
  proposedResourceType: string;
  proposedResourceId: string;
  status: string;
  reviewFlags: string[];
  rawData: Record<string, unknown>;
  mappedData: Record<string, unknown>;
  resolution: Record<string, unknown>;
  notes: string | null;
  resourceVersion: string;
};

const sourceRow: ReviewFixture = {
  id: "review-expense-zero-row-22",
  sourceIdentity: "finance-sha:Chi phí:22",
  workbook: "finance",
  sheet: "Chi phí",
  sourceRow: 22,
  kind: "expense",
  proposedResourceType: "expense",
  proposedResourceId: "expense-row-22",
  status: "pending_review",
  reviewFlags: ["generic_payee", "zero_value"],
  rawData: { transactionDate: "2025-01-01", gross: "0", personnel: "" },
  mappedData: { payeePartyId: "generic-supplier", amountMinor: "0" },
  resolution: {},
  notes: null,
  resourceVersion: "1",
};

async function install(page: Page) {
  let current = { ...sourceRow };
  await page.addInitScript(() => sessionStorage.setItem("naai-erp-admin-token", "erp-800-token"));
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/master-data/parties?limit=100",
    (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            items: [
              { id: "generic-supplier", display_name: "Generic Supplier" },
              { id: "supplier-confirmed", display_name: "Nhà cung cấp đã xác nhận" },
            ],
          }),
        ),
      }),
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/master-data/projects?limit=100",
    (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(envelope({ items: [] })),
      }),
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/workbook-imports/review-rows**",
    async (route: Route) => {
      if (route.request().method() === "PATCH") {
        expect(route.request().headers()["if-match"]).toBe("1");
        const body = route.request().postDataJSON() as {
          mappedData: Record<string, unknown>;
          status: string;
          notes: string;
        };
        expect(body.mappedData).toMatchObject({ payeePartyId: "supplier-confirmed" });
        current = { ...current, ...body, resourceVersion: "2" };
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(envelope(current)),
        });
      }
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(envelope({ items: [current] })),
      });
    },
  );
}

test("@desktop T-E2E-ERP-800-001 reviews and updates a staged workbook row", async ({ page }) => {
  await install(page);
  await page.goto("http://localhost:3000/imports/review");

  await expect(page.getByRole("heading", { level: 1, name: "Dữ liệu cần bổ sung" })).toBeVisible();
  await expect(page.getByText("Chi phí", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Thiếu nhà cung cấp")).toBeVisible();
  await expect(page.getByText("Giá trị bằng 0")).toBeVisible();

  await page.getByRole("button", { name: "Mở chi tiết" }).click();
  const editor = page.getByRole("dialog", { name: "Kiểm tra Chi phí · dòng 22" });
  await expect(editor.getByText("transactionDate")).toBeVisible();
  await expect(editor.getByText("2025-01-01")).toBeVisible();
  await editor.getByLabel("Nhà cung cấp / người nhận").click();
  await page.getByRole("option", { name: "Nhà cung cấp đã xác nhận" }).click();
  await editor.getByLabel("Ghi chú").fill("Đã xác nhận nhà cung cấp từ chứng từ gốc");
  await editor.getByLabel("Trạng thái review").click();
  await page.getByRole("option", { name: "Đã xác nhận" }).click();
  await editor.getByRole("button", { name: "Lưu thay đổi" }).click();

  await expect(page.getByText("Đã lưu dữ liệu bổ sung")).toBeVisible();
  await expect(editor.getByLabel("Trạng thái review")).toContainText("Đã xác nhận");
});

test("@mobile import review queue stays within the viewport", async ({ page }) => {
  await install(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/imports/review");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
