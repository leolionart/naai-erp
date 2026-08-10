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
            ledgerClosingBalanceMinor: "85500000",
            confirmedClosingBalanceMinor: "55000000",
            confirmedIncreaseMinor: "100000000",
            confirmedDecreaseMinor: "45000000",
            ownerPaidCompanyCostMinor: "100000000",
            companyRepaymentToOwnerMinor: "45000000",
            ownerFundingMinor: "0",
            reviewAdjustmentMinor: "30500000",
            reviewItemCount: 2,
          },
          confirmedTimeline: [
            {
              journalId: "owner-payroll-100m",
              date: "2025-02-15",
              description: "Chủ thanh toán lương nhân sự",
              currency: "VND",
              state: "posted",
              movementType: "owner_paid_company_cost",
              ownerDeltaMinor: "100000000",
              companyFundsDeltaMinor: "0",
              runningOwnerBalanceMinor: "100000000",
              ownerAccountCodes: ["3388-OWNER"],
              needsReview: false,
              classificationBasis: "canonical_owner_paid_source",
              sources: [
                {
                  sourceType: "expense",
                  sourceId: "expense-payroll",
                  title: "Lương nhân sự tháng 2/2025",
                  detail: "Chủ thanh toán bằng tài khoản cá nhân",
                  sourceHref: "/expenses/expense-payroll",
                  expenseClass: "payroll_personnel",
                  category: "SALARY",
                  citState: "eligible",
                  vatState: "ineligible",
                  grossMinor: "100000000",
                  payeeName: "Nhân sự công ty",
                },
              ],
            },
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
          ],
          reviewItems: [
            {
              journalId: "vehicle-rental-review",
              date: "2025-02-26",
              description: "Hóa đơn thuê xe chưa rõ nguồn tiền",
              currency: "VND",
              state: "posted",
              movementType: "adjustment",
              ownerDeltaMinor: "20500000",
              companyFundsDeltaMinor: "0",
              runningOwnerBalanceMinor: "",
              ownerAccountCodes: ["3388-OWNER"],
              needsReview: true,
              classificationBasis: "unresolved_owner_current_movement",
              sources: [
                {
                  sourceType: "purchase_invoice",
                  sourceId: "vehicle-rental-invoice",
                  title: "VEHICLE_RENTAL",
                  detail: "Chỉ có hóa đơn, chưa xác nhận chủ chi",
                  sourceHref: "/documents/vehicle-rental-invoice",
                  expenseClass: null,
                  category: "VEHICLE_RENTAL",
                  citState: "eligible",
                  vatState: "eligible",
                  grossMinor: "20500000",
                  payeeName: "Đơn vị cho thuê xe",
                },
              ],
            },
            {
              journalId: "electricity-review",
              date: "2025-02-27",
              description: "Hóa đơn điện chưa rõ nguồn tiền",
              currency: "VND",
              state: "posted",
              movementType: "adjustment",
              ownerDeltaMinor: "10000000",
              companyFundsDeltaMinor: "0",
              runningOwnerBalanceMinor: "",
              ownerAccountCodes: ["3388-OWNER"],
              needsReview: true,
              classificationBasis: "unresolved_owner_current_movement",
              sources: [
                {
                  sourceType: "purchase_invoice",
                  sourceId: "electricity-invoice",
                  title: "ELECTRICITY",
                  detail: "Chỉ có hóa đơn, chưa xác nhận chủ chi",
                  sourceHref: "/documents/electricity-invoice",
                  expenseClass: null,
                  category: "ELECTRICITY",
                  citState: "eligible",
                  vatState: "eligible",
                  grossMinor: "10000000",
                  payeeName: "Công ty điện lực",
                },
              ],
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
  await expect(page.getByText("Dư xác nhận theo dòng tiền", { exact: true })).toBeVisible();
  await expect(page.getByText("Dòng tiền công nợ chủ đã xác nhận", { exact: true })).toBeVisible();
  await expect(page.getByText(/Số dư Owner Current trên sổ cái:/)).toContainText("85.500.000 ₫");
  await expect(page.getByText(/Chênh lệch chưa đưa vào dòng tiền xác nhận/)).toContainText(
    "30.500.000 ₫",
  );
  await expect(
    page.getByText("Công ty hoàn trả tiền chủ đã chi hộ", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Lương nhân sự tháng 2/2025" })).toHaveAttribute(
    "href",
    "/expenses/expense-payroll",
  );
  await expect(page.getByText("SALARY", { exact: true })).toBeVisible();
  await expect(page.getByText("payroll_personnel", { exact: true })).toBeVisible();
  const confirmedSection = page.getByTestId("confirmed-owner-current");
  const reviewSection = page.getByTestId("owner-current-review");
  await expect(confirmedSection.getByText("TNDN: eligible", { exact: true })).toBeVisible();
  await expect(page.getByText("45.000.000 ₫", { exact: true }).first()).toBeVisible();
  await expect(confirmedSection.getByText("Công ty trả nợ chủ", { exact: true })).toBeVisible();
  await expect(page.getByText("Cần kiểm tra phân loại", { exact: true })).toHaveCount(2);
  await expect(confirmedSection.getByText("VEHICLE_RENTAL", { exact: true })).toHaveCount(0);
  await expect(confirmedSection.getByText("ELECTRICITY", { exact: true })).toHaveCount(0);
  await expect(reviewSection.getByText("VEHICLE_RENTAL", { exact: true }).first()).toBeVisible();
  await expect(reviewSection.getByText("ELECTRICITY", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("100.000.000 ₫", { exact: true })).toHaveCount(3);
  await expect(page.getByText("55.000.000 ₫", { exact: true })).toHaveCount(2);
  await expect(
    page.getByRole("link", { name: "Công ty hoàn trả tiền chủ đã chi hộ" }),
  ).toHaveAttribute("href", "/accounting/journals?journalId=owner-repayment-45m");
  await expect(page.getByText("Chưa liên kết nguồn chi phí")).toHaveCount(0);
});
