import { expect, test, type Page, type Route } from "@playwright/test";
const envelope = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp500",
  organizationId: "naai",
  data,
});
const reply = (route: Route, data: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(envelope(data)),
  });
function timesheet(state = "submitted", version = "1") {
  return {
    id: "timesheet-1",
    workerId: "worker-1",
    weekStartsOn: "2026-08-03",
    state,
    entries: [
      {
        id: "entry-1",
        workDate: "2026-08-05",
        mode: "allocation",
        minutes: 480,
        workClassification: "project",
        billingClassification: "billable",
        projectId: "project-web",
        description: "Web app development",
        appliedCost: {
          rateVersionId: "rate-1",
          currency: "VND",
          calculationVersion: 1,
          roundingPolicy: "half_up",
          costMinor: "4000000",
        },
      },
    ],
    adjustments: [],
    resourceVersion: version,
    nextActions: state === "submitted" ? ["approve", "reject"] : [],
    submittedBy: "worker-1",
  };
}
async function install(page: Page) {
  let current = timesheet();
  const bodies: Record<string, Record<string, unknown> | undefined> = {};
  await page.route("http://localhost:3001/api/v1/organizations/naai/time/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (req.method() === "GET" && path.endsWith("/timesheets"))
      return reply(route, { items: [current] });
    if (req.method() === "GET" && path.endsWith("/capacity-summary"))
      return reply(route, {
        items: [
          {
            workerId: "worker-1",
            startsOn: "2026-08-03",
            endsOn: "2026-08-09",
            availableMinutes: 2400,
            approvedMinutes: 480,
            billableMinutes: 480,
            nonBillableMinutes: 0,
            unallocatedMinutes: 1920,
          },
        ],
      });
    if (req.method() === "GET" && path.endsWith("/timesheet-1")) return reply(route, current);
    if (req.method() === "POST" && path.endsWith("/timesheets")) {
      bodies.create = req.postDataJSON();
      return reply(route, { resource: { ...current, state: "draft" }, mutation: {} });
    }
    if (req.method() === "POST" && path.endsWith("/timesheet-1/approve")) {
      bodies.approve = req.postDataJSON();
      current = timesheet("approved", "2");
      return reply(route, { resource: current, mutation: {} });
    }
    if (req.method() === "POST" && path.endsWith("/timesheet-1/reject")) {
      bodies.reject = req.postDataJSON();
      current = timesheet("rejected", "2");
      return reply(route, { resource: current, mutation: {} });
    }
    if (req.method() === "GET" && path.endsWith("/cost-rates"))
      return reply(route, {
        items: [
          {
            id: "rate-1",
            workerId: "worker-1",
            basis: "fully_loaded",
            currency: "VND",
            rateMinorPerHour: "500000",
            effectiveFrom: "2026-08-01",
            state: "draft",
            resourceVersion: "1",
            nextActions: ["approve"],
          },
        ],
      });
    if (req.method() === "POST" && path.endsWith("/cost-rates")) {
      bodies.rate = req.postDataJSON();
      return reply(route, { resource: {}, mutation: {} });
    }
    return reply(route, { items: [] });
  });
  return bodies;
}

test("@desktop timesheet queue, approval detail and explicit entry classifications", async ({
  page,
}) => {
  const bodies = await install(page);
  await page.goto("http://localhost:3000/timesheets?from=2026-08-03&to=2026-08-09");
  await expect(page.getByRole("link", { name: "worker-1" })).toBeVisible();
  await expect(page.getByText("40h 0m")).toBeVisible();
  await page.goto("http://localhost:3000/timesheets/approvals/timesheet-1");
  await expect(page.getByText("Web app development")).toBeVisible();
  await page.getByRole("button", { name: "approve" }).click();
  const approve = page.getByRole("dialog", { name: "Xác nhận approve" });
  await approve.getByLabel("Lý do").fill("Hours verified");
  await approve.getByRole("button", { name: "Xác nhận" }).click();
  expect(bodies.approve).toMatchObject({
    schemaVersion: 1,
    expectedResourceVersion: "1",
    reason: "Hours verified",
  });
});

test("@desktop creates a cost-rate version without editing historical rows", async ({ page }) => {
  const bodies = await install(page);
  await page.goto("http://localhost:3000/settings/cost-rates");
  await expect(page.getByRole("link", { name: "worker-1" })).toBeVisible();
  await page.getByRole("button", { name: "Tạo phiên bản rate" }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo cost rate" });
  await dialog.getByLabel("Worker ID").fill("worker-1");
  await dialog.getByLabel("Rate minor/hour").fill("600000");
  await dialog.getByLabel("Effective from").fill("2026-09-01");
  await dialog.getByLabel("Reason").fill("New effective rate");
  await dialog.getByRole("button", { name: "Tạo draft rate" }).click();
  expect(bodies.rate).toMatchObject({
    workerId: "worker-1",
    rateMinorPerHour: "600000",
    effectiveFrom: "2026-09-01",
  });
});

test("@mobile timesheet and cost-rate routes avoid body overflow", async ({ page }) => {
  await install(page);
  for (const path of ["/timesheets", "/timesheets/entries/new", "/settings/cost-rates"]) {
    await page.goto(`http://localhost:3000${path}`);
    await page.waitForLoadState("networkidle");
    const size = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      viewport: innerWidth,
    }));
    expect(size.body).toBeLessThanOrEqual(size.viewport + 1);
  }
});
