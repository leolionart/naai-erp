import { expect, test, type Page, type Route } from "@playwright/test";
const env = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp520",
  organizationId: "naai",
  data,
});
const reply = (r: Route, d: unknown) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(env(d)) });
async function install(page: Page) {
  const bodies: Record<string, Record<string, unknown> | undefined> = {};
  await page.route("**/api/v1/organizations/naai/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (req.method() === "GET" && path.endsWith("/project-budgets"))
      return reply(route, {
        items: [
          {
            id: "budget-v1",
            projectId: "project-web",
            versionNumber: 1,
            kind: "baseline",
            currency: "VND",
            lines: [],
            revenueTotalMinor: "200000000",
            directCostTotalMinor: "90000000",
            overheadTotalMinor: "20000000",
            state: "approved",
            effectiveOn: "2026-08-01",
            resourceVersion: "2",
            nextActions: ["supersede"],
          },
        ],
      });
    if (req.method() === "GET" && path.includes("/project-revenue-position/"))
      return reply(route, {
        projectId: "project-web",
        startsOn: "2026-08-01",
        endsOn: "2026-08-31",
        currency: "VND",
        recognizedNetMinor: "72000000",
        invoicedNetMinor: "100000000",
        collectedGrossMinor: "60000000",
        collectedNetMinor: "60000000",
        deferredRevenueMinor: "30000000",
        contractAssetMinor: "0",
        recognitionEventIds: ["rec-1"],
        invoiceIds: ["invoice-1"],
        reconciliationIds: ["recon-1"],
        journalIds: ["journal-1"],
      });
    if (req.method() === "GET" && path.endsWith("/scope-changes"))
      return reply(route, {
        items: [
          {
            id: "scope-1",
            projectId: "project-web",
            reason: "Add analytics module",
            expectedRevenueImpactMinor: "30000000",
            expectedCostImpactMinor: "12000000",
            expectedScheduleImpactDays: 7,
            evidenceIds: [],
            state: "submitted",
            resourceVersion: "1",
            nextActions: ["approve", "reject"],
          },
        ],
      });
    if (req.method() === "GET" && path.endsWith("/revenue-recognition-events"))
      return reply(route, {
        items: [
          {
            id: "recognition-2025",
            projectId: "project-2025",
            projectName: "Dự án 2025",
            customerPartyId: "client-2025",
            customerName: "Khách hàng 2025",
            policyId: "policy-2025",
            policyVersionNumber: 1,
            effectiveOn: "2025-06-30",
            amountMinor: "9000000",
            currency: "VND",
            state: "posted",
            evidenceIds: ["evidence-1"],
            policySnapshot: {},
            reason: "Ghi nhận mốc 2025",
            resourceVersion: "2",
          },
        ],
      });
    if (req.method() === "GET" && path.endsWith("/revenue-recognition-events/recognition-2025"))
      return reply(route, {
        id: "recognition-2025",
        projectId: "project-2025",
        projectName: "Dự án 2025",
        customerPartyId: "client-2025",
        customerName: "Khách hàng 2025",
        policyId: "policy-2025",
        policyVersionNumber: 1,
        effectiveOn: "2025-06-30",
        amountMinor: "9000000",
        currency: "VND",
        state: "posted",
        evidenceIds: [],
        policySnapshot: {},
        reason: "Ghi nhận mốc 2025",
        resourceVersion: "2",
      });
    if (req.method() === "GET" && path.endsWith("/milestone-acceptances"))
      return reply(route, {
        items: [
          {
            id: "accept-1",
            milestoneId: "milestone-1",
            milestoneAmountMinor: "80000000",
            acceptedOn: "2026-08-05",
            acceptedAmountMinor: "80000000",
            evidenceIds: ["evidence-1"],
            state: "accepted",
            reason: "Accepted",
            resourceVersion: "2",
            nextActions: [],
          },
        ],
      });
    if (req.method() === "POST" && path.endsWith("/milestone-acceptances")) {
      bodies.acceptance = req.postDataJSON();
      return reply(route, { resource: {}, mutation: {} });
    }
    return reply(route, { items: [] });
  });
  return bodies;
}
test("@desktop shows recognized, invoiced and collected axes side by side", async ({ page }) => {
  await install(page);
  await page.goto("http://localhost:3000/projects/project-web/budget?asOf=2026-08-06");
  await expect(page.getByText("Doanh thu đã ghi nhận", { exact: true })).toBeVisible();
  await expect(page.getByText("Giá trị đã xuất hóa đơn", { exact: true })).toBeVisible();
  await expect(page.getByText("Đã thu từ khách hàng", { exact: true })).toBeVisible();
  await expect(page.getByText("Doanh thu chưa thực hiện", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Doanh thu đã ghi nhận chưa xuất hóa đơn", { exact: true }),
  ).toBeVisible();
});
test("@desktop keeps scope changes and milestone acceptance as separate workflows", async ({
  page,
}) => {
  const bodies = await install(page);
  await page.goto("http://localhost:3000/scope-changes");
  await expect(page.getByRole("link", { name: "Add analytics module" })).toBeVisible();
  await page.goto("http://localhost:3000/milestone-acceptances");
  await page.getByRole("button", { name: "Ghi nhận acceptance" }).click();
  const d = page.getByRole("dialog", { name: "Ghi nhận milestone acceptance" });
  await d.getByLabel("Milestone ID").fill("milestone-2");
  await d.getByLabel("Reason").fill("Client acceptance");
  await d.getByRole("button", { name: "Tạo draft acceptance" }).click();
  expect(bodies.acceptance).toMatchObject({
    milestoneId: "milestone-2",
    reason: "Client acceptance",
  });
});
test("@desktop recognition uses canonical 2025 customer project date amount and state", async ({
  page,
}) => {
  await install(page);
  await page.goto("http://localhost:3000/revenue-recognition");
  await expect(page.getByText("Khách hàng 2025", { exact: true })).toBeVisible();
  await expect(page.getByText("Dự án 2025", { exact: true })).toBeVisible();
  await expect(page.getByText("2025-06-30", { exact: true })).toBeVisible();
  await expect(page.getByText("9.000.000 ₫", { exact: true })).toBeVisible();
  await expect(page.getByText(/undefined/)).toHaveCount(0);
  await page.getByRole("link", { name: /Khách hàng 2025/ }).click();
  await expect(page.getByText("Khách hàng 2025", { exact: true })).toBeVisible();
  await expect(page.getByText("Dự án 2025", { exact: true })).toBeVisible();
  await expect(page.getByText("2025-06-30", { exact: true })).toBeVisible();
  await expect(page.getByText("9.000.000 ₫", { exact: true })).toBeVisible();
  await expect(page.getByText("policy-2025")).toHaveCount(0);
});
test("@mobile ERP-520 routes avoid body overflow", async ({ page }) => {
  await install(page);
  for (const path of [
    "/projects/project-web/budget",
    "/scope-changes",
    "/revenue-recognition",
    "/milestone-acceptances",
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
