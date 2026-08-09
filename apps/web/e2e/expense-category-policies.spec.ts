import { expect, test } from "@playwright/test";

const envelope = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp-852",
  organizationId: "naai",
  data,
});

test("@desktop manages canonical expense category funding policies", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("naai-erp-admin-token", "erp-852-token"));
  let operatingMode = "controlled";
  await page.route("**/master-data/accounting-workflow-policy**", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as { data: { operating_mode: string } };
      operatingMode = body.data.operating_mode;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          envelope({ resource: { organization_id: "naai", operating_mode: operatingMode } }),
        ),
      });
    }
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        envelope({ items: [{ organization_id: "naai", operating_mode: operatingMode }] }),
      ),
    });
  });
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
  await page.getByLabel("Chế độ vận hành chi phí").click();
  await page.getByRole("option", { name: "Một chủ sở hữu — dữ liệu nhập là final" }).click();
  await page.getByRole("button", { name: "Lưu chế độ" }).click();
  await expect(page.getByLabel("Chế độ vận hành chi phí")).toContainText(
    "Một chủ sở hữu — dữ liệu nhập là final",
  );
  expect(operatingMode).toBe("owner_final");
  await expect(page.getByText("Chính sách danh mục chi phí", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "DOMAIN_HOSTING" })).toBeVisible();
  await expect(page.getByText("Chủ doanh nghiệp chi hộ chi phí thực")).toBeVisible();
  const policyHeader = page
    .locator('[data-slot="card-header"]')
    .filter({ hasText: "Chính sách danh mục chi phí" });
  const policyTitleBox = await policyHeader.locator('[data-slot="card-title"]').boundingBox();
  const addPolicyBox = await policyHeader
    .getByRole("button", { name: "Thêm chính sách" })
    .boundingBox();
  expect(policyTitleBox).not.toBeNull();
  expect(addPolicyBox).not.toBeNull();
  expect(addPolicyBox!.x).toBeGreaterThan(policyTitleBox!.x + policyTitleBox!.width);
  expect(addPolicyBox!.y).toBeLessThan(policyTitleBox!.y + policyTitleBox!.height);
  await page.getByRole("button", { name: "Sửa" }).click();
  const dialog = page.getByRole("dialog", { name: "Sửa chính sách danh mục" });
  await dialog.getByLabel("name").fill("Domain, VPS và hosting");
  await dialog.getByRole("button", { name: "Lưu chính sách" }).click();
  await expect(page.getByRole("cell", { name: "Domain, VPS và hosting" })).toBeVisible();
});
