import { expect, test } from "@playwright/test";

test("@desktop owner current distinguishes owner-paid costs, repayments and review adjustments", async ({
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
            ownerPaidCompanyCostMinor: "100000000",
            companyRepaymentToOwnerMinor: "45000000",
            ownerFundingMinor: "0",
            adjustmentMinor: "0",
            needsReviewCount: 1,
          },
          items: [
            {
              journalId: "owner-repayment-45m",
              date: "2025-02-25",
              description: "Công ty hoàn trả tiền chủ đã chi hộ",
              currency: "VND",
              state: "posted",
              movementType: "company_repayment_to_owner",
              ownerDeltaMinor: "-45000000",
              companyFundsDeltaMinor: "-45000000",
              runningOwnerBalanceMinor: "55000000",
              ownerAccountCodes: ["3388-OWNER"],
              needsReview: false,
              classificationBasis: "Owner Current giảm và tiền công ty giảm trong cùng bút toán",
              sources: [],
            },
            {
              journalId: "owner-adjustment-review",
              date: "2025-02-26",
              description: "Điều chỉnh chưa rõ nghiệp vụ",
              currency: "VND",
              state: "posted",
              movementType: "adjustment",
              ownerDeltaMinor: "0",
              companyFundsDeltaMinor: "0",
              runningOwnerBalanceMinor: "55000000",
              ownerAccountCodes: ["3388-OWNER"],
              needsReview: true,
              classificationBasis: "Không đủ đối ứng để xác định nguồn tiền",
              sources: [],
            },
          ],
        },
      }),
    }),
  );
  await page.route(
    "**/api/v1/organizations/naai/expenses?state=posted&fundingTreatment=owner_paid_company_cost",
    (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          apiVersion: "v1",
          requestId: "owner-paid-expenses-e2e",
          organizationId: "naai",
          data: {
            items: [
              {
                id: "expense-payroll",
                expenseDate: "2025-02-15",
                businessPurpose: "Lương nhân sự tháng 2/2025",
                currency: "VND",
                state: "posted",
                expenseClass: "payroll_personnel",
                category: "SALARY",
                citState: "eligible",
                vatState: "ineligible",
                grossMinor: "100000000",
                fundingTreatments: ["owner_paid_company_cost"],
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
  await expect(
    page.getByText("Công ty hoàn trả tiền chủ đã chi hộ", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Lương nhân sự tháng 2/2025" })).toHaveAttribute(
    "href",
    "/expenses/expense-payroll",
  );
  await expect(page.getByText("SALARY", { exact: true })).toBeVisible();
  await expect(page.getByText("payroll_personnel", { exact: true })).toBeVisible();
  await expect(page.getByText("TNDN: eligible", { exact: true })).toBeVisible();
  await expect(page.getByText("45.000.000 ₫", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Công ty trả nợ chủ", { exact: true })).toBeVisible();
  await expect(page.getByText("Cần kiểm tra phân loại", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Không đủ đối ứng để xác định nguồn tiền", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Công ty hoàn trả tiền chủ đã chi hộ" }),
  ).toHaveAttribute("href", "/accounting/journals?journalId=owner-repayment-45m");
  await expect(page.getByText("Chưa liên kết nguồn chi phí")).toHaveCount(0);
});
