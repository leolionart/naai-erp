import { expect, test, type Page, type Route } from "@playwright/test";

const envelope = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp890-e2e",
  organizationId: "naai",
  data,
});
async function json(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
}

async function auth(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("naai-erp-admin-token", "erp890-token"));
}

test("@desktop records completed freelance work through canonical Expense Management", async ({
  page,
}) => {
  await auth(page);
  const creates: unknown[] = [];
  await page.route("**/api/v1/organizations/naai/commercial-documents**", (route) =>
    json(route, envelope({ items: [] })),
  );
  await page.route("**/api/v1/organizations/naai/expenses**", async (route) => {
    if (route.request().method() === "POST") {
      creates.push(route.request().postDataJSON());
      return json(route, envelope({ id: "expense-freelance-1", state: "draft" }), 201);
    }
    return json(route, envelope({ items: [] }));
  });
  await page.route("**/api/v1/organizations/naai/master-data/parties**", (route) =>
    json(route, envelope({ items: [{ id: "freelancer-1", displayName: "Nguyễn Freelancer" }] })),
  );
  await page.route("**/api/v1/organizations/naai/master-data/party-roles**", (route) =>
    json(route, envelope({ items: [{ partyId: "freelancer-1", role: "freelancer" }] })),
  );
  await page.route("**/api/v1/organizations/naai/master-data/projects**", (route) =>
    json(route, envelope({ items: [{ id: "project-1", name: "Website Acme" }] })),
  );
  await page.route("**/api/v1/organizations/naai/master-data/expense-categories**", (route) =>
    json(route, envelope({ items: [] })),
  );
  await page.route("**/api/v1/organizations/naai/time/workers**", (route) =>
    json(route, envelope({ items: [] })),
  );

  await page.goto("/expenses");
  await page.getByRole("button", { name: "Tạo chi phí" }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo chi phí" });
  await dialog.getByLabel("Loại chi phí dự án").click();
  await page.getByRole("option", { name: "Chi phí freelance thực tế" }).click();
  await dialog.getByRole("combobox", { name: "Dự án", exact: true }).click();
  await page.getByRole("option", { name: "Website Acme" }).click();
  await dialog.getByRole("combobox", { name: "Freelancer", exact: true }).click();
  await page.getByRole("option", { name: "Nguyễn Freelancer" }).click();
  await dialog.getByLabel("Hạn thanh toán freelancer").fill("2026-08-30");
  await dialog.getByLabel("Ngày chi phí").fill("2026-08-11");
  await dialog.getByLabel("Mục đích chi / Diễn giải").fill("Hoàn thành thiết kế giao diện");
  await dialog.getByLabel("Tiền gốc chưa VAT (VNĐ)").fill("5000000");
  await dialog.getByLabel("Tổng chi phí (VNĐ)").fill("5000000");
  await dialog.getByRole("button", { name: "Lưu chi phí nháp" }).click();

  await expect.poll(() => creates.length).toBe(1);
  expect(creates[0]).toEqual(
    expect.objectContaining({
      costClass: "freelancer",
      projectId: "project-1",
      freelancerPartyId: "freelancer-1",
      payeePartyId: "freelancer-1",
      dueDate: "2026-08-30",
      expenseDate: "2026-08-11",
    }),
  );
});

test("@desktop ordinary purchase invoice defaults to an active funding account", async ({
  page,
}) => {
  await auth(page);
  const creates: unknown[] = [];
  await page.route("**/api/v1/organizations/naai/commercial-documents**", async (route) => {
    if (route.request().method() === "POST") {
      creates.push(route.request().postDataJSON());
      return json(route, envelope({ id: "purchase-1", state: "draft" }), 201);
    }
    return json(route, envelope({ items: [] }));
  });
  await page.route("**/api/v1/organizations/naai/revenue-recognition-events**", (route) =>
    json(route, envelope({ items: [] })),
  );
  await page.route("**/api/v1/organizations/naai/master-data/parties**", (route) =>
    json(route, envelope({ items: [{ id: "supplier-1", displayName: "Nhà cung cấp Cloud" }] })),
  );
  await page.route("**/api/v1/organizations/naai/master-data/party-roles**", (route) =>
    json(route, envelope({ items: [{ partyId: "supplier-1", role: "supplier" }] })),
  );
  await page.route("**/api/v1/organizations/naai/master-data/projects**", (route) =>
    json(route, envelope({ items: [] })),
  );
  await page.route("**/api/v1/organizations/naai/banking/accounts", (route) =>
    json(
      route,
      envelope({
        items: [
          { id: "bank-vnd-1", displayName: "Vietcombank", currency: "VND", status: "active" },
        ],
      }),
    ),
  );

  await page.goto("/documents");
  await page.getByRole("button", { name: "Tạo hóa đơn bán ra" }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo hóa đơn" });
  await dialog.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Hóa đơn mua vào (Purchase Invoice)" }).click();
  await expect(dialog.getByRole("combobox", { name: "Nguồn thanh toán hóa đơn" })).toContainText(
    "Vietcombank",
  );
  await dialog.getByLabel("Số hóa đơn").fill("BUY-001");
  await dialog.getByPlaceholder("Gõ tên để tìm gợi ý hoặc nhập mới...").fill("Nhà cung cấp Cloud");
  await dialog.getByLabel("Hạn thanh toán").fill("2026-08-30");
  await dialog.getByLabel("Đơn giá (VNĐ)").fill("1000000");
  await dialog.getByLabel("Tiền chưa thuế (VNĐ)").fill("1000000");
  await dialog.getByLabel("Tổng cộng gồm thuế (VNĐ)").fill("1000000");
  await dialog.getByRole("button", { name: "Lưu hóa đơn nháp" }).click();

  await expect.poll(() => creates.length).toBe(1);
  expect(creates[0]).toEqual(
    expect.objectContaining({
      type: "purchase_invoice",
      fundingSource: { type: "financial_account", financialAccountId: "bank-vnd-1" },
    }),
  );
});

test("@mobile Payables shows only actual unpaid freelance and supports partial payment", async ({
  page,
}) => {
  await auth(page);
  const payments: unknown[] = [];
  await page.route("**/api/v1/organizations/naai/project-freelance-payables**", async (route) => {
    if (route.request().url().endsWith("/pay")) {
      payments.push(route.request().postDataJSON());
      return json(
        route,
        envelope({
          id: "payable-1",
          expenseId: "expense-1",
          projectId: "project-1",
          freelancerPartyId: "freelancer-1",
          expenseDate: "2026-08-11",
          dueDate: "2026-08-30",
          amountMinor: "5000000",
          outstandingMinor: "3000000",
          currency: "VND",
          description: "Thiết kế giao diện",
          state: "partially_paid",
        }),
      );
    }
    return json(
      route,
      envelope({
        items: [
          {
            id: "payable-1",
            expenseId: "expense-1",
            projectId: "project-1",
            freelancerPartyId: "freelancer-1",
            expenseDate: "2026-08-11",
            dueDate: "2026-08-30",
            amountMinor: "5000000",
            outstandingMinor: "5000000",
            currency: "VND",
            description: "Thiết kế giao diện",
            state: "unpaid",
          },
        ],
      }),
    );
  });
  await page.route("**/api/v1/organizations/naai/master-data/projects**", (route) =>
    json(route, envelope({ items: [{ id: "project-1", name: "Website Acme" }] })),
  );
  await page.route("**/api/v1/organizations/naai/master-data/parties**", (route) =>
    json(route, envelope({ items: [{ id: "freelancer-1", displayName: "Nguyễn Freelancer" }] })),
  );
  await page.route("**/api/v1/organizations/naai/banking/accounts", (route) =>
    json(
      route,
      envelope({
        items: [{ id: "bank-1", displayName: "Vietcombank", currency: "VND", status: "active" }],
      }),
    ),
  );

  await page.goto("/payables");
  await expect(page.getByText("Nguyễn Freelancer")).toBeVisible();
  await expect(page.getByText("Hóa đơn mua vào")).toHaveCount(0);
  await page.getByRole("button", { name: "Thanh toán" }).click();
  const dialog = page.getByRole("dialog", { name: "Thanh toán chi phí freelance" });
  await dialog.getByLabel("Thanh toán từ").click();
  await page.getByRole("option", { name: /Vietcombank/ }).click();
  await dialog.getByLabel("Số tiền thanh toán").fill("2000000");
  await dialog.getByRole("button", { name: "Ghi nhận thanh toán" }).click();
  await expect(page.getByText(/Còn phải trả 3.000.000 ₫/)).toBeVisible();
  expect(payments).toEqual([
    expect.objectContaining({ financialAccountId: "bank-1", amountMinor: "2000000" }),
  ]);
  const metrics = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: innerWidth,
  }));
  expect(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1);
});
