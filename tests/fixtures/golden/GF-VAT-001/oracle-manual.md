# Manual oracle — GF-VAT-001

All values are exact VND minor units and were reviewed independently from production code.

- Output VAT = 10,000,000 sales VAT − 2,000,000 credit-note VAT = 8,000,000.
- Input VAT = 3,000,000 + 2,000,000 + 1,000,000 + 1,000,000 = 7,000,000.
- Eligible input = 3,000,000 + 1,200,000 = 4,200,000.
- Ineligible input = 800,000 partial remainder + 1,000,000 reviewed ineligible = 1,800,000.
- Unreviewed input = 1,000,000 and is never silently treated as eligible or ineligible.
- Net VAT payable = 8,000,000 − 4,200,000 = 3,800,000.
- Input document VAT exceeds input ledger VAT by 500,000, so strict-zero policy blocks readiness.
- Tax expense review keeps accounting booked 40,000,000, CIT basis 38,000,000, CIT eligible 27,000,000, CIT ineligible 6,000,000 and CIT unreviewed 5,000,000 distinct.
