# ERP-890 risks

- Owner Current funding for purchase invoices is deferred; the canonical default implemented here is an active company bank/cash financial account.
- Posted freelance payable correction must use expense/journal reversal; direct mutation or deletion is prohibited.
- Purchase funding is snapshotted by canonical financial-account ID and resolved to its ledger account
  during posting. Deactivating or changing that account before posting rejects the mutation rather
  than falling back to AP while claiming payment.
- Existing data is unchanged. The new automatic settled behavior applies only to purchase invoices
  that explicitly carry the new funding source.
