import { expect, test } from "@playwright/test";

test("@mobile journals keeps header actions visible and table overflow local", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    sessionStorage.setItem("naai-erp-admin-token", "journals-responsive-token"),
  );
  await page.route("**/api/v1/organizations/naai/journals", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        apiVersion: "v1",
        data: {
          items: [
            {
              id: "journal-responsive-1",
              journalDate: "2026-08-11",
              description: "Bút toán kiểm tra responsive trên màn hình nhỏ",
              state: "draft",
            },
          ],
        },
      }),
    }),
  );

  await page.goto("/accounting/journals");
  await expect(page.getByRole("button", { name: "+ Bút toán nháp" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tải dữ liệu" })).toBeVisible();
  await expect(page.getByText("journal-responsive-1")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>(
      '[aria-label="Ledger and master data workspace"]',
    );
    const tableContainer = workspace?.querySelector<HTMLElement>('[data-slot="table-container"]');
    const actions = workspace?.querySelector<HTMLElement>('[data-slot="card-action"]');
    const actionRect = actions?.getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      tableClientWidth: tableContainer?.clientWidth ?? 0,
      tableScrollWidth: tableContainer?.scrollWidth ?? 0,
      actionLeft: actionRect?.left ?? -1,
      actionRight: actionRect?.right ?? Number.POSITIVE_INFINITY,
    };
  });

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.actionLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.actionRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.tableClientWidth).toBeGreaterThan(0);
  expect(metrics.tableScrollWidth).toBeGreaterThan(metrics.tableClientWidth);
});
