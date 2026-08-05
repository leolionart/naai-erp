import { expect, test, type Page, type Route } from "@playwright/test";

const envelope = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp600",
  organizationId: "org-demo",
  data,
});
const reply = (route: Route, data: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(envelope(data)),
  });

const target = {
  schemaVersion: 1,
  id: "target-aug-v1",
  versionNumber: 1,
  periodKind: "month",
  startsOn: "2026-08-01",
  endsOn: "2026-08-31",
  actualBasis: "recognized",
  currency: "VND",
  amountMinor: "120000000",
  dimensions: { teamId: "studio", serviceLineCode: "web-app", ownerId: "owner-1" },
  state: "published",
  resourceVersion: "2",
  nextActions: ["supersede"],
};
const forecast = {
  schemaVersion: 1,
  id: "forecast-base-aug-v1",
  versionNumber: 1,
  scenario: "base",
  snapshotKind: "month_end",
  asOfDate: "2026-08-31",
  startsOn: "2026-08-01",
  endsOn: "2026-12-31",
  actualBasis: "recognized",
  currency: "VND",
  dimensions: {},
  state: "draft",
  resourceVersion: "1",
  nextActions: ["publish"],
};

async function install(page: Page) {
  const requests: Array<{ path: string; body?: unknown }> = [];
  await page.route("http://localhost:3001/api/v1/organizations/org-demo/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.includes("revenue-targets") && !path.includes("forecast-versions"))
      return route.continue();
    if (request.method() === "POST") {
      requests.push({ path, body: request.postDataJSON() });
      return reply(route, { resource: {}, mutation: {} });
    }
    if (path.endsWith("/target-aug-v1")) return reply(route, target);
    if (path.endsWith("/forecast-base-aug-v1")) return reply(route, forecast);
    if (path.endsWith("/revenue-targets")) return reply(route, { items: [target] });
    if (path.endsWith("/forecast-versions")) return reply(route, { items: [forecast] });
    return reply(route, { items: [] });
  });
  return requests;
}

test("@desktop manages target versions with create Dialog and URL filter Sheet", async ({
  page,
}) => {
  const requests = await install(page);
  await page.goto("http://localhost:3000/forecast/targets");
  await expect(page.getByRole("link", { name: "target-aug-v1" })).toBeVisible();
  await expect(page.getByText("120.000.000 ₫")).toBeVisible();

  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const filter = page.getByRole("dialog", { name: "Bộ lọc kế hoạch" });
  await filter.getByLabel("Actual basis").click();
  await page.getByRole("option", { name: "collected" }).click();
  await filter.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/actualBasis=collected/);

  await page.getByRole("button", { name: "Tạo target" }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo target version" });
  await dialog.getByLabel("Target amount (minor)").fill("150000000");
  await dialog.getByLabel("Starts on").fill("2026-09-01");
  await dialog.getByLabel("Ends on").fill("2026-09-30");
  await dialog.getByLabel("Reason").fill("September target review");
  await dialog.getByRole("button", { name: "Lưu draft" }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]?.body).toMatchObject({ amountMinor: "150000000", actualBasis: "collected" });
});

test("@desktop opens dedicated version pages and requires reason before supersede", async ({
  page,
}) => {
  const requests = await install(page);
  await page.goto("http://localhost:3000/forecast/targets/target-aug-v1");
  await expect(page.getByText("studio · web-app · owner-1")).toBeVisible();
  await page.getByRole("button", { name: "Supersede version" }).click();
  const alert = page.getByRole("alertdialog", { name: "Supersede version?" });
  await expect(alert.getByRole("button", { name: "Supersede" })).toBeDisabled();
  await alert.getByLabel("Reason").fill("Revised after owner review");
  await alert.getByRole("button", { name: "Supersede" }).click();
  await expect.poll(() => requests.at(-1)?.path).toContain("/target-aug-v1/supersede");
});

test("@desktop reviews forecast scenarios and publishes from a short Dialog", async ({ page }) => {
  const requests = await install(page);
  await page.goto("http://localhost:3000/forecast/scenarios");
  await expect(page.getByRole("link", { name: "forecast-base-aug-v1" })).toBeVisible();
  await page.getByRole("link", { name: "forecast-base-aug-v1" }).click();
  await expect(page.getByText("month_end · 2026-08-31")).toBeVisible();
  await page.getByRole("button", { name: "Publish version" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish version?" });
  await dialog.getByLabel("Reason").fill("Month-end planning review");
  await dialog.getByRole("button", { name: "Publish" }).click();
  await expect.poll(() => requests.at(-1)?.path).toContain("/forecast-base-aug-v1/publish");
});

test("@mobile planning queue and dedicated detail pages avoid body overflow", async ({ page }) => {
  await install(page);
  for (const path of [
    "/forecast/targets",
    "/forecast/scenarios",
    "/forecast/targets/target-aug-v1",
    "/forecast/scenarios/forecast-base-aug-v1",
  ]) {
    await page.goto(`http://localhost:3000${path}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
});
