import { describe, expect, it } from "vitest";
import {
  buildWorkbookImportPayload,
  canonicalPartyIdentityKey,
  inferReviewedProjectServiceLine,
} from "./import-workbooks.js";
import { workbookExpenseMigrationErrors } from "./workbook-expense-migration.js";

const projectPath = process.env.ERP740_PROJECT_WORKBOOK;
const financePath = process.env.ERP740_FINANCE_WORKBOOK;
const describeReal = projectPath && financePath ? describe : describe.skip;
const countBy = <T>(items: readonly T[], key: (item: T) => string) =>
  items.reduce<Record<string, number>>((counts, item) => {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});

describe("ERP-874 deterministic workbook relationship mapping", () => {
  it("deduplicates reviewed active-customer spelling variants without fuzzy name matching", () => {
    expect(canonicalPartyIdentityKey("WATA Tech")).toBe(canonicalPartyIdentityKey("WATAtek"));
    expect(canonicalPartyIdentityKey("VIOD")).not.toBe(canonicalPartyIdentityKey("OCD"));
  });

  it("maps reviewed unambiguous web labels and explicitly flags unsupported service labels", () => {
    const reviewedWebLabels = [
      "Web",
      "Website",
      "Web app",
      "Web application",
      "Website design",
      "Web development",
      "Website development",
      "Thiết kế website",
      "Phát triển website",
      "Thiết kế phát triển website",
      "  WEBSITE  ",
    ];
    expect(reviewedWebLabels.map((label) => inferReviewedProjectServiceLine([label]))).toEqual(
      reviewedWebLabels.map(() => ({ code: "WEB", reviewFlag: null })),
    );
    expect(inferReviewedProjectServiceLine(["Branding"])).toEqual({
      code: null,
      reviewFlag: "unmapped_service_line",
    });
    expect(inferReviewedProjectServiceLine([])).toEqual({
      code: null,
      reviewFlag: "missing_service_line",
    });
  });
});

describeReal("ERP-740 real workbook controls", () => {
  it("extracts exact detail and Tỷ suất lợi nhuận control totals", async () => {
    const payload = await buildWorkbookImportPayload(projectPath, financePath);
    expect(workbookExpenseMigrationErrors(payload.expenses)).toEqual([]);
    expect(payload.mappingVersion).toBe(4);
    const sales = payload.salesInvoices
      .filter((item) => String(item.documentDate).startsWith("2025"))
      .reduce((sum, item) => sum + BigInt(String(item.netMinor)), 0n);
    const expense = payload.expenses
      .filter((item) => String(item.date).startsWith("2025"))
      .reduce(
        (sum, item) => sum + BigInt(String(item.amountMinor)) - BigInt(String(item.taxMinor)),
        0n,
      );
    const legacySales = payload.salesInvoices
      .filter((item) => item.legacyControlTreatment.included)
      .reduce((sum, item) => sum + BigInt(String(item.netMinor)), 0n);
    const legacyExpense = payload.expenses
      .filter((item) => item.legacyControlTreatment.included)
      .reduce(
        (sum, item) => sum + BigInt(String(item.amountMinor)) - BigInt(String(item.taxMinor)),
        0n,
      );
    expect({ sales: sales.toString(), expense: expense.toString() }).toEqual({
      sales: "195261583",
      expense: "443293388",
    });
    expect(payload.controls).toEqual([
      {
        workbook: "finance",
        sheet: "Tỷ suất lợi nhuận",
        year: 2025,
        salesMinor: "244717833",
        expenseMinor: "298148067",
        profitMinor: "-53430234",
      },
    ]);
    expect({
      legacySales: legacySales.toString(),
      legacyExpense: legacyExpense.toString(),
    }).toEqual({
      legacySales: "244717833",
      legacyExpense: "298148067",
    });
    expect(
      payload.salesInvoices.filter(
        (item) =>
          item.documentDate.startsWith("2025") &&
          item.legacyControlTreatment.classification === "unassigned_source_month",
      ),
    ).toHaveLength(1);
    expect(
      payload.expenses
        .filter(
          (item) =>
            item.legacyControlTreatment.classification ===
            "recurring_personnel_excluded_from_operating_expense_control",
        )
        .reduce((sum, item) => sum + BigInt(String(item.amountMinor)), 0n)
        .toString(),
    ).toBe("203000000");
    expect(payload.salesInvoices.filter((item) => item.projectId)).toHaveLength(5);
    const genericClientId = payload.parties.find(
      (item) => item.displayName === "Generic Client",
    )?.id;
    expect(genericClientId).toBeTruthy();
    expect(payload.projects.filter((item) => item.clientPartyId !== genericClientId)).toHaveLength(
      3,
    );
    const zeroRows = payload.expenses.filter((item) => BigInt(String(item.amountMinor)) === 0n);
    expect(zeroRows.map((item) => item.sourceRowIndex)).toEqual([
      22, 46, 85, 90, 101, 110, 117, 129, 138, 151, 152, 161, 173, 177,
    ]);
    for (const item of zeroRows) {
      expect(item.legacyControlTreatment).toMatchObject({
        sourceSheet: "Chi phí",
        sourceRow: item.sourceRowIndex,
        classification: expect.any(String),
        evidence: expect.any(String),
      });
    }
    expect(payload.reviewRows).toHaveLength(399);
    expect(
      Object.fromEntries(
        [
          "project",
          "sales",
          "expense",
          "owner_movement",
          "debt_control",
          "profitability_control",
          "planning_control",
          "bonus_control",
          "payroll_master",
          "expense_category_control",
        ].map((kind) => [kind, payload.reviewRows.filter((item) => item.kind === kind).length]),
      ),
    ).toEqual({
      project: 29,
      sales: 41,
      expense: 214,
      owner_movement: 4,
      debt_control: 28,
      profitability_control: 12,
      planning_control: 12,
      bonus_control: 42,
      payroll_master: 3,
      expense_category_control: 14,
    });
    expect(
      Object.fromEntries(
        ["pending_review", "posted", "ignored"].map((status) => [
          status,
          payload.reviewRows.filter((item) => item.status === status).length,
        ]),
      ),
    ).toEqual({ pending_review: 391, posted: 8, ignored: 0 });
    const flagCount = (flag: string) =>
      payload.reviewRows.filter((item) => item.reviewFlags.includes(flag)).length;
    expect({
      genericClient: flagCount("generic_client"),
      genericPayee: flagCount("generic_payee"),
      missingProject: flagCount("missing_project"),
      missingBudget: flagCount("missing_budget"),
      ownerMovement: flagCount("owner_movement_requires_classification"),
      zeroValue: flagCount("zero_value"),
      duplicateInvoiceFile: flagCount("duplicate_invoice_file_reference"),
    }).toEqual({
      genericClient: 50,
      genericPayee: 6,
      missingProject: 36,
      missingBudget: 4,
      ownerMovement: 4,
      zeroValue: 14,
      duplicateInvoiceFile: 25,
    });
    expect(
      payload.reviewRows.filter((item) => item.kind === "owner_movement").map((item) => item.row),
    ).toEqual([25, 27, 29, 31]);
    expect(
      payload.reviewRows
        .filter((item) => item.reviewFlags.includes("zero_value"))
        .map((item) => item.row),
    ).toEqual([22, 46, 85, 90, 101, 110, 117, 129, 138, 151, 152, 161, 173, 177]);
    const projectRow = payload.reviewRows.find((item) => item.kind === "project" && item.row === 2);
    expect(projectRow?.rawData).toMatchObject({
      groupChat: expect.any(String),
      participants: expect.any(String),
      taskDone: expect.any(String),
      projectTimeDays: expect.any(String),
      workloadHours: expect.any(String),
      sourceMonth: expect.any(String),
    });
    const salesRow = payload.reviewRows.find((item) => item.kind === "sales" && item.row === 2);
    expect(salesRow?.rawData).toMatchObject({
      actualReceived: expect.any(String),
      monthLabel: expect.any(String),
      status: expect.any(String),
      invoiceIssued: expect.any(String),
      action: expect.any(String),
    });
    const expenseEvidenceRows = payload.reviewRows.filter(
      (item) => item.kind === "expense" && item.rawData.invoiceFile,
    );
    expect(expenseEvidenceRows).toHaveLength(144);
    const purchaseInvoiceRows = payload.reviewRows.filter((item) => item.kind === "expense");
    expect(purchaseInvoiceRows).toHaveLength(214);
    expect(
      purchaseInvoiceRows.every((item) => item.proposedResourceType === "purchase_invoice"),
    ).toBe(true);
    expect(
      purchaseInvoiceRows.filter((item) =>
        item.reviewFlags.includes("invoice_date_inferred_from_transaction_date"),
      ),
    ).toHaveLength(59);
    expect(
      purchaseInvoiceRows.filter((item) =>
        item.reviewFlags.includes("purchase_tax_review_required"),
      ),
    ).toHaveLength(214);
    expect(countBy(payload.expenses, (item) => String(item.sourceMetadata.categoryCode))).toEqual({
      BONUS: 11,
      CASH_TRANSFER: 5,
      CLOUD_DIGITAL_SERVICES: 5,
      DEPOSIT_REFUND: 1,
      DOMAIN_SOFTWARE: 3,
      ELECTRICITY_UTILITIES: 19,
      ELECTRONICS_EQUIPMENT: 10,
      EV_BATTERY_CHARGING: 30,
      HEALTH_WELLNESS: 1,
      INTERNET_TELECOM: 16,
      MEALS_ENTERTAINMENT: 48,
      OFFICE_FURNISHINGS: 4,
      OTHER_OPERATING: 4,
      PAYROLL: 47,
      SPORTS_RECREATION: 2,
      TAXES_FEES: 5,
      TRAVEL_TRANSPORT: 3,
    });
    expect(
      countBy(payload.expenses, (item) => String(item.sourceMetadata.supplierInferenceSource)),
    ).toEqual({ category_default: 2, note: 151, personnel: 55, unresolved: 6 });
    expect(
      payload.expenses.find((item) => item.sourceRowIndex === 7)?.sourceMetadata,
    ).toMatchObject({
      supplierDisplayName: "CÔNG TY TNHH NHÀ HÀNG HÀN QUỐC MEAT & MEET",
      supplierInferenceSource: "note",
      categoryCode: "MEALS_ENTERTAINMENT",
      categoryLabel: "Ăn uống và tiếp khách",
      categoryInferenceSource: "expense_type",
    });
    expect(
      payload.expenses.find((item) => item.sourceRowIndex === 141)?.sourceMetadata,
    ).toMatchObject({
      supplierDisplayName: "Freepik Company, SL",
      categoryCode: "CLOUD_DIGITAL_SERVICES",
      categoryInferenceSource: "note",
    });
    expect(
      payload.expenses.find((item) => item.sourceRowIndex === 145)?.sourceMetadata,
    ).toMatchObject({
      supplierDisplayName: "CÔNG TY TNHH KINH DOANH THƯƠNG MẠI VÀ DỊCH VỤ VINFAST",
      categoryCode: "EV_BATTERY_CHARGING",
      categoryInferenceSource: "note",
    });
    for (const payrollRow of payload.reviewRows.filter((item) => item.kind === "payroll_master")) {
      expect(payrollRow.rawData).not.toHaveProperty("Phone Number");
      expect(payrollRow.rawData).not.toHaveProperty("CCCD");
      expect(payrollRow.rawData).not.toHaveProperty("Birthday");
      expect(payrollRow.rawData).not.toHaveProperty("Email");
    }
    expect(
      payload.reviewRows.find((item) => item.kind === "debt_control" && item.row === 2)?.mappedData,
    ).toEqual({
      sourceControl: { workbook: "finance", sheet: "Công nợ", row: 2 },
      period: "2025-01",
      projectLabel: "Yêu lắm VN",
      debtMinor: "0",
      projectCostMinor: "20000000",
      collectedMinor: null,
    });
    expect(
      payload.reviewRows.find((item) => item.kind === "profitability_control" && item.row === 2)
        ?.mappedData,
    ).toMatchObject({
      sourceControl: { workbook: "finance", sheet: "Tỷ suất lợi nhuận", row: 2 },
      period: "2025-01",
      revenueMinor: "5068082",
      receivedMinor: "5068082",
      expenseMinor: "27679666",
      profitMinor: "-22611584",
    });
    expect(
      payload.reviewRows.find((item) => item.kind === "planning_control" && item.row === 2)
        ?.mappedData,
    ).toMatchObject({
      sourceControl: { workbook: "finance", sheet: "Planing & Target", row: 2 },
      period: "2025-01",
      revenueMinor: "5068082",
      receivedMinor: "5068082",
      expenseMinor: "25000000",
      profitMinor: "-19931918",
      targetAttainmentBps: 2000,
      forecastExpenseMinor: "18000000",
      forecastCashMinor: "-12931918",
    });
    expect(
      payload.reviewRows.find((item) => item.kind === "bonus_control" && item.row === 2)
        ?.mappedData,
    ).toMatchObject({
      sourceControl: { workbook: "finance", sheet: "Tỉ lệ thưởng", row: 2 },
      period: "2025-01",
      personName: "Chang",
      bonusMinor: "1000000",
      revenueMinor: "5068082",
    });
    expect(
      payload.reviewRows.find((item) => item.kind === "payroll_master" && item.row === 4)
        ?.mappedData,
    ).toEqual({
      sourceControl: { workbook: "finance", sheet: "Bảng lương", row: 4 },
      personName: "Chang",
      payrollNetMinor: "3000000",
      employmentStatus: "Active",
      department: "Operation",
      tenure: "2.8",
      employmentType: "Part-time",
      hireDate: "2023-11-01",
    });
    expect(
      payload.reviewRows.find((item) => item.kind === "expense_category_control" && item.row === 3)
        ?.mappedData,
    ).toEqual({
      sourceControl: { workbook: "finance", sheet: "Hạng mục chi", row: 3 },
      category: "Chi phí lương",
      monthlyAmounts: [
        { period: "2025-01", amountMinor: "15000000" },
        { period: "2025-02", amountMinor: "18000000" },
        { period: "2025-03", amountMinor: "24000000" },
        { period: "2025-04", amountMinor: "15000000" },
        { period: "2025-05", amountMinor: "15000000" },
        { period: "2025-06", amountMinor: "15000000" },
        { period: "2025-07", amountMinor: "23000000" },
        { period: "2025-08", amountMinor: "13000000" },
      ],
    });
    const rebuilt = await buildWorkbookImportPayload(projectPath, financePath);
    expect(rebuilt.reviewRows.map((item) => item.id)).toEqual(
      payload.reviewRows.map((item) => item.id),
    );
  });
});
