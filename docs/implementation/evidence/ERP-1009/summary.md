# ERP-1009 — Summary

## Outcome

- Added explicit scope annotations across the Executive Dashboard (`/dashboard`) distinguishing metrics and charts driven by the period filter (`Theo kỳ lọc · Năm YYYY` / `Quý Q/YYYY` / `Tháng MM/YYYY`) from cumulative balance metrics (`Số dư toàn thời gian` when `asOfDate >= today`, or `Số dư lũy kế đến DD/MM/YYYY` when an explicit historical cutoff is chosen).
- Added a concise explanatory scope legend banner immediately below the dashboard period navigator.
- Reorganized `FinancialHealthSection` so all `MetricCard`s containing sparkline trend charts (`Kết quả kinh doanh` and `Tiền công ty hiện có`) share one dedicated horizontal row (`md:grid-cols-2`), while the 4 non-trend cards (`Công ty đang nợ chủ doanh nghiệp` / `Tiền công ty chủ đang giữ`, `Công nợ cần thu`, `Thuế TNDN tạm tính`, `VAT phải nộp`) sit together on the second row (`md:grid-cols-2 xl:grid-cols-4`).
- Added explicit trend captions (`trendLabel`) on sparkline cards so the hybrid `Tiền công ty hiện có` card clearly communicates that its headline balance is all-time while its sparkline reflects monthly revenue in the selected filter period.

## Files Changed

- `apps/web/src/app/workspaces/dashboard/dashboard-presentation.ts`
- `apps/web/src/app/workspaces/dashboard-workspaces.tsx`
- `apps/web/src/app/workspaces/dashboard-workspaces.test.ts`
- `apps/web/src/app/workspaces/dashboard/metric-card.tsx`
- `apps/web/src/app/workspaces/dashboard/financial-health-section.tsx`
- `apps/web/src/app/workspaces/dashboard/operating-pulse-section.tsx`
- `apps/web/src/app/workspaces/dashboard/revenue-trend-card.tsx`
- `apps/web/src/app/workspaces/dashboard/executive-dashboard-workspace.tsx`
- `apps/web/src/components/dashboard/expense-overview-chart.tsx`
- `docs/product/business-rules.md`
- `docs/testing/test-specification.md`
- `docs/testing/test-catalog.yaml`
- `docs/implementation/task-ledger.yaml`
