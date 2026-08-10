# ERP-881 acceptance

- [x] Owner-paid expenses use the persisted funding snapshot first.
- [x] Legacy null snapshots use the reviewed historical category treatment.
- [x] Invoice-only and company-funded-category costs stay outside the confirmed timeline.
- [x] Company repayment requires Dr Owner Current and Cr configured company bank/cash.
- [x] Owner funding requires Dr configured company bank/cash and Cr Owner Current.
- [x] Reversals negate confirmed subtotals and running balance.
- [x] Review items do not change confirmed historical balances.
- [x] The full ledger closing balance remains separate and the dashboard contract is unchanged.
- [x] UI displays review items in a separate table with no running balance.

Production read-only projection under the current reviewed category policy:

- 32 confirmed owner-paid expenses totaling 177,483,950 VND;
- 9 company repayments totaling 287,320,000 VND;
- confirmed closing balance: -109,836,050 VND;
- full mapped ledger closing balance: 65,438,650 VND;
- 74 unconfirmed movements totaling the 175,274,700 VND difference remain in review.

