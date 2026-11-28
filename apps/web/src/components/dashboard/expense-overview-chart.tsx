"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildCategoryNameLookup,
  getCategoryName,
} from "@/components/forms/category-catalog-defaults";
import { MonthlyCategoryStackedChart } from "@/components/dashboard/monthly-category-stacked-chart";
import { buildFocusedRecordChartPoints } from "@/app/workspaces/focused-record-chart";
import { CATEGORY_LOOKUP_ENDPOINTS } from "@/app/workspaces/focused-record-shared";
import { useAuthenticatedApiClient } from "@/lib/api";

export function ExpenseOverviewChart({
  rows,
  currency = "VND",
  href,
  scopeLabel,
  resolveCategoryName,
}: Readonly<{
  rows: readonly Record<string, unknown>[];
  currency?: string;
  href?: string;
  scopeLabel?: string;
  resolveCategoryName?: (code?: string) => string;
}>) {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [liveNames, setLiveNames] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    if (resolveCategoryName || !hydrated || !hasToken) return;
    let active = true;
    void Promise.allSettled(
      CATEGORY_LOOKUP_ENDPOINTS.map((endpoint) =>
        client.dataAll<Record<string, unknown>>(endpoint),
      ),
    ).then((results) => {
      if (!active) return;
      const lists = results.map((res) => (res.status === "fulfilled" ? res.value : []));
      setLiveNames(buildCategoryNameLookup(...lists));
    });
    return () => {
      active = false;
    };
  }, [client, hasToken, hydrated, resolveCategoryName]);

  const fallbackResolver = useCallback(
    (code?: string) => getCategoryName(code, liveNames),
    [liveNames],
  );
  const effectiveResolver = resolveCategoryName ?? fallbackResolver;

  const points = useMemo(
    () => buildFocusedRecordChartPoints(rows, effectiveResolver),
    [effectiveResolver, rows],
  );
  return (
    <MonthlyCategoryStackedChart
      title="Tỷ trọng chi phí từng danh mục theo tháng"
      description={`Chi phí mua vào và chi phí không hóa đơn tổng hợp theo danh mục nghiệp vụ${scopeLabel ? ` (${scopeLabel})` : ""}.`}
      points={points}
      currency={currency}
      href={href}
    />
  );
}
