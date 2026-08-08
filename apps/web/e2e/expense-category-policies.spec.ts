import { expect, test } from "@playwright/test";

const envelope = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp-852",
  organizationId: "naai",
  data,
});

test("@desktop manages canonical expense category funding policies", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("naai-erp-admin-token", "erp-852-token"));
  let policy = {
    code: "DOMAIN_HOSTING",
    name: "Tên miền / Hosting",
    isActive: true,
    fundingTreatment: "owner_paid_company_cost",
    version: "1",
  };
  await page.route("**/master-data/expense-categories**", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { data: typeof policy };
      policy = {
        ...policy,
        name: String(body.data.name ?? policy.name),
        version: "2",
      };
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(envelope(policy)),
      });
    }
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(envelope({ items: [policy] })),
    });
  });
  await page.route("**/master-data/accounts**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(envelope({ items: [] })),
    }),
  );

  await page.goto("http://localhost:3000/settings/master-data");
  await expect(page.getByText("Chính sách danh mục chi phí", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "DOMAIN_HOSTING" })).toBeVisible();
  await expect(page.getByText("Chủ doanh nghiệp chi hộ chi phí thực")).toBeVisible();
  await page.getByRole("button", { name: "Sửa" }).click();
  const dialog = page.getByRole("dialog", { name: "Sửa chính sách danh mục" });
  await dialog.getByLabel("name").fill("Domain, VPS và hosting");
  await dialog.getByRole("button", { name: "Lưu chính sách" }).click();
  await expect(page.getByRole("cell", { name: "Domain, VPS và hosting" })).toBeVisible();
});
