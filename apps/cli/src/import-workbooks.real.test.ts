import { describe, expect, it } from "vitest";
import { buildWorkbookImportPayload } from "./import-workbooks.js";

const projectPath = process.env.ERP740_PROJECT_WORKBOOK;
const financePath = process.env.ERP740_FINANCE_WORKBOOK;
const describeReal = projectPath && financePath ? describe : describe.skip;

describeReal("ERP-740 real workbook controls", () => {
  it("extracts exact detail and Tỷ suất lợi nhuận control totals", async () => {
    const payload = await buildWorkbookImportPayload(projectPath, financePath);
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
  });
});
