# GF-EXPENSE-002 manual oracle

- Net expense: `10,000,000 + 6,000,000 + 4,000,000 = 20,000,000` VND.
- Eligible VAT: `1,000,000 + 600,000 + 400,000 = 2,000,000` VND.
- Gross payable: `20,000,000 + 2,000,000 = 22,000,000` VND.
- Journal debit: `20,000,000 + 2,000,000 = 22,000,000` VND.
- Journal credit: `22,000,000` VND to `331-AP`.
- Debit minus credit: `22,000,000 - 22,000,000 = 0` VND.
- Project A receives `10,000,000` net and `1,000,000` VAT.
- Project B receives `6,000,000` net and `600,000` VAT.
- Internal overhead receives `4,000,000` net and `400,000` VAT.
- CIT-eligible net expense is `20,000,000` VND; deductible input VAT is `2,000,000` VND.

This calculation is a reviewed fixture oracle. It is intentionally independent of application posting and allocation code.
