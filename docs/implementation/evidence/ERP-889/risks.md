# ERP-889 risks

- Migration `0048_customer_receipts` has passed the local upgrade path and native `49/49` migration
  health check. Production rollout remains subject to the normal release migration gate.
- Manual receipts currently require the exact amount to be allocated; customer advances remain a
  separate future canonical workflow rather than an implicit unallocated balance.
- Receipt correction requires a future explicit reversal workflow; posted receipt rows and journals
  must not be edited or deleted.
- The workflow intentionally accepts only one customer and one currency per receipt. Mixed-customer
  or mixed-currency deposits must be represented by separate canonical receipts.
