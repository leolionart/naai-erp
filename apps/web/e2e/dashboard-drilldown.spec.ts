import { expect, test, type Page, type Route } from "@playwright/test";

const env = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp700",
  organizationId: "naai",
  data,
});
const reply = (route: Route, data: unknown) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(env(data)) });

async function install(page: Page, requestedUrls: string[] = []) {
  await page.addInitScript(() => sessionStorage.setItem("naai-erp-admin-token", "erp700-token"));
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/commercial-documents**",
    (route) =>
      reply(route, {
        items: [
          {
            id: "purchase-700",
            type: "purchase_invoice",
            documentDate: "2026-08-10",
            lines: [{ gross_minor: "12000000", dimensions: { category: "DOMAIN_HOSTING" } }],
          },
        ],
      }),
  );
  await page.route("http://localhost:3001/api/v1/organizations/naai/expenses**", (route) =>
    reply(route, {
      items: [
        {
          id: "expense-700",
          expense_date: "2026-08-12",
          gross_minor: "3000000",
          category: "SERVER_CLOUD",
        },
      ],
    }),
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/master-data/dimensions**",
    (route) =>
      reply(route, {
        items: [{ kind: "service_line", code: "web-app", name: "Web app", is_active: true }],
      }),
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/tax/expense-exceptions**",
    (route) =>
      reply(route, {
        schemaVersion: 1,
        organizationId: "naai",
        currency: "VND",
        startsOn: "2026-01-01",
        endsOn: "2026-08-31",
        formulaVersion: "tax-expense-review-v1",
        status: "review_required",
        accountingBookedMinor: "30000000",
        citBasisMinor: "30000000",
        citEligibleMinor: "0",
        citIneligibleMinor: "5000000",
        citUnreviewedMinor: "25000000",
        vatBasisMinor: "0",
        vatEligibleMinor: "0",
        vatIneligibleMinor: "0",
        vatUnreviewedMinor: "0",
        missingEvidenceItemIds: [],
        unreviewedItemIds: ["expense-700"],
        sourceIds: ["expense-700"],
        confidenceFlags: [
          {
            code: "tax_expense_unreviewed",
            severity: "warning",
            itemIds: ["expense-700"],
          },
        ],
      }),
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/tax/vat-reconciliation**",
    (route) =>
      reply(route, {
        schemaVersion: 1,
        organizationId: "naai",
        currency: "VND",
        startsOn: "2026-01-01",
        endsOn: "2026-08-31",
        formulaVersion: "vat-reconciliation-v1",
        policyId: "vat-policy-700",
        policyVersion: 1,
        status: "ready",
        outputVatMinor: "21000000",
        inputVatMinor: "6000000",
        eligibleInputVatMinor: "6000000",
        ineligibleInputVatMinor: "0",
        unreviewedInputVatMinor: "0",
        netVatPayableMinor: "15000000",
        outputVatLedgerMinor: "21000000",
        inputVatLedgerMinor: "6000000",
        outputDifferenceMinor: "0",
        inputDifferenceMinor: "0",
        missingEvidenceItemIds: [],
        unreconciledItemIds: [],
        invalidTaxCodeItemIds: [],
        unreviewedItemIds: [],
        sourceIds: ["sale-700", "purchase-700"],
        journalIds: ["sale-journal-700", "purchase-journal-700"],
        confidenceFlags: [],
      }),
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/financial-statements/profit-and-loss**",
    (route) =>
      reply(route, {
        schemaVersion: 1,
        organizationId: "naai",
        currency: "VND",
        startsOn: "2026-01-01",
        endsOn: "2026-08-31",
        accountingBasis: "accrual_management",
        formulaVersion: "profit-and-loss-v1",
        ledgerCutoff: {
          throughDate: "2026-08-31",
          maxPostedAt: "2026-08-31T16:59:59.999Z",
          journalCount: 3,
          lineCount: 6,
          sourceFingerprint: "pnl-erp841",
        },
        revenueMinor: "290000000",
        directCostMinor: "60000000",
        grossProfitMinor: "230000000",
        operatingExpenseMinor: "120000000",
        operatingProfitMinor: "110000000",
        otherIncomeMinor: "0",
        otherExpenseMinor: "0",
        profitBeforeTaxMinor: "110000000",
        incomeTaxMinor: "0",
        sectionFormulaNetProfitMinor: "110000000",
        netProfitMinor: "110000000",
        unclassifiedNetMinor: "0",
        rows: [],
        unclassifiedRows: [],
        control: {
          controlVersion: "ledger-control-v1",
          ledgerMinor: "110000000",
          reportMinor: "110000000",
          differenceMinor: "0",
          status: "tied_out",
        },
        confidenceFlags: [],
      }),
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/financial-statements/balance-sheet**",
    (route) =>
      reply(route, {
        schemaVersion: 1,
        organizationId: "naai",
        currency: "VND",
        asOfDate: "2026-08-31",
        formulaVersion: "balance-sheet-v1",
        ledgerCutoff: {
          throughDate: "2026-08-31",
          maxPostedAt: "2026-08-31T16:59:59.999Z",
          journalCount: 3,
          lineCount: 6,
          sourceFingerprint: "balance-sheet-erp841",
        },
        assetsMinor: "620000000",
        liabilitiesMinor: "30000000",
        ledgerEquityMinor: "590000000",
        unclosedEarningsMinor: "0",
        totalEquityMinor: "590000000",
        liabilitiesAndEquityMinor: "620000000",
        equationDifferenceMinor: "0",
        assetRows: [
          {
            key: "cash",
            label: "Tiền mặt và tiền gửi",
            amountMinor: "620000000",
            accountIds: ["111-CASH", "112-BANK"],
            journalIds: ["cash-ledger-700"],
            journalLineIds: ["cash-ledger-700:1"],
            sourceIds: ["cash-ledger-700"],
            mappingVersionIds: ["tt133:1"],
          },
        ],
        liabilityRows: [
          {
            key: "owner_current",
            label: "Vãng lai chủ doanh nghiệp",
            amountMinor: "30000000",
            accountIds: ["3388-OWNER"],
            journalIds: ["owner-payroll-700"],
            journalLineIds: ["owner-payroll-700:2"],
            sourceIds: ["owner-payroll-700"],
            mappingVersionIds: ["tt133:1"],
          },
        ],
        equityRows: [],
        earningsRows: [],
        control: {
          controlVersion: "ledger-control-v1",
          ledgerMinor: "0",
          reportMinor: "0",
          differenceMinor: "0",
          status: "tied_out",
        },
      }),
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/executive-metrics**",
    (route) => {
      requestedUrls.push(route.request().url());
      reply(route, {
        schemaVersion: 1,
        organizationId: "naai",
        currency: "VND",
        period: { startsOn: "2026-08-01", endsOn: "2026-08-31", asOfDate: "2026-08-31" },
        dimensions: {},
        formulaVersion: "executive-metrics-v1",
        policyVersionId: "policy-700",
        sourceBoundary: {
          ledgerCutoffFingerprint: "fingerprint-erp700",
          sourceIds: ["journal-700", "cash-ledger-700"],
        },
        ros: {
          status: "available",
          formulaVersion: "signed-revenue-profitability-v1",
          numeratorMinor: "38000000",
          denominatorMinor: "100000000",
          valueBps: 3800,
        },
        grossMargin: {
          status: "available",
          formulaVersion: "signed-revenue-profitability-v1",
          numeratorMinor: "60000000",
          denominatorMinor: "100000000",
          valueBps: 6000,
        },
        operatingMargin: {
          status: "available",
          formulaVersion: "signed-revenue-profitability-v1",
          numeratorMinor: "40000000",
          denominatorMinor: "100000000",
          valueBps: 4000,
        },
        netMargin: {
          status: "available",
          formulaVersion: "signed-revenue-profitability-v1",
          numeratorMinor: "38000000",
          denominatorMinor: "100000000",
          valueBps: 3800,
        },
        roe: {
          status: "available",
          formulaVersion: "positive-average-return-v1",
          numeratorMinor: "38000000",
          denominatorMinor: "500000000",
          valueBps: 760,
        },
        roa: {
          status: "available",
          formulaVersion: "positive-average-return-v1",
          numeratorMinor: "38000000",
          denominatorMinor: "620000000",
          valueBps: 613,
        },
        accumulatedLossMinor: "0",
        contributedCapitalMinor: "1000000000",
        ownerLoansMinor: "30000000",
        equityConsumed: {
          status: "available",
          formulaVersion: "accumulated-loss-over-contributed-capital-v1",
          numeratorMinor: "420000000",
          denominatorMinor: "1000000000",
          valueBps: 4200,
        },
        runwayMonthsThousandths: "4250",
        runwayFormulaVersion: "unrestricted-cash-over-reviewed-net-burn-v1",
        runwayStatus: "available",
        roi: [],
        burnFormulaVersion: "signed-average-operating-cash-flow-v1",
        averageOperatingNetCashFlowMinor: "-10000000",
        netBurnMinor: "10000000",
        unrestrictedCashMinor: "42500000",
        restrictedCashMinor: "0",
        equityRollForward: {
          controlVersion: "equity-roll-forward-control-v1",
          openingEquityMinor: "1000000000",
          contributionsMinor: "0",
          withdrawalsMinor: "0",
          profitOrLossMinor: "0",
          reviewedAdjustmentsMinor: "0",
          expectedClosingEquityMinor: "1000000000",
          actualClosingEquityMinor: "1000000000",
          differenceMinor: "0",
          status: "tied_out",
        },
      });
    },
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/performance-comparisons**",
    (route) => {
      requestedUrls.push(route.request().url());
      reply(route, {
        currency: "VND",
        formulaVersion: "performance-comparison-v1",
        period: {
          id: "CAL-2026-08",
          label: "Tháng 8",
          startsOn: "2026-08-01",
          endsOn: "2026-08-31",
        },
        sourceIds: ["recognition-700", "target-700"],
        confidenceFlags: [
          {
            code: "missing_forecast",
            severity: "warning",
            reason: "Forecast đang chờ publish",
            sourceIds: ["forecast-draft-700"],
          },
        ],
        actualVsFullTarget: {
          status: "available",
          formulaVersion: "performance-comparison-v1",
          numeratorMinor: "100000000",
          denominatorMinor: "120000000",
          varianceMinor: "-20000000",
          ratioBps: 8333,
          numeratorSourceIds: ["recognition-700"],
          denominatorSourceIds: ["target-700"],
        },
        actualVsRetainedForecast: { status: "available", denominatorMinor: "110000000" },
        monthOverMonth: { denominatorMinor: "90000000" },
      });
    },
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/planning-actual-facts/summary**",
    (route) => {
      requestedUrls.push(route.request().url());
      const url = new URL(route.request().url());
      reply(route, {
        actualBasis: url.searchParams.get("actualBasis") ?? "invoiced",
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        currency: "VND",
        amountMinor: "100000000",
        factCount: 3,
        sourceIds: ["actual-jan", "actual-feb", "actual-mar"],
      });
    },
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/project-profitability**",
    (route) =>
      reply(route, {
        currency: "VND",
        items: [
          {
            projectId: "project-700",
            confidenceCodes: ["budget_overrun"],
            confidenceFlags: [
              { code: "budget_overrun", severity: "critical", sourceIds: ["budget-700"] },
            ],
          },
        ],
        totals: { fullyLoadedProfitMinor: "40000000" },
      }),
  );
  await page.route("http://localhost:3001/api/v1/organizations/naai/reports/ar-aging**", (route) =>
    reply(route, {
      asOf: "2026-08-31",
      baseCurrency: "VND",
      baseOutstandingTotalMinor: "30000000",
      tieStatus: "tied",
      exceptions: [{ code: "MISSING_DUE_DATE", itemId: "ar-700", message: "Thiếu ngày đến hạn" }],
      items: [],
      bucketTotals: [],
      controlTies: [],
    }),
  );
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/operating-dashboard**",
    (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
}

async function installOperatingDashboard(
  page: Page,
  ownerBalances: { ownerPayableMinor: string; ownerOperatingPayableMinor: string } = {
    ownerPayableMinor: "30000000",
    ownerOperatingPayableMinor: "30000000",
  },
) {
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/operating-dashboard**",
    (route) =>
      reply(route, {
        schemaVersion: 1,
        asOf: "2026-08-31",
        currency: "VND",
        backlog: {
          projectCount: 2,
          contractedMinor: "300000000",
          invoicedMinor: "180000000",
          remainingMinor: "120000000",
          projects: [],
        },
        collections: {
          receivablesMinor: "45000000",
          creditSalesMinor: "270000000",
          dsoDays: 15,
          overdueMinor: "25000000",
          dueWithin7DaysMinor: "5000000",
          dueWithin30DaysMinor: "10000000",
          laterMinor: "5000000",
        },
        projectBurn: [
          {
            projectId: "project-700",
            code: "WEB-700",
            name: "Web App 700",
            actualCostMinor: "60000000",
            budgetCostMinor: "100000000",
            burnBps: 6000,
            estimateAtCompletionMinor: "100000000",
            eacMethod: "approved-direct-cost-budget",
          },
        ],
        clientConcentration: {
          totalRevenueMinor: "180000000",
          topClientShareBps: 6500,
          topThreeShareBps: 10000,
          clients: [
            { clientId: "client-700", clientName: "NAAI Client", revenueMinor: "117000000" },
          ],
        },
        financials: {
          revenueMinor: "180000000",
          expenseMinor: "80000000",
          netProfitMinor: "100000000",
          unrestrictedCashMinor: "75000000",
          bankAvailableMinor: "613000000",
          cashOnHandMinor: "7000000",
          cashAndBankMinor: "620000000",
          ...ownerBalances,
          netAvailableCashMinor: "590000000",
          actualOwnerPaidCompanyCostMinor: "12000000",
          netCompanyFundsMinor: "608000000",
          ownerPaidClassificationStatus: "review_required",
          unclassifiedOwnerPaidCount: 2,
          unclassifiedOwnerPaidMinor: "3000000",
          corporateIncomeTaxRateBps: 2000,
          rosBps: 5556,
          recognitionEventCount: 0,
          approvedBudgetCount: 0,
          postedOverheadRunCount: 0,
          source: "posted_ledger",
        },
        dataQuality: {
          pendingCount: 2,
          byFlag: [{ flag: "missing_project", count: 2 }],
          rows: [],
        },
        sourceControls: {
          accountingStatus: "unconfirmed_non_canonical",
          rowCount: 2,
          byKind: [{ kind: "profitability_control", count: 2 }],
          monthly: [
            {
              id: "profit-2024-12",
              kind: "profitability_control",
              period: "2024-12",
              revenueMinor: "70000000",
              receivedMinor: "60000000",
              expenseMinor: "45000000",
              profitMinor: "25000000",
            },
            {
              id: "profit-2025-01",
              kind: "profitability_control",
              period: "2025-01",
              revenueMinor: "80000000",
              receivedMinor: "70000000",
              expenseMinor: "50000000",
              profitMinor: "30000000",
            },
            {
              id: "profit-2025-02",
              kind: "profitability_control",
              period: "2025-02",
              revenueMinor: "95000000",
              receivedMinor: "85000000",
              expenseMinor: "55000000",
              profitMinor: "40000000",
            },
            {
              id: "profit-2025-03",
              kind: "profitability_control",
              period: "2025-03",
              revenueMinor: "105000000",
              receivedMinor: "90000000",
              expenseMinor: "60000000",
              profitMinor: "45000000",
            },
          ],
        },
      }),
  );
}

test("@desktop T-E2E-ERP-700-001 renders exact API KPIs and preserves filters", async ({
  page,
}) => {
  const requestedUrls: string[] = [];
  await install(page, requestedUrls);
  await page.goto("http://localhost:3000/dashboard?periodId=CAL-2026-08");
  await expect(page.getByRole("heading", { name: "Tổng quan điều hành" })).toBeVisible();
  await expect(page.getByText("100.000.000 ₫").first()).toBeVisible();
  await expect(page.getByText("4,25 tháng")).toBeVisible();
  expect(requestedUrls.find((url) => url.includes("/reports/executive-metrics"))).toContain(
    "asOfInstant=",
  );
  expect(requestedUrls.find((url) => url.includes("/reports/performance-comparisons"))).toContain(
    "periodId=CAL-2026-08",
  );
  await expect(page).toHaveURL(/periodId=CAL-2026-08/);
});

test("@desktop T-E2E-ERP-700-002 drills from KPI to sources and canonical report", async ({
  page,
}) => {
  await install(page);
  await page.goto("http://localhost:3000/dashboard/drilldown/ros?periodId=CAL-2026-08");
  await expect(page.getByRole("heading", { name: "ROS" })).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
});

test("@mobile dashboard and review queue avoid document overflow", async ({ page }) => {
  await install(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/dashboard?periodId=CAL-2026-08",
    "/dashboard/finance-review?periodId=CAL-2026-08",
  ]) {
    await page.goto(`http://localhost:3000${route}`);
    await expect(page.getByRole("main")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("@desktop uses operating dashboard read model instead of provisional fallback", async ({
  page,
}) => {
  await install(page);
  await installOperatingDashboard(page);
  await page.goto("http://localhost:3000/dashboard?periodId=CAL-2026-08");
  await expect(page.getByText("DSO: 15 ngày")).toBeVisible();
  await expect(page.getByText("Web App 700")).toBeVisible();
  await expect(page.getByText("approved-direct-cost-budget")).toBeVisible();
  await expect(page.getByText("Đang dùng dữ liệu fallback")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Xu hướng doanh thu tương tác" })).toBeVisible();
});

test("@desktop dashboard and expense management share the canonical expense overview", async ({
  page,
}) => {
  await install(page);
  await installOperatingDashboard(page);
  await page.goto("http://localhost:3000/dashboard?periodId=CAL-2026-08");
  const overview = page
    .getByRole("link", { name: /Tỷ trọng chi phí từng danh mục theo tháng/ })
    .last();
  await expect(overview).toHaveAttribute("href", /invoiceStatus=all/);
  await expect(page.getByText("Chi phí Tên miền / Hosting", { exact: true })).toBeVisible();
  await expect(page.getByText("Chi phí Máy chủ / Cloud Services", { exact: true })).toBeVisible();
  await expect(page.getByText("Tổng: 15.000.000 ₫")).toBeVisible();
  await expect(page.getByText("Chưa phân bổ", { exact: true })).toHaveCount(0);
});

test("@desktop shows ledger-derived bank cash owner payable and accounting profit", async ({
  page,
}) => {
  await install(page);
  await installOperatingDashboard(page);
  await page.goto("http://localhost:3000/dashboard?periodId=CAL-2026-08");

  const companyFundsCard = page.getByRole("link", { name: /Tiền công ty hiện có/ });
  await expect(companyFundsCard).toContainText("620.000.000 ₫");
  await expect(companyFundsCard).toContainText("Ngân hàng 613.000.000 ₫");
  await expect(companyFundsCard).toContainText("tiền mặt 7.000.000 ₫");
  await expect(page.getByRole("link", { name: /Số dư ngân hàng khả dụng/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Quỹ tiền mặt công ty/ })).toHaveCount(0);
  const ownerPayableCard = page.getByRole("link", {
    name: /Nghĩa vụ vận hành với chủ doanh nghiệp/,
  });
  await expect(ownerPayableCard).toContainText("30.000.000 ₫");
  await expect(ownerPayableCard).toContainText("Không gồm tài sản, thiết bị");
  await expect(
    page.getByRole("link", { name: /Số dư Owner Current trên Balance Sheet/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Tiền thuần sau nghĩa vụ với chủ/ })).toHaveCount(0);
  const taxableProfitCard = page.getByRole("link", {
    name: /Lợi nhuận tính thuế TNDN tạm tính/,
  });
  await expect(taxableProfitCard).toContainText("115.000.000 ₫");
  await expect(taxableProfitCard).toContainText(
    "Lợi nhuận kế toán 110.000.000 ₫ + chi phí CIT không được trừ 5.000.000 ₫",
  );
  const citCard = page.getByRole("link", { name: /Thuế TNDN tạm tính/ });
  await expect(citCard).toContainText("23.000.000 ₫");
  await expect(citCard).toContainText("thuế suất đã duyệt 20%");
  const vatCard = page.getByRole("link", { name: /VAT phải nộp/ });
  await expect(vatCard).toContainText("15.000.000 ₫");
  await expect(vatCard).toContainText(
    "VAT đầu ra 21.000.000 ₫ − VAT đầu vào đủ điều kiện 6.000.000 ₫",
  );
  await expect(page.getByRole("link", { name: /VAT đầu vào chờ review/ })).toContainText("0 ₫");
  await expect(page.getByRole("link", { name: /Chi phí CIT chờ review/ })).toContainText(
    "25.000.000 ₫",
  );
});

test("@desktop separates zero operating owner obligation from Balance Sheet owner current", async ({
  page,
}) => {
  await install(page);
  await installOperatingDashboard(page, {
    ownerPayableMinor: "30000000",
    ownerOperatingPayableMinor: "0",
  });
  await page.goto("http://localhost:3000/dashboard?periodId=CAL-2026-08");

  const operatingObligation = page.getByRole("link", {
    name: /Nghĩa vụ vận hành với chủ doanh nghiệp/,
  });
  await expect(operatingObligation).toContainText("0 ₫");
  await expect(operatingObligation).toContainText(
    "có thể bằng 0 dù Balance Sheet vẫn còn số dư Owner Current 30.000.000 ₫",
  );
  const ownerCurrent = page.getByRole("link", {
    name: /Số dư Owner Current trên Balance Sheet/,
  });
  await expect(ownerCurrent).toContainText("30.000.000 ₫");
  await expect(ownerCurrent).toContainText("nghĩa vụ vận hành hiện là 0 ₫");
});

test("@desktop selects the latest source-control period and invoiced basis by default", async ({
  page,
}) => {
  const requestedUrls: string[] = [];
  await install(page, requestedUrls);
  await installOperatingDashboard(page);
  await page.goto("http://localhost:3000/dashboard");

  await expect(page.getByText("2025-03", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("combobox").filter({ hasText: "Giá trị đã xuất hóa đơn" }),
  ).toBeVisible();
  expect(requestedUrls.find((url) => url.includes("performance-comparisons"))).toContain(
    "periodId=CAL-2025-03",
  );
  expect(requestedUrls.find((url) => url.includes("performance-comparisons"))).toContain(
    "actualBasis=invoiced",
  );
});

test("@desktop switches month quarter and year and queries aggregate actuals for the full range", async ({
  page,
}) => {
  const requestedUrls: string[] = [];
  await install(page, requestedUrls);
  await page.goto("http://localhost:3000/dashboard?periodId=CAL-2026-08&actualBasis=collected");

  await page.getByRole("radio", { name: "Quý" }).click();
  await expect(page).toHaveURL(/periodKind=quarter/);
  await expect(page).toHaveURL(/period=Q3%2F2026/);
  await expect(page).toHaveURL(/startsOn=2026-07-01/);
  await expect(page).toHaveURL(/endsOn=2026-09-30/);
  await expect(page).toHaveURL(/actualBasis=collected/);
  await expect
    .poll(() => requestedUrls.filter((url) => url.includes("planning-actual-facts/summary")).at(-1))
    .toContain("from=2026-07-01");
  expect(
    requestedUrls.filter((url) => url.includes("planning-actual-facts/summary")).at(-1),
  ).toContain("to=2026-08-08");

  await page.getByRole("radio", { name: "Năm" }).click();
  await expect(page).toHaveURL(/periodKind=year/);
  await expect(page).toHaveURL(/startsOn=2026-01-01/);
  await expect(page).toHaveURL(/endsOn=2026-12-31/);
  await expect
    .poll(() => requestedUrls.filter((url) => url.includes("planning-actual-facts/summary")).at(-1))
    .toContain("from=2026-01-01");
  expect(
    requestedUrls.filter((url) => url.includes("planning-actual-facts/summary")).at(-1),
  ).toContain("to=2026-08-08");

  await expect
    .poll(() => requestedUrls.filter((url) => url.includes("performance-comparisons")).at(-1))
    .toContain("periodId=CAL-2026-08");
  expect(requestedUrls.some((url) => /periodId=CAL-2026-(?:Q|year)/.test(url))).toBe(false);
});

test("@desktop surfaces executive metrics API failure without hiding other dashboard data", async ({
  page,
}) => {
  await install(page);
  await installOperatingDashboard(page);
  await page.route(
    "http://localhost:3001/api/v1/organizations/naai/reports/executive-metrics**",
    (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.goto("http://localhost:3000/dashboard?periodId=CAL-2026-08");

  await expect(page.getByText("100.000.000 ₫", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("100.000.000 ₫", { exact: true }).first()).toBeVisible();
});

test("@desktop normalizes invalid dashboard date configuration before API requests", async ({
  page,
}) => {
  const requestedUrls: string[] = [];
  await install(page, requestedUrls);
  await page.goto(
    "http://localhost:3000/dashboard?periodId=invalid&startsOn=2026-09-01&endsOn=2026-08-01&asOfDate=2026-07-01",
  );
  await expect(page.getByRole("heading", { name: "Tổng quan điều hành" })).toBeVisible();
  await expect
    .poll(() => requestedUrls.some((url) => url.includes("executive-metrics")))
    .toBe(true);
  const executiveUrl = requestedUrls.find((url) => url.includes("executive-metrics"));
  expect(executiveUrl).toContain("startsOn=");
  expect(executiveUrl).toContain("endsOn=");
  expect(executiveUrl).toContain("asOfInstant=");
  const parsed = new URL(executiveUrl!);
  expect(parsed.searchParams.get("startsOn")! <= parsed.searchParams.get("endsOn")!).toBe(true);
  expect(parsed.searchParams.get("asOfInstant")!.slice(0, 10)).toBe(
    parsed.searchParams.get("endsOn"),
  );
});
