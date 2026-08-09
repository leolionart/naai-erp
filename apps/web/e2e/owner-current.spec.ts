import { expect, test } from "@playwright/test";

test("@desktop owner current menu exposes withdrawal evidence and running balance", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("naai-erp-admin-token", "owner-current-token"),
  );
  await page.route("**/api/v1/organizations/naai/banking/owner-current-movements", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        apiVersion: "v1",
        requestId: "owner-current-e2e",
        organizationId: "naai",
        data: {
          summary: {
            increaseMinor: "100000000",
            decreaseMinor: "45000000",
            closingBalanceMinor: "55000000",
          },
          items: [
            {
              journalId: "owner-expense-domain",
              date: "2025-02-15",
              description: "Expense expense-domain",
              currency: "VND",
              state: "posted",
              movementType: "owner_paid_company_cost",
              ownerDeltaMinor: "100000000",
              companyFundsDeltaMinor: "0",
              runningOwnerBalanceMinor: "100000000",
              ownerAccountCodes: ["3388-OWNER"],
              sources: [
                {
                  sourceType: "expense",
                  sourceId: "expense-domain",
                  title: "Gia hạn tên miền naai.studio",
                  detail: "Tên miền .studio một năm",
                  sourceHref: "/expenses/expense-domain",
                  expenseClass: "invoice_backed",
                  category: "DOMAIN",
                  citState: "eligible",
                  vatState: "eligible",
                  grossMinor: "1200000",
                  payeeName: "Nhà cung cấp tên miền",
                },
              ],
            },
            {
              journalId: "owner-withdrawal-45m",
              date: "2025-02-25",
              description: "Rút tiền mặt sử dụng",
              currency: "VND",
              state: "posted",
              movementType: "company_payment_to_owner",
              ownerDeltaMinor: "-45000000",
              companyFundsDeltaMinor: "-45000000",
              runningOwnerBalanceMinor: "55000000",
              ownerAccountCodes: ["3388-OWNER"],
              sources: [],
            },
          ],
        },
      }),
    }),
  );

  await page.goto("http://localhost:3000/banking/owner-current");
  await expect(
    page.getByRole("heading", { level: 1, name: "Đối chiếu công nợ chủ" }),
  ).toBeVisible();
  await expect(page.getByText("Rút tiền mặt sử dụng", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Gia hạn tên miền naai.studio" })).toHaveAttribute(
    "href",
    "/expenses/expense-domain",
  );
  await expect(page.getByText("Nhà cung cấp tên miền", { exact: true })).toBeVisible();
  await expect(page.getByText("DOMAIN", { exact: true })).toBeVisible();
  await expect(page.getByText("TNDN: eligible", { exact: true })).toBeVisible();
  await expect(page.getByText("45.000.000 ₫", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Rút tiền mặt sử dụng" })).toHaveAttribute(
    "href",
    "/accounting/journals?journalId=owner-withdrawal-45m",
  );
});
