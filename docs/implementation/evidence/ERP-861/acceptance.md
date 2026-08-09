# ERP-861 acceptance

- [x] Dashboard contains one Owner Current liability card titled `Công ty đang nợ chủ doanh nghiệp`.
- [x] Dashboard contains `Tiền ròng thực còn`, calculated from company cash/bank minus Owner Current.
- [x] The obsolete separate operating-owner obligation and duplicate Owner Current cards are absent.
- [x] The Runway card is absent from the executive dashboard.
- [x] Exact production-backed values reconcile: `78,333,660 - 65,438,650 = 12,895,010` VND.
- [x] All 106 posted legacy owner-paid records are included in management reporting.
- [x] Owner-paid unclassified count and amount are both zero.
- [x] No posted expense journal was edited or reversed for classification.
- [x] All 12 provisional owner-funded payroll drafts have explicit `SALARY` and
  `owner_paid_company_cost` classification through audited, versioned API updates.
- [x] Unknown payee, employee and project relationships remain explicitly unresolved rather than
  being populated with invented identifiers.
- [x] Focused type and browser tests pass.
