import { expect, test, type Page, type Route } from "@playwright/test";
const envelope = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp510",
  organizationId: "org-demo",
  data,
});
const reply = (r: Route, data: unknown) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(envelope(data)) });
async function install(page: Page) {
  const bodies: Record<string, Record<string, unknown> | undefined> = {};
  await page.route("http://localhost:3001/api/v1/organizations/org-demo/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (req.method() === "GET" && path.endsWith("/project-costs"))
      return reply(route, {
        items: [
          {
            id: "ledger-1",
            basis: "ledger",
            projectId: "project-web",
            costClass: "vendor_service",
            effectiveOn: "2026-08-05",
            amountMinor: "10000000",
            baseAmountMinor: "10000000",
            currency: "VND",
            drilldown: {
              sourceType: "purchase_invoice_allocation",
              sourceId: "invoice-1",
              evidenceIds: ["evidence-1"],
              sourceHref: "/documents?documentId=invoice-1",
              journalHref: "/accounting/journals?journalId=journal-1",
              evidenceHrefs: ["/evidence?evidenceId=evidence-1"],
            },
          },
          {
            id: "labor-1",
            basis: "management",
            projectId: "project-web",
            costClass: "labor",
            effectiveOn: "2026-08-05",
            amountMinor: "4000000",
            baseAmountMinor: "4000000",
            currency: "VND",
            drilldown: {
              sourceType: "timesheet_cost",
              sourceId: "timesheet-1",
              evidenceIds: [],
              sourceHref: "/timesheets/timesheet-1",
              timesheetHref: "/timesheets/timesheet-1",
              evidenceHrefs: [],
            },
          },
        ],
      });
    if (req.method() === "GET" && path.endsWith("/project-cost-sources/unallocated"))
      return reply(route, {
        items: [
          {
            id: "source-1",
            sourceType: "expense",
            sourceId: "expense-1",
            costClass: "project_tool",
            basis: "ledger",
            effectiveOn: "2026-08-05",
            amountMinor: "5000000",
            baseAmountMinor: "5000000",
            remainingAmountMinor: "5000000",
            remainingBaseAmountMinor: "5000000",
            currency: "VND",
            disposition: "unallocated",
            evidenceIds: [],
          },
        ],
      });
    if (req.method() === "POST" && path.endsWith("/direct-cost-allocations")) {
      bodies.allocate = req.postDataJSON();
      return reply(route, { resource: {}, mutation: {} });
    }
    if (req.method() === "GET" && path.endsWith("/allocation-1"))
      return reply(route, {
        id: "allocation-1",
        source: {
          id: "source-1",
          sourceType: "expense_allocation",
          sourceId: "expense-1",
          costClass: "project_tool",
          basis: "ledger",
          effectiveOn: "2026-08-05",
          amountMinor: "5000000",
          baseAmountMinor: "5000000",
          remainingAmountMinor: "0",
          remainingBaseAmountMinor: "0",
          currency: "VND",
          disposition: "direct",
          evidenceIds: [],
        },
        splits: [
          {
            id: "split-1",
            projectId: "project-web",
            amountMinor: "5000000",
            baseAmountMinor: "5000000",
          },
        ],
        state: "posted",
        resourceVersion: "3",
        nextActions: ["reverse"],
        journalId: "journal-post",
        events: [],
      });
    if (req.method() === "POST" && path.endsWith("/allocation-1/reverse")) {
      bodies.reverse = req.postDataJSON();
      return reply(route, { resource: {}, mutation: {} });
    }
    return reply(route, { items: [] });
  });
  return bodies;
}
test("@desktop keeps ledger and management costs visibly separate", async ({ page }) => {
  await install(page);
  await page.goto("http://localhost:3000/projects/project-web/costs");
  await expect(page.getByText("Ledger-backed direct cost")).toBeVisible();
  await expect(page.getByText("Management labor cost", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("10.000.000 ₫").first()).toBeVisible();
  await expect(page.getByText("4.000.000 ₫").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Evidence" })).toHaveAttribute("href", /evidence/);
});
test("@desktop allocates an unassigned source and reverses with reason", async ({ page }) => {
  const bodies = await install(page);
  await page.goto("http://localhost:3000/project-costs/unallocated");
  await page.getByRole("button", { name: "Phân bổ" }).click();
  const dialog = page.getByRole("dialog", { name: "Phân bổ direct cost" });
  await dialog.getByLabel("Project ID").fill("project-web");
  await dialog.getByLabel("Reason").fill("Direct project hosting");
  await dialog.getByRole("button", { name: "Tạo draft allocation" }).click();
  expect(bodies.allocate).toMatchObject({
    sourceId: "source-1",
    splits: [{ projectId: "project-web", amountMinor: "5000000" }],
  });
  await page.goto("http://localhost:3000/direct-cost-allocations/allocation-1");
  await page.getByRole("button", { name: "reverse" }).click();
  const reverse = page.getByRole("alertdialog", { name: "Reverse posted allocation?" });
  await reverse.getByLabel("Reason").fill("Wrong project");
  await reverse.getByRole("button", { name: "Xác nhận reverse" }).click();
  expect(bodies.reverse).toMatchObject({ expectedResourceVersion: "3", reason: "Wrong project" });
});
test("@mobile project-cost routes avoid body overflow", async ({ page }) => {
  await install(page);
  for (const path of [
    "/projects/project-web/costs",
    "/project-costs/unallocated",
    "/direct-cost-allocations/allocation-1",
  ]) {
    await page.goto(`http://localhost:3000${path}`);
    await page.waitForLoadState("networkidle");
    const s = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      viewport: innerWidth,
    }));
    expect(s.body).toBeLessThanOrEqual(s.viewport + 1);
  }
});
