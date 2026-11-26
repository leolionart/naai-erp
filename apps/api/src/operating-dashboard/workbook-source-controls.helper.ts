import type { Queryable } from "../payment-evidence/payment-evidence-queries.js";
import type {
  OperatingDashboardQuery,
  WorkbookSourceControlKind,
  WorkbookSourceControls,
} from "./operating-dashboard.types.js";

const controlKinds: readonly WorkbookSourceControlKind[] = [
  "bonus_control",
  "debt_control",
  "expense_category_control",
  "payroll_master",
  "planning_control",
  "profitability_control",
];
const controlMoney = (value: unknown) =>
  typeof value === "string" && /^-?\d+$/.test(value) ? value : "0";
const controlText = (value: unknown) => (typeof value === "string" ? value : "");
const controlPeriod = (value: unknown) =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : undefined;

export async function queryWorkbookSourceControls(
  pool: Queryable,
  org: string,
  q: OperatingDashboardQuery,
): Promise<WorkbookSourceControls> {
  type SourceRow = {
    id: string;
    kind: WorkbookSourceControlKind;
    workbook: string;
    sheet: string;
    sourceRow: number;
    status: "pending_review" | "approved" | "posted";
    reviewFlags: string[];
    mappedData: Record<string, unknown>;
  };
  const result = await pool.query<SourceRow>(
    `select id,kind,workbook,sheet,source_row "sourceRow",status,
            review_flags "reviewFlags",mapped_data "mappedData"
       from workbook_import_review_rows
      where organization_id=$1 and kind=any($2::text[]) and status<>'ignored'
        and (
          (mapped_data->>'period' is not null and mapped_data->>'period' >= substring($3::text from 1 for 7) and mapped_data->>'period' <= substring($4::text from 1 for 7))
          or (kind = 'expense_category_control' and exists (
             select 1 from jsonb_array_elements(mapped_data->'monthlyAmounts') as a
             where a->>'period' >= substring($3::text from 1 for 7) and a->>'period' <= substring($4::text from 1 for 7)
          ))
          or kind in ('payroll_master', 'bonus_control')
        )
      order by kind,coalesce(mapped_data->>'period',''),source_row,id`,
    [org, controlKinds, q.startsOn, q.endsOn],
  );
  const byKind = controlKinds
    .map((kind) => ({ kind, count: result.rows.filter((row) => row.kind === kind).length }))
    .filter((item) => item.count > 0);
  const monthly = result.rows
    .filter(
      (row): row is SourceRow & { kind: "profitability_control" | "planning_control" } =>
        row.kind === "profitability_control" || row.kind === "planning_control",
    )
    .flatMap((row) => {
      const period = controlPeriod(row.mappedData.period);
      if (!period) return [];
      return [
        {
          id: row.id,
          kind: row.kind,
          period,
          revenueMinor: controlMoney(row.mappedData.revenueMinor),
          receivedMinor: controlMoney(row.mappedData.receivedMinor),
          expenseMinor: controlMoney(row.mappedData.expenseMinor),
          profitMinor: controlMoney(row.mappedData.profitMinor),
          ...(row.kind === "planning_control"
            ? {
                targetAttainmentBps:
                  typeof row.mappedData.targetAttainmentBps === "number"
                    ? row.mappedData.targetAttainmentBps
                    : null,
                forecastExpenseMinor:
                  row.mappedData.forecastExpenseMinor === null
                    ? null
                    : controlMoney(row.mappedData.forecastExpenseMinor),
                forecastCashMinor:
                  row.mappedData.forecastCashMinor === null
                    ? null
                    : controlMoney(row.mappedData.forecastCashMinor),
              }
            : {}),
          reviewFlags: row.reviewFlags,
        },
      ];
    })
    .sort(
      (left, right) =>
        left.period.localeCompare(right.period) || left.kind.localeCompare(right.kind),
    );
  const debt = result.rows
    .filter((row) => row.kind === "debt_control")
    .map((row) => ({
      id: row.id,
      ...(controlPeriod(row.mappedData.period)
        ? { period: controlPeriod(row.mappedData.period) }
        : {}),
      projectLabel: controlText(row.mappedData.projectLabel),
      debtMinor: controlMoney(row.mappedData.debtMinor),
      projectCostMinor: controlMoney(row.mappedData.projectCostMinor),
      collectedMinor:
        row.mappedData.collectedMinor === null ? null : controlMoney(row.mappedData.collectedMinor),
      reviewFlags: row.reviewFlags,
    }));
  const expenseCategories = result.rows
    .filter((row) => row.kind === "expense_category_control")
    .map((row) => ({
      id: row.id,
      category: controlText(row.mappedData.category),
      monthlyAmounts: Array.isArray(row.mappedData.monthlyAmounts)
        ? row.mappedData.monthlyAmounts.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const value = item as Record<string, unknown>;
            const period = controlPeriod(value.period);
            return period ? [{ period, amountMinor: controlMoney(value.amountMinor) }] : [];
          })
        : [],
      reviewFlags: row.reviewFlags,
    }));
  return {
    source: "workbook_import_review_rows",
    accountingStatus: "unconfirmed_non_canonical",
    rowCount: result.rows.length,
    byKind,
    monthly,
    debt,
    expenseCategories,
    rows: result.rows.slice(0, q.limit),
  };
}
