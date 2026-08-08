# ERP-852 risks

- Historical expenses without a confidently mapped category remain explicitly unclassified instead
  of being silently assigned a cash treatment.
- Category-policy changes apply to future selections; existing expense snapshots intentionally keep
  their original treatment.
- Tax eligibility still depends on the independent VAT/CIT fields and supporting evidence. Funding
  treatment must not be interpreted as accountant approval or tax eligibility.
- The browser test server currently reports non-blocking sidebar hydration and Recharts sizing
  warnings. They do not alter the funding calculation but should be repaired in a focused UI task.
