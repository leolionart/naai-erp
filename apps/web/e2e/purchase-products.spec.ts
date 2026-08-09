import { expect, test } from "@playwright/test";

test("@desktop purchase product menu opens CRUD workspace and uses the canonical API", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("naai-erp-admin-token", "purchase-product-token"),
  );
  const products = [
    {
      code: "HOSTING",
      name: "Dịch vụ hosting",
      vat_rate_percent: 8,
      is_active: true,
      version: "1",
    },
  ];
  const mutations: Array<{ method: string; url: string; body: unknown }> = [];
  await page.route("**/api/v1/organizations/*/master-data/purchase-products**", async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ apiVersion: "v1", data: { items: products } }),
      });
      return;
    }
    const body = request.postDataJSON();
    mutations.push({ method, url: request.url(), body });
    if (request.url().endsWith("/deactivate")) products[0]!.is_active = false;
    else if (method === "POST") {
      const data = (body as { data: (typeof products)[number] }).data;
      products.push({ ...data, version: "1" });
    }
    await route.fulfill({
      status: method === "POST" ? 201 : 200,
      contentType: "application/json",
      body: JSON.stringify({ apiVersion: "v1", data: { resource: products.at(-1) } }),
    });
  });

  await page.goto("http://localhost:3000/settings/purchase-products");
  await expect(page).toHaveURL(/\/settings\/purchase-products$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Sản phẩm mua vào & VAT" }),
  ).toBeVisible();
  await expect(page.getByText("Dịch vụ hosting", { exact: true })).toBeVisible();
  await expect(page.getByText("VAT 8%", { exact: true })).toBeVisible();

  const catalogHeader = page
    .locator('[data-slot="card-header"]')
    .filter({ hasText: "Danh mục sản phẩm mua vào" });
  const catalogTitleBox = await catalogHeader.locator('[data-slot="card-title"]').boundingBox();
  const addProductBox = await catalogHeader
    .getByRole("button", { name: "Thêm sản phẩm" })
    .boundingBox();
  expect(catalogTitleBox).not.toBeNull();
  expect(addProductBox).not.toBeNull();
  expect(addProductBox!.x).toBeGreaterThan(catalogTitleBox!.x + catalogTitleBox!.width);
  expect(addProductBox!.y).toBeLessThan(catalogTitleBox!.y + catalogTitleBox!.height);

  await page.getByRole("button", { name: "Thêm sản phẩm" }).click();
  const dialog = page.getByRole("dialog", { name: "Thêm sản phẩm mua vào" });
  await dialog.getByLabel("Mã sản phẩm").fill("SOFTWARE");
  await dialog.getByLabel("Tên sản phẩm").fill("Bản quyền phần mềm");
  await dialog.getByLabel("VAT mặc định").click();
  await page.getByRole("option", { name: "VAT 10%" }).click();
  await dialog.getByRole("button", { name: "Lưu sản phẩm" }).click();
  await expect(page.getByText("Bản quyền phần mềm", { exact: true })).toBeVisible();
  expect(mutations[0]).toMatchObject({
    method: "POST",
    body: {
      data: {
        code: "SOFTWARE",
        name: "Bản quyền phần mềm",
        vat_rate_percent: 10,
        is_active: true,
      },
    },
  });

  await page.getByRole("button", { name: "Ngừng dùng" }).first().click();
  await expect(page.locator('[data-slot="badge"]').filter({ hasText: "Ngừng dùng" })).toBeVisible();
  expect(mutations.some((item) => item.url.endsWith("/deactivate"))).toBe(true);
});
