# ERP-958 — Excel formula audit sheets

The management workbook now keeps backend metrics as the canonical values and adds independent
Excel formula-audit sheets for invoiced/recognized/collected revenue, expenses, accounting profit,
VAT input/output and receivables. Formula cells recalculate from typed source rows and expose a
signed difference plus PASS/CHECK status.

Changed surfaces:

- `apps/api/src/report-exports/management-workbook.ts`
- API/unit workbook tests
- management export documentation and product rule
- report export UI description
