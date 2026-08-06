import { expect, test, type Page, type Route } from "@playwright/test";

const envelope = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp600",
  organizationId: "naai",
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
const component = {
  schemaVersion: 1,
  id: "pipeline-1",
  forecastVersionId: forecast.id,
  section: "revenue",
  kind: "weighted_pipeline",
  direction: "increase",
  scheduledOn: "2026-09-15",
  amountMinor: "20000000",
  weightedAmountMinor: "10000000",
  probabilityBps: 5000,
  currency: "VND",
  source: {
    type: "opportunity",
    id: "opp-1",
    commercialRootType: "opportunity",
    commercialRootId: "commercial-1",
  },
  sourceSnapshot: { title: "Web app pipeline" },
  dimensions: {},
  state: "active",
  reviewState: "pending",
  createdBy: "maker-1",
  resourceVersion: "1",
  nextActions: ["update", "review", "exclude", "delete"],
};
const composition = {
  schemaVersion: 1,
  forecastVersionId: forecast.id,
  currency: "VND",
  actualBasis: "recognized",
  asOfDate: "2026-08-31",
  startsOn: "2026-08-01",
  endsOn: "2026-12-31",
  organizationId: "naai",
  formulaVersion: "forecast-composition-v1",
  actualToDateMinor: "40000000",
  projectedRevenueMinor: "90000000",
  projectedExpenseMinor: "44000000",
  projectedClosingCashMinor: "22000000",
  componentIds: [component.id],
  sourceIds: [component.source.id],
  confidenceFlags: [
    { code: "pending_manual_review", severity: "warning", componentIds: [component.id] },
  ],
  components: [component],
};

async function install(page: Page) {
  const requests: Array<{ path: string; body?: unknown }> = [];
  await page.route("http://localhost:3001/api/v1/organizations/naai/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.includes("revenue-targets") && !path.includes("forecast-versions"))
      return route.continue();
    if (["POST", "PATCH", "DELETE"].includes(request.method())) {
      requests.push({ path, body: request.postDataJSON() });
      return reply(route, { resource: {}, mutation: {} });
    }
    if (path.endsWith("/composition")) return reply(route, composition);
    if (path.endsWith("/components")) return reply(route, { items: [component] });
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

test("@desktop manages forecast composition with source Drawer and reasoned review", async ({
  page,
}) => {
  const requests = await install(page);
  await page.goto("http://localhost:3000/forecast/scenarios/forecast-base-aug-v1/composition");
  await expect(page.getByText("90.000.000 ₫")).toBeVisible();
  await expect(page.getByText("22.000.000 ₫")).toBeVisible();
  await page.getByRole("button", { name: "weighted_pipeline" }).click();
  const drawer = page.getByRole("dialog", { name: "Source drill-down" });
  await expect(drawer.getByText("opportunity · commercial-1")).toBeVisible();
  await drawer.getByRole("button", { name: "Đóng" }).click();

  await page.getByRole("button", { name: "Review" }).click();
  const alert = page.getByRole("alertdialog", { name: "Review component?" });
  await expect(alert.getByRole("button", { name: "Review" })).toBeDisabled();
  await alert.getByLabel("Reason").fill("Pipeline reviewed with account owner");
  await alert.getByRole("button", { name: "Review" }).click();
  await expect.poll(() => requests.at(-1)?.path).toContain("/pipeline-1/review");
});

test("@desktop creates a forecast component and persists URL filters", async ({ page }) => {
  const requests = await install(page);
  await page.goto("http://localhost:3000/forecast/scenarios/forecast-base-aug-v1/composition");
  await page.getByRole("button", { name: "Bộ lọc" }).click();
  const filter = page.getByRole("dialog", { name: "Bộ lọc forecast components" });
  await filter.getByLabel("Section").click();
  await page.getByRole("option", { name: "revenue" }).click();
  await filter.getByRole("button", { name: "Áp dụng" }).click();
  await expect(page).toHaveURL(/section=revenue/);

  await page.getByRole("button", { name: "Thêm cấu phần" }).click();
  const dialog = page.getByRole("dialog", { name: "Thêm forecast component" });
  await dialog.getByLabel("Kind").fill("committed_milestone");
  await dialog.getByLabel("Scheduled on").fill("2026-09-20");
  await dialog.getByLabel("Amount (minor)").fill("30000000");
  await dialog.getByLabel("Source type").fill("milestone");
  await dialog.getByLabel("Source ID").fill("milestone-1");
  await dialog.getByLabel("Commercial root type").fill("contract");
  await dialog.getByLabel("Commercial root ID").fill("contract-1");
  await dialog.getByLabel("Reason").fill("Accepted committed milestone");
  await dialog.getByRole("button", { name: "Lưu component" }).click();
  await expect.poll(() => requests.at(-1)?.path).toContain("/components");
});

test("@desktop edits and deletes forecast components through controlled dialogs", async ({
  page,
}) => {
  const requests = await install(page);
  await page.goto("http://localhost:3000/forecast/scenarios/forecast-base-aug-v1/composition");

  await page.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit forecast component" });
  await expect(edit.getByLabel("Amount (minor)")).toHaveValue("20000000");
  await edit.getByLabel("Amount (minor)").fill("24000000");
  await edit.getByLabel("Probability (bps)").fill("7500");
  await edit.getByLabel("Reason").fill("Pipeline value revised after client call");
  await edit.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect.poll(() => requests.at(-1)?.path).toContain("/components/pipeline-1");
  expect(requests.at(-1)?.body).toMatchObject({
    expectedResourceVersion: "1",
    amountMinor: "24000000",
    probabilityBps: 7500,
  });

  await page.getByRole("button", { name: "Delete" }).click();
  const remove = page.getByRole("alertdialog", { name: "Delete component?" });
  await expect(remove.getByRole("button", { name: "Delete" })).toBeDisabled();
  await remove.getByLabel("Reason").fill("Duplicate pipeline source");
  await remove.getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => requests.at(-1)?.path).toContain("/components/pipeline-1");
  expect(requests.at(-1)?.body).toMatchObject({
    expectedResourceVersion: "1",
    reason: "Duplicate pipeline source",
  });
});

test("@mobile planning queue and dedicated detail pages avoid body overflow", async ({ page }) => {
  await install(page);
  for (const path of [
    "/forecast/targets",
    "/forecast/scenarios",
    "/forecast/targets/target-aug-v1",
    "/forecast/scenarios/forecast-base-aug-v1",
    "/forecast/composition",
    "/forecast/scenarios/forecast-base-aug-v1/composition",
  ]) {
    await page.goto(`http://localhost:3000${path}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
});
