import { expect, test } from "@playwright/test";

test("@desktop manages customer subscriptions with canonical relationships and typed lifecycle actions", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("naai-erp-admin-token", "subscription-token"),
  );

  const subscriptions = [
    {
      id: "sub-hosting-naai",
      customerPartyId: "party-naai",
      servicePlanId: "plan-hosting",
      projectId: "project-naai-web",
      startsOn: "2026-01-01",
      endsOn: null,
      quantity: "1",
      unitPriceMinor: "12000000",
      currency: "VND",
      recurrenceSnapshot: { frequency: "month", interval: 1, billingDay: 5 },
      lifecycle: "active",
      resourceVersion: "3",
      nextActions: ["update", "pause", "cancel", "schedule-preview"],
    },
  ];
  const plans = [
    {
      id: "plan-hosting",
      code: "HOSTING",
      name: "Cloud Hosting",
      serviceLineCode: "CLOUD",
      defaultUnitPriceMinor: "12000000",
      currency: "VND",
      recurrence: { frequency: "month", interval: 1, billingDay: 5 },
      active: true,
      resourceVersion: "2",
      nextActions: ["update", "deactivate", "delete"],
    },
    {
      id: "plan-unused",
      code: "UNUSED",
      name: "Gói chưa dùng",
      serviceLineCode: "CLOUD",
      defaultUnitPriceMinor: "100000",
      currency: "VND",
      recurrence: { frequency: "month", interval: 1, billingDay: 1 },
      active: true,
      resourceVersion: "1",
      nextActions: ["update", "deactivate", "delete"],
    },
  ];
  const mutations: Array<{ method: string; url: string; body: Record<string, unknown> }> = [];

  await page.route("**/api/v1/organizations/*/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() !== "GET") {
      const body = request.postDataJSON() as Record<string, unknown>;
      mutations.push({ method: request.method(), url: request.url(), body });
      if (request.method() === "DELETE" && path.endsWith("/service-plans/plan-unused")) {
        plans.splice(1, 1);
      }
      if (path.endsWith("/pause")) subscriptions[0]!.lifecycle = "paused";
      if (path.endsWith("/customer-service-subscriptions")) {
        subscriptions.push({
          ...subscriptions[0]!,
          id: "sub-new",
          customerPartyId: String(body.customerPartyId),
          servicePlanId: String(body.servicePlanId),
          projectId: String(body.projectId),
          unitPriceMinor: String(body.unitPriceMinor),
          lifecycle: "draft",
          resourceVersion: "1",
          nextActions: ["update", "activate"],
        });
      }
      await route.fulfill({
        status: request.method() === "POST" ? 201 : 200,
        contentType: "application/json",
        body: JSON.stringify({ apiVersion: "v1", data: subscriptions.at(-1) }),
      });
      return;
    }

    let data: unknown = { items: [] };
    if (path.endsWith("/customer-service-subscriptions")) data = { items: subscriptions };
    else if (path.endsWith("/service-plans")) data = { items: plans };
    else if (path.endsWith("/master-data/parties"))
      data = {
        items: [
          { id: "party-naai", businessName: "NAAI Studio" },
          { id: "party-other", businessName: "Khách hàng khác" },
        ],
      };
    else if (path.endsWith("/master-data/party-roles"))
      data = {
        items: [
          { partyId: "party-naai", role: "client" },
          { partyId: "party-other", role: "client" },
        ],
      };
    else if (path.endsWith("/master-data/projects"))
      data = {
        items: [
          { id: "project-naai-web", name: "NAAI Website", clientPartyId: "party-naai" },
          { id: "project-other", name: "Dự án khách khác", clientPartyId: "party-other" },
        ],
      };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ apiVersion: "v1", data }),
    });
  });

  await page.goto("http://localhost:3000/subscriptions");
  await expect(
    page.getByRole("heading", { level: 1, name: "Dịch vụ định kỳ của khách hàng" }),
  ).toBeVisible();
  await expect(page.getByText("Lịch dịch vụ không phải doanh thu kế toán")).toBeVisible();
  await expect(page.getByText("NAAI Studio", { exact: true })).toBeVisible();
  await expect(page.getByText("12.000.000 ₫", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Thêm loại dịch vụ" }).click();
  const planDialog = page.getByRole("dialog", { name: "Thêm gói dịch vụ" });
  await expect(planDialog.getByLabel("Mã gói")).toHaveCount(0);
  await expect(planDialog.getByLabel("Mã dòng dịch vụ")).toHaveCount(0);
  await expect(planDialog.getByLabel("Lý do")).toHaveCount(0);
  await planDialog.getByLabel("Tên dịch vụ").fill("Dịch vụ quản trị website");
  await planDialog.getByLabel("Giá mặc định mỗi kỳ").fill("500000");
  await planDialog.getByRole("button", { name: "Lưu gói dịch vụ" }).click();
  await expect
    .poll(() =>
      mutations.some(
        (mutation) =>
          mutation.url.endsWith("/service-plans") &&
          mutation.body.name === "Dịch vụ quản trị website" &&
          mutation.body.defaultUnitPriceMinor === "500000" &&
          mutation.body.code === undefined &&
          mutation.body.serviceLineCode === undefined,
      ),
    )
    .toBe(true);

  await page
    .getByRole("row", { name: /Gói chưa dùng/ })
    .getByRole("button", { name: "Xóa" })
    .click();
  const deleteDialog = page.getByRole("dialog", { name: "Xóa gói dịch vụ?" });
  await expect(deleteDialog.getByText("Gói chưa dùng")).toBeVisible();
  await deleteDialog.getByRole("button", { name: "Xác nhận xóa" }).click();
  await expect
    .poll(() =>
      mutations.some(
        (mutation) =>
          mutation.method === "DELETE" &&
          mutation.url.endsWith("/service-plans/plan-unused") &&
          mutation.body.reason === "Xóa gói dịch vụ chưa từng được sử dụng",
      ),
    )
    .toBe(true);

  await page.getByLabel("Lọc trạng thái").click();
  await page.getByRole("option", { name: "Đang sử dụng" }).click();
  await expect(page).toHaveURL(/status=active/);

  await page.getByRole("button", { name: "Thêm subscription" }).click();
  const dialog = page.getByRole("dialog", { name: "Thêm subscription" });
  await dialog.getByLabel("Khách hàng").click();
  await page.getByRole("option", { name: "NAAI Studio" }).click();
  await dialog.getByLabel("Gói dịch vụ").click();
  await page.getByRole("option", { name: "Cloud Hosting" }).click();
  await dialog.getByLabel("Dự án / hợp đồng").click();
  await expect(page.getByRole("option", { name: "NAAI Website" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Dự án khách khác" })).toHaveCount(0);
  await page.getByRole("option", { name: "NAAI Website" }).click();
  await dialog.getByLabel("Ngày bắt đầu").fill("2026-09-01");
  await dialog.getByLabel("Lý do tạo/chỉnh sửa").fill("Khách hàng đăng ký gói hosting");
  await dialog.getByRole("button", { name: "Lưu subscription" }).click();
  await expect
    .poll(() =>
      mutations.some(
        (mutation) =>
          mutation.url.endsWith("/customer-service-subscriptions") &&
          mutation.body.customerPartyId === "party-naai" &&
          mutation.body.projectId === "project-naai-web" &&
          mutation.body.unitPriceMinor === "12000000",
      ),
    )
    .toBe(true);

  await page.getByRole("button", { name: "Tạm dừng" }).first().click();
  const actionDialog = page.getByRole("dialog", { name: "Tạm dừng subscription" });
  await actionDialog.getByLabel("Lý do").fill("Tạm ngừng theo yêu cầu khách hàng");
  await actionDialog.getByRole("button", { name: "Xác nhận" }).click();
  await expect
    .poll(() =>
      mutations.some(
        (mutation) => mutation.url.endsWith("/pause") && mutation.body.schemaVersion === 1,
      ),
    )
    .toBe(true);
});

test("@mobile subscription workspace remains usable without document overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() =>
    sessionStorage.setItem("naai-erp-admin-token", "subscription-token"),
  );
  await page.route("**/api/v1/organizations/*/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ apiVersion: "v1", data: { items: [] } }),
    }),
  );
  await page.goto("http://localhost:3000/subscriptions");
  await expect(page.getByRole("button", { name: "Thêm subscription" })).toBeVisible();
  await expect(page.getByText("Chưa có dịch vụ định kỳ")).toBeVisible();
  await page.getByRole("button", { name: "Thêm loại dịch vụ" }).click();
  await expect(page.getByRole("dialog", { name: "Thêm gói dịch vụ" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
