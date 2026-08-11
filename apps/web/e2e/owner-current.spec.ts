import { expect, test } from "@playwright/test";

test("@desktop @mobile owner settlement shows confirmed debt custody and withdrawals only", async ({
  page,
}) => {
  let createdWithdrawal: Record<string, unknown> | undefined;
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
            statutoryOwnerCurrentBalanceMinor: "78163950",
            confirmedSettlementBalanceMinor: "-21836050",
            companyOwesOwnerMinor: "0",
            ownerHoldsCompanyFundsMinor: "21836050",
            ownerPaidCompanyCostMinor: "165483950",
            ownerCustodyCashMinor: "135320000",
            ownerPersonalWithdrawalMinor: "52000000",
            ownerFundingMinor: "0",
            reviewMinor: "100000000",
            reviewCount: 1,
          },
          confirmedTimeline: [
            {
              journalId: "owner-personal-withdrawals",
              date: "2025-11-05",
              description: "Chủ rút tiền dùng cá nhân",
              currency: "VND",
              state: "posted",
              movementType: "owner_personal_withdrawal",
              classificationBasis: "company_funds_withdrawn_by_owner",
              needsReview: false,
              ownerDeltaMinor: "-52000000",
              companyFundsDeltaMinor: "-52000000",
              settlementDeltaMinor: "-52000000",
              runningConfirmedSettlementBalanceMinor: "-21836050",
              ownerAccountCodes: ["3388-OWNER"],
              counterpartLines: [],
              sources: [],
            },
            {
              journalId: "owner-custody-cash",
              date: "2025-07-30",
              description: "Tiền công ty giao chủ giữ",
              currency: "VND",
              state: "posted",
              movementType: "owner_custody_cash",
              classificationBasis: "canonical_owner_custody_receipt",
              needsReview: false,
              ownerDeltaMinor: "-135320000",
              companyFundsDeltaMinor: "-135320000",
              settlementDeltaMinor: "-135320000",
              runningConfirmedSettlementBalanceMinor: "30163950",
              ownerAccountCodes: ["3388-OWNER"],
              counterpartLines: [],
              sources: [],
            },
            {
              journalId: "owner-paid-expenses",
              date: "2025-02-15",
              description: "Chủ thanh toán chi phí công ty",
              currency: "VND",
              state: "posted",
              movementType: "owner_paid_company_cost",
              classificationBasis: "canonical_owner_paid_expense",
              needsReview: false,
              ownerDeltaMinor: "165483950",
              companyFundsDeltaMinor: "0",
              settlementDeltaMinor: "165483950",
              runningConfirmedSettlementBalanceMinor: "165483950",
              ownerAccountCodes: ["3388-OWNER"],
              counterpartLines: [],
              sources: [
                {
                  sourceType: "expense",
                  sourceId: "expense-payroll",
                  title: "Lương và chi phí chủ đã thanh toán",
                  detail: "Khoản chi có nguồn chủ trả rõ ràng",
                  sourceHref: "/expenses/expense-payroll",
                  expenseClass: "payroll_personnel",
                  category: "SALARY",
                  citState: "eligible",
                  vatState: "ineligible",
                  grossMinor: "165483950",
                  payeeName: "Nhân sự công ty",
                },
              ],
            },
          ],
          reviewItems: [
            {
              journalId: "unsupported-repayment-100m",
              date: "2026-03-22",
              description: "Khoản 100 triệu chưa đủ bằng chứng quyết toán",
              currency: "VND",
              state: "posted",
              proposedMovementType: "company_repayment_to_owner",
              reviewReason: "unsupported_company_repayment",
              needsReview: true,
              ownerDeltaMinor: "100000000",
              companyFundsDeltaMinor: "0",
              ownerAccountCodes: ["3388-OWNER"],
              counterpartLines: [],
              sources: [],
            },
          ],
        },
      }),
    }),
  );
  await page.route("**/api/v1/organizations/naai/banking/accounts", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        apiVersion: "v1",
        data: {
          items: [
            {
              id: "bank-main",
              display_name: "Tài khoản công ty",
              currency: "VND",
              status: "active",
            },
          ],
        },
      }),
    }),
  );
  await page.route("**/api/v1/organizations/naai/banking/owner-cash-withdrawals", async (route) => {
    createdWithdrawal = (await route.request().postDataJSON()) as Record<string, unknown>;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        apiVersion: "v1",
        data: {
          withdrawalId: "withdrawal-created",
          transactionId: "transaction-created",
          journalId: "journal-created",
          status: "posted",
        },
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/banking/owner-current");
  const confirmed = page.getByTestId("confirmed-owner-current");

  await expect(page.getByText("Công ty đang nợ chủ", { exact: true })).toBeVisible();
  await expect(page.getByText("Tiền công ty chủ đang giữ", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("21.836.050 ₫", { exact: true })).toHaveCount(1);
  await expect(page.getByText("165.483.950 ₫", { exact: true })).toHaveCount(3);
  await expect(confirmed.getByText("Tiền công ty chủ đang giữ", { exact: true })).toBeVisible();
  await expect(
    confirmed.getByText("Chủ rút tiền dùng cá nhân", { exact: true }).first(),
  ).toBeVisible();
  await expect(confirmed.getByText("-52.000.000 ₫", { exact: true }).first()).toBeVisible();
  await expect(confirmed.getByText("-135.320.000 ₫", { exact: true }).first()).toBeVisible();
  await expect(confirmed.getByText("-21.836.050 ₫", { exact: true })).toBeVisible();
  await expect(page.getByTestId("owner-current-review")).toHaveCount(0);
  await expect(page.getByText("Khoản chưa đủ bằng chứng để quyết toán với chủ")).toHaveCount(0);
  await expect(page.getByText("Khoản cần kiểm tra phân loại")).toHaveCount(0);
  await expect(page.getByText("Khoản 100 triệu chưa đủ bằng chứng quyết toán")).toHaveCount(0);

  const responsiveMetrics = await page.evaluate(() => {
    const tableContainer = document.querySelector<HTMLElement>(
      '[data-testid="owner-current-table-scroll"] [data-slot="table-container"]',
    );
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      tableClientWidth: tableContainer?.clientWidth ?? 0,
      tableScrollWidth: tableContainer?.scrollWidth ?? 0,
    };
  });
  expect(responsiveMetrics.documentWidth).toBeLessThanOrEqual(responsiveMetrics.viewportWidth + 1);
  expect(responsiveMetrics.tableClientWidth).toBeGreaterThan(0);
  expect(responsiveMetrics.tableScrollWidth).toBeGreaterThan(responsiveMetrics.tableClientWidth);

  await page.getByRole("button", { name: "Ghi nhận chủ rút tiền" }).click();
  await page.getByLabel("Ngày rút").fill("2026-08-11");
  await page.getByLabel("Rút từ tài khoản").click();
  await page.getByRole("option", { name: /Tài khoản công ty/ }).click();
  await page.getByLabel("Số tiền").fill("5.000.000");
  await page.getByLabel("Ghi chú").fill("Chủ rút tiền dùng cá nhân");
  await page.getByRole("button", { name: "Ghi nhận khoản rút" }).click();
  await expect(
    page.getByText("Đã ghi nhận khoản chủ rút tiền và cập nhật công nợ chủ."),
  ).toBeVisible();
  expect(createdWithdrawal).toMatchObject({
    schemaVersion: 1,
    movementType: "owner_personal_withdrawal",
    financialAccountId: "bank-main",
    bookingDate: "2026-08-11",
    amountMinor: "5000000",
    currency: "VND",
    description: "Chủ rút tiền dùng cá nhân",
  });
});
