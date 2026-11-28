# ERP-1009 — Acceptance Criteria

1. **Explicit period-filtered vs all-time balance annotations**:
   - Every dashboard metric card, chart, and pulse card renders an explicit badge (`Theo kỳ lọc · ...` vs `Số dư toàn thời gian` / `Số dư lũy kế đến ...`), reinforced by a legend banner directly under the period selector.
   - `Tiền công ty hiện có` explicitly notes both `Số dư toàn thời gian` for its headline balance and `Dòng doanh thu các tháng trong kỳ lọc` above its sparkline.
2. **Trend-line metric cards aligned on the same row**:
   - `Kết quả kinh doanh` and `Tiền công ty hiện có` (the two `MetricCard`s with sparkline trend lines) are placed together in Row 1 (`grid gap-4 md:grid-cols-2`), separate from the 4 non-trend cards in Row 2 (`grid gap-4 md:grid-cols-2 xl:grid-cols-4`).
3. **Existing dashboard drill-down contracts preserved**:
   - All `href` drill-down targets, headline values, and negative assertions (`toHaveCount(0)` on duplicate net-funds headline copy) remain intact.
