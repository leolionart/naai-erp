# ERP-878 summary

Owner Current now composes the owner-paid company-cost section from the canonical posted expense
list filtered by effective category funding treatment. Company repayments, owner funding and
unresolved adjustments remain ledger-derived. Executive dashboard metrics and the mapped Owner
Current closing balance are unchanged.

Legacy expenses keep their posted history intact. When a line has no funding snapshot, the read
model resolves the configured treatment from its category, including category codes stored in
legacy dimensions.

