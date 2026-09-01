# Acceptance

- Backend values remain present and are not replaced by formulas: satisfied by the existing
  `Chỉ số tháng` sheet and the new audit sheets' `Giá trị backend` column.
- Excel independently recalculates each monthly metric from typed source sheets: satisfied by
  `SUMIFS` formulas and `fullCalcOnLoad`.
- Differences are visible and signed, with a machine-readable PASS/CHECK result: satisfied by
  the `Chênh lệch` and `Trạng thái` columns on every audit sheet.
- VAT, profit, revenue, expense and receivable metrics each have a dedicated audit surface:
  satisfied by seven `Đối soát ...` worksheets.
