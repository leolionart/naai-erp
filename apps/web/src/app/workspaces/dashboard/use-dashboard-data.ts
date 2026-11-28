"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type {
  AgingReportContract,
  ExecutiveMetricsContract,
  PerformanceComparisonContract,
  ProfitAndLossContract,
  TaxExpenseReviewContract,
  VatReconciliationContract,
} from "@naai-erp/contracts";
import { useAuthenticatedApiClient } from "@/lib/api";
import type { ProjectProfitabilityReport } from "@/lib/api/project-profitability";
import { recordCategory } from "@/lib/records/category";
import { buildExpenseOverviewQueries } from "../focused-record-shared";
import type {
  ActualFactSummaryWire,
  DashboardData,
  ExpenseOverviewRow,
  OperatingDashboardWire,
} from "./dashboard-contracts";
import {
  actualSummaryQuery,
  effectiveEndsOn,
  performanceQuery,
  projectQuery,
  reportQuery,
  resolvedDashboardSearch,
} from "./dashboard-queries";

export function useDashboardData() {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const params = useSearchParams();
  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const key = params.toString();
  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setError("");
    if (!hasToken) {
      setData({});
      setError("Kết nối API cần access token để tải dashboard điều hành.");
      setLoading(false);
      return;
    }
    const requestedSearch = new URLSearchParams(key);
    const discoverySearch = resolvedDashboardSearch(requestedSearch);
    let discoveredOperating: OperatingDashboardWire | undefined;
    if (!requestedSearch.has("periodId")) {
      const discoveryQuery = projectQuery(discoverySearch);
      const discoveryAsOf = discoverySearch.get("asOfDate")!;
      const discoveryOperatingQuery = new URLSearchParams({
        asOf: discoveryAsOf,
        startsOn: discoveryQuery.get("periodStart")!,
        endsOn: discoveryQuery.get("periodEnd")!,
        limit: "20",
      });
      try {
        discoveredOperating = await client.data<OperatingDashboardWire>(
          `reports/operating-dashboard?${discoveryOperatingQuery}`,
        );
      } catch {
        // The settled request below exposes the operating API failure to the UI.
      }
    }
    const search = resolvedDashboardSearch(requestedSearch, discoveredOperating?.sourceControls);
    const rq = reportQuery(search);
    const pq = performanceQuery(search);
    const aq = actualSummaryQuery(search);
    const jq = projectQuery(search);
    const asOf = search.get("asOfDate") ?? search.get("endsOn") ?? "2025-12-31";
    const oq = new URLSearchParams({
      asOf,
      startsOn: search.get("startsOn") ?? "2025-01-01",
      endsOn: effectiveEndsOn(search),
      limit: "20",
    });

    const [
      executive,
      performance,
      projects,
      aging,
      profitAndLoss,
      taxExpenses,
      vat,
      operating,
      actualSummary,
    ] = await Promise.allSettled([
      client.data<ExecutiveMetricsContract>(`reports/executive-metrics?${rq}`),
      client.data<PerformanceComparisonContract>(`reports/performance-comparisons?${pq}`),
      client.data<ProjectProfitabilityReport>(`reports/project-profitability?${jq}`),
      client.data<AgingReportContract>(
        `reports/ar-aging?asOf=${encodeURIComponent(asOf)}&limit=100`,
      ),
      client.data<ProfitAndLossContract>(`reports/financial-statements/profit-and-loss?${rq}`),
      client.data<TaxExpenseReviewContract>(`reports/tax/expense-exceptions?${rq}`),
      client.data<VatReconciliationContract>(`reports/tax/vat-reconciliation?${rq}`),
      client.data<OperatingDashboardWire>(`reports/operating-dashboard?${oq}`),
      client.data<ActualFactSummaryWire>(`planning-actual-facts/summary?${aq}`),
    ]);

    const next: DashboardData = {
      executive: executive.status === "fulfilled" ? executive.value : undefined,
      performance: performance.status === "fulfilled" ? performance.value : undefined,
      projects: projects.status === "fulfilled" ? projects.value : undefined,
      aging: aging.status === "fulfilled" ? aging.value : undefined,
      profitAndLoss: profitAndLoss.status === "fulfilled" ? profitAndLoss.value : undefined,
      taxExpenses: taxExpenses.status === "fulfilled" ? taxExpenses.value : undefined,
      vat: vat.status === "fulfilled" ? vat.value : undefined,
      operating: operating.status === "fulfilled" ? operating.value : undefined,
      actualSummary: actualSummary.status === "fulfilled" ? actualSummary.value : undefined,
      failures: {
        executive: executive.status === "rejected" ? String(executive.reason) : "",
        performance: performance.status === "rejected" ? String(performance.reason) : "",
        projects: projects.status === "rejected" ? String(projects.reason) : "",
        aging: aging.status === "rejected" ? String(aging.reason) : "",
        profitAndLoss: profitAndLoss.status === "rejected" ? String(profitAndLoss.reason) : "",
        taxExpenses: taxExpenses.status === "rejected" ? String(taxExpenses.reason) : "",
        vat: vat.status === "rejected" ? String(vat.reason) : "",
        operating: operating.status === "rejected" ? String(operating.reason) : "",
        actualSummary: actualSummary.status === "rejected" ? String(actualSummary.reason) : "",
      },
      searchKey: search.toString(),
    };
    setData(next);
    if (
      !next.executive &&
      !next.performance &&
      !next.projects &&
      !next.aging &&
      !next.profitAndLoss &&
      !next.taxExpenses &&
      !next.vat &&
      !next.operating &&
      !next.actualSummary
    ) {
      const details = Object.entries(next.failures ?? {})
        .filter(([, err]) => Boolean(err))
        .map(([name, err]) => `${name}: ${err}`)
        .join("; ");
      setError(
        `Không thể tải các báo cáo nguồn của dashboard.${details ? ` Details: ${details}` : ""}`,
      );
    }
    setLoading(false);
  }, [client, hasToken, hydrated, key]);
  useEffect(() => void load(), [load]);
  return {
    data,
    loading,
    error,
    reload: load,
    search: new URLSearchParams(data.searchKey ?? key),
  };
}

export function useExpenseOverviewRows(search: URLSearchParams) {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [rows, setRows] = useState<readonly ExpenseOverviewRow[]>([]);
  const [error, setError] = useState("");
  const key = search.toString();
  useEffect(() => {
    if (!hydrated || !hasToken) return;
    const source = new URLSearchParams(key);
    const { documentsPath, expensesPath } = buildExpenseOverviewQueries(source);
    let active = true;
    setError("");
    void Promise.all([
      client.dataAll<Record<string, unknown>>(documentsPath),
      client.dataAll<Record<string, unknown>>(expensesPath),
    ])
      .then(async ([documentPayload, expensePayload]) => {
        if (!active) return;
        const startsOn = source.get("startsOn");
        const endsOn = source.get("endsOn");
        const inPeriod = (row: Record<string, unknown>) => {
          const date = String(
            row.documentDate ?? row.document_date ?? row.expenseDate ?? row.expense_date ?? "",
          );
          if (startsOn && date && date < startsOn) return false;
          if (endsOn && date && date > endsOn) return false;
          return true;
        };
        const documentRows = documentPayload.filter(inPeriod);
        const expenseRows = expensePayload.filter(inPeriod);
        const hydrateMissingCategories = async (
          rows: Record<string, unknown>[],
          endpoint: string,
        ) =>
          Promise.all(
            rows.map(async (row) => {
              if (recordCategory(row)) return row;
              const id = String(row.id ?? "").trim();
              if (!id) return row;
              try {
                const detail = await client.data<Record<string, unknown>>(
                  `${endpoint}/${encodeURIComponent(id)}`,
                );
                return { ...row, ...detail };
              } catch {
                return row;
              }
            }),
          );
        const hydratedDocuments = await hydrateMissingCategories(
          documentRows,
          "commercial-documents",
        );
        const hydratedExpenses = await hydrateMissingCategories(expenseRows, "expenses");
        if (!active) return;
        setRows([
          ...hydratedDocuments.map((row) => ({
            ...row,
            __sourceKind: "documents" as const,
            __invoicePresence: "present" as const,
          })),
          ...hydratedExpenses.map((row) => ({
            ...row,
            __sourceKind: "expenses" as const,
            __invoicePresence: "missing" as const,
          })),
        ]);
      })
      .catch((cause) => {
        if (!active) return;
        setRows([]);
        setError(
          cause instanceof Error ? cause.message : "Không thể tải overview chi phí canonical.",
        );
      });
    return () => {
      active = false;
    };
  }, [client, hasToken, hydrated, key]);
  return { rows, error };
}
