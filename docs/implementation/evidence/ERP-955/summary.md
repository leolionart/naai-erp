# ERP-955

Tax exception queue now defaults to unresolved rows, honors explicit state filters, and exposes concrete in-app actions for each blocker: CIT review, VAT review, and VAT tax-code resolution. VAT reconciliation also returns source rows with actions so KPI and source drill-downs cannot end in an empty screen. All corrections update audited tax metadata only; posted journals remain immutable.

The VAT reconciliation screen now renders those source rows inline. Users can enter the exact VAT code from the source document, submit it for backend validation, and see the report refresh in place.
