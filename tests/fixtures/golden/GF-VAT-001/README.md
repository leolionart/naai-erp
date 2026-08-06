# GF-VAT-001

Independent exact-money oracle for ERP-630 VAT reconciliation and tax expense review.

It proves output/input separation, partial eligibility, ineligible and unreviewed input VAT, credit-note reversal, document-to-ledger differences, missing evidence, strict readiness thresholds and independent accounting/CIT/VAT axes.

`verify.mjs` uses fixture files and Node standard-library code only. It never imports production modules.
