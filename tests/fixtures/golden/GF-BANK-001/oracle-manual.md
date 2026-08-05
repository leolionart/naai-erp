# GF-BANK-001 Manual Oracle

## Receivable settlement

Opening receivable for `SALES-110M` is `110,000,000`.

1. First receipt applies `60,000,000`; remaining receivable is `50,000,000`.
2. Second receipt applies `50,000,000`; remaining receivable is zero.
3. Cumulative allocation is `60,000,000 + 50,000,000 = 110,000,000` and never exceeds the invoice.

The two independent journals are:

- Dr Bank `60,000,000`; Cr AR `60,000,000`.
- Dr Bank `50,000,000`; Cr AR `50,000,000`.

## Supplier payment and fee

The bank statement outflow is `110,000,000`, but only `109,000,000` clears the supplier payable.

- Dr AP `109,000,000`.
- Dr Bank fee expense `1,000,000`.
- Cr Bank `110,000,000`.

Debit is `109,000,000 + 1,000,000 = 110,000,000`, exactly equal to credit. The bank fee is explicit and does not inflate the purchase invoice allocation.

## Control conclusions

- Total receipt allocation equals the original receivable.
- Supplier principal allocation equals the supplier outstanding balance.
- Each statement transaction is fully explained.
- Each journal balances without a hidden plug or unreviewed variance.
- Source evidence remains addressable through the sales and purchase invoice IDs.
