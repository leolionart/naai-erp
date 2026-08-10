import { expect, test, type Page, type Route } from "@playwright/test";

const envelope = (dimension: "payee" | "category") => ({
  apiVersion: "v1",
  requestId: `expense-${dimension}`,
  organizationId: "naai",
  data: {
    contractVersion: "2026-08-10",
    basis: "posted-expense-sources",
    dimension,
    startsOn: "2026-01-01",
    endsOn: "2026-08-31",
    seriesByCurrency: [
      {
        currency: "VND",
        months: ["2026-07", "2026-08"],
        groups: [
          {
            key: dimension === "payee" ? "party-host" : "HOSTING",
            name: dimension === "payee" ? "Nhà cung cấp Cloud" : "Hosting & máy chủ",
            monthly: [
              {
                month: "2026-08",
                netMinor: "10000000",
                vatMinor: "1000000",
                grossMinor: "11000000",
                amountMinor: "11000000",
                sourceCount: "2",
              },
            ],
            netMinor: "10000000",
            vatMinor: "1000000",
            grossMinor: "11000000",
            totalMinor: "11000000",
            sourceCount: "2",
            drillDown:
              dimension === "payee" ? { payeePartyId: "party-host" } : { categoryId: "HOSTING" },
          },
          {
            key: null,
            name: dimension === "payee" ? "Chưa xác định người nhận" : "Chưa xác định danh mục",
            monthly: [
              {
                month: "2026-07",
                netMinor: "500000",
                vatMinor: "0",
                grossMinor: "500000",
                amountMinor: "500000",
                sourceCount: "1",
              },
            ],
            netMinor: "500000",
            vatMinor: "0",
            grossMinor: "500000",
            totalMinor: "500000",
            sourceCount: "1",
            drillDown: {},
          },
        ],
        netMinor: "10500000",
        vatMinor: "1000000",
        grossMinor: "11500000",
        totalMinor: "11500000",
        sourceCount: "3",
        reconciliation: {
          groupTotalMinor: "11500000",
          sourceTotalMinor: "11500000",
          differenceMinor: "0",
        },
      },
    ],
  },
});

async function install(page: Page) {
  await page.addInitScript(() =>
    sessionStorage.setItem("naai-erp-admin-token", "expense-report-token"),
  );
  await page.route("**/auth/session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ authenticated: true }),
    }),
  );
  await page.route("**/api/v1/organizations/naai/reports/expenses/**", (route: Route) => {
    const dimension = route.request().url().includes("by-payee") ? "payee" : "category";
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(envelope(dimension)),
    });
  });
}

test("@desktop shows monthly expense reports and exact source drill-down", async ({ page }) => {
  await install(page);
  await page.goto(
    "http://localhost:3000/reports/expenses/by-payee?startsOn=2026-01-01&endsOn=2026-08-31",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Chi cho ai theo tháng" }),
  ).toBeVisible();
  await expect(page.getByText("Nhà cung cấp Cloud", { exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: /Chưa xác định người nhận/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /11.000.000/ })).toHaveAttribute(
    "href",
    "/expenses?startsOn=2026-08-01&endsOn=2026-08-31&payeePartyId=party-host",
  );
  await expect(page.getByRole("link", { name: /11.000.000/ }).locator("svg")).toHaveCount(0);

  await page.getByRole("radio", { name: "Quý" }).click();
  await expect(page).toHaveURL(/periodKind=quarter/);
  await expect(page).toHaveURL(/startsOn=2026-01-01/);
  await expect(page).toHaveURL(/endsOn=2026-03-31/);

  await page.getByRole("button", { name: "Bộ lọc" }).click();
  await page.getByLabel("Từ ngày").fill("2026-02-01");
  await page.getByLabel("Đến ngày").fill("2026-02-28");
  await page.getByRole("button", { name: "Áp dụng bộ lọc" }).click();
  await expect(page).toHaveURL(/startsOn=2026-02-01/);
  await expect(page).toHaveURL(/endsOn=2026-02-28/);

  await page.goto(
    "http://localhost:3000/reports/expenses/by-category?startsOn=2026-01-01&endsOn=2026-08-31",
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Chi theo danh mục và tháng" }),
  ).toBeVisible();
  await expect(page.getByText("Hosting & máy chủ", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Năm" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bộ lọc" })).toBeVisible();
  await expect(page.getByRole("link", { name: /11.000.000/ })).toHaveAttribute(
    "href",
    "/expenses?startsOn=2026-08-01&endsOn=2026-08-31&categoryId=HOSTING",
  );
});

test("@mobile keeps expense breakdown usable without document overflow", async ({ page }) => {
  await install(page);
  await page.goto(
    "http://localhost:3000/reports/expenses/by-category?startsOn=2026-01-01&endsOn=2026-08-31",
  );
  await expect(page.getByText("Hosting & máy chủ", { exact: true })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
});
