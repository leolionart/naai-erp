# Risks and follow-ups

- ExcelJS writes formula cells but does not evaluate them server-side. Excel/LibreOffice must
  recalculate on open; the workbook requests full recalculation explicitly.
- The backend remains the accounting source of truth. Formula differences are diagnostic evidence
  and never mutate ERP data.
- The generic immutable report-snapshot export was intentionally not changed, avoiding changes to
  snapshot hash/CSV semantics.
