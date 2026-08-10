# ERP-876 summary

Owner Current now classifies movements from canonical ledger and source evidence instead of signs alone.

- Owner-paid company costs require a linked expense funding snapshot or purchase-invoice source.
- Company repayments require a debit to Owner Current and credit to configured company bank/cash.
- Owner funding remains separate, while unresolved movements are explicit review-required adjustments.
- Historical repayments through later-inactive company financial accounts remain classified.
- The UI and OpenAPI expose truthful subtotals, classification basis and source-specific review copy.

No production records were mutated and no deployment was performed.
