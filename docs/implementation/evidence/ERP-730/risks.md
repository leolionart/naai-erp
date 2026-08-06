# ERP-730 Risks

- This is synthetic and operational setup data, never an automatic production seed or cutover routine.
- The source workbooks do not provide a complete, approved starting-capital or opening-balance position. Reports can tie internally to imported journals while still omitting historical equity, cash, liability, or balance-forward facts.
- A balanced runtime report must not be interpreted as proof that historical opening balances are complete.
- AP remains empty until a source provides deterministic purchase-invoice identity and supplier evidence; document-backed expense files alone are insufficient.
- Legal and accounting mappings still require accountant confirmation before production reporting or statutory use.
- Exact-commit CI, pushed commit identity, and deployment proof have not yet been recorded.
