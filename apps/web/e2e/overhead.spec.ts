import { expect, test, type Page, type Route } from "@playwright/test";
const env = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp530",
  organizationId: "naai",
  data,
});
const reply = (r: Route, d: unknown) =>
  r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(env(d)) });
async function install(page: Page) {
  const bodies: Record<string, Record<string, unknown> | undefined> = {};
  await page.route("http://localhost:3001/api/v1/organizations/naai/overhead-**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (req.method() === "GET" && path.endsWith("/overhead-allocation-policies"))
      return reply(route, {
        items: [
          {
            id: "policy-1",
            policyCode: "OH-MONTHLY",
            versionNumber: 1,
            name: "Monthly revenue allocation",
            method: "revenue",
            costClass: "fixed",
            effectiveFrom: "2026-08-01",
            configuration: {},
            state: "approved",
            resourceVersion: "2",
          },
        ],
      });
    if (req.method() === "GET" && path.endsWith("/overhead-source-pools"))
      return reply(route, {
        items: [
          {
            id: "pool-1",
            policyId: "policy-1",
            policyVersionNumber: 1,
            periodStart: "2026-08-01",
            periodEnd: "2026-08-31",
            currency: "VND",
            sourceAmountMinor: "30000000",
            sourceBaseAmountMinor: "30000000",
            state: "ready",
            resourceVersion: "1",
            reason: "August overhead",
          },
        ],
      });
    if (req.method() === "GET" && path.endsWith("/overhead-allocation-runs"))
      return reply(route, {
        items: [
          {
            id: "run-1",
            poolId: "pool-1",
            policyId: "policy-1",
            policyVersionNumber: 1,
            method: "revenue",
            periodStart: "2026-08-01",
            periodEnd: "2026-08-31",
            currency: "VND",
            allocatableAmountMinor: "30000000",
            basisSnapshot: {},
            policySnapshot: {},
            state: "posted",
            resourceVersion: "4",
            reason: "August allocation",
          },
        ],
      });
    if (req.method() === "GET" && path.endsWith("/run-1"))
      return reply(route, {
        id: "run-1",
        poolId: "pool-1",
        policyId: "policy-1",
        policyVersionNumber: 1,
        method: "revenue",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        currency: "VND",
        allocatableAmountMinor: "30000000",
        basisSnapshot: {},
        policySnapshot: {},
        state: "posted",
        resourceVersion: "4",
        reason: "August allocation",
        journalId: "journal-overhead-1",
        reversalJournalId: "journal-overhead-reversal-1",
        splits: [
          {
            projectId: "project-web",
            basisValue: "70",
            basisTotal: "100",
            amountMinor: "21000000",
            roundingRank: 1,
          },
          {
            projectId: "project-app",
            basisValue: "30",
            basisTotal: "100",
            amountMinor: "9000000",
            roundingRank: 2,
          },
        ],
      });
    if (req.method() === "POST") {
      const key = path.includes("policies")
        ? "policy"
        : path.endsWith("/run-1/reverse")
          ? "reverse"
          : "other";
      bodies[key] = req.postDataJSON();
      return reply(route, { resource: {}, mutation: {} });
    }
    return reply(route, { items: [] });
  });
  return bodies;
}
test("@desktop lists policy, pool and run queues", async ({ page }) => {
  await install(page);
  await page.goto("http://localhost:3000/overhead/policies");
  await expect(page.getByText("Monthly revenue allocation")).toBeVisible();
  await page.getByRole("link", { name: "Source pools" }).click();
  await expect(page.getByText("30.000.000 ₫")).toBeVisible();
  await page.getByRole("link", { name: "Allocation runs" }).click();
  await expect(page.getByRole("link", { name: "run-1" })).toBeVisible();
});
test("@desktop creates short policy form and reverses posted run with reason", async ({ page }) => {
  const bodies = await install(page);
  await page.goto("http://localhost:3000/overhead/policies");
  await page.getByRole("button", { name: "Tạo policies" }).click();
  const d = page.getByRole("dialog", { name: "Tạo overhead policies" });
  await d.getByLabel("Policy code").fill("OH-NEW");
  await d.getByLabel("Name").fill("New allocation");
  await d.getByLabel("Effective from").fill("2026-09-01");
  await d.getByLabel("Reason").fill("New monthly policy");
  await d.getByRole("button", { name: "Tạo draft" }).click();
  expect(bodies.policy).toMatchObject({
    policyCode: "OH-NEW",
    method: "revenue",
    costClass: "fixed",
  });
  await page.goto("http://localhost:3000/overhead/runs/run-1");
  await expect(page.getByRole("link", { name: "journal-overhead-1" })).toHaveAttribute(
    "href",
    /journalId=journal-overhead-1/,
  );
  await expect(page.getByRole("link", { name: "journal-overhead-reversal-1" })).toHaveAttribute(
    "href",
    /journalId=journal-overhead-reversal-1/,
  );
  await page.getByRole("button", { name: "reverse" }).click();
  const reverse = page.getByRole("alertdialog", { name: "reverse overhead run?" });
  await reverse.getByLabel("Reason").fill("Incorrect basis period");
  await reverse.getByRole("button", { name: "Xác nhận" }).click();
  expect(bodies.reverse).toMatchObject({
    expectedResourceVersion: "4",
    reason: "Incorrect basis period",
  });
});
test("@mobile overhead routes avoid body overflow", async ({ page }) => {
  await install(page);
  for (const path of [
    "/overhead/policies",
    "/overhead/pools",
    "/overhead/runs",
    "/overhead/runs/run-1",
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
