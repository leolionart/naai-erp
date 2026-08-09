# ERP-869 summary

Executive metrics now consume the full reviewed equity source and use clearer owner-balance semantics.

- Accumulated loss combines posted retained earnings with current unclosed Balance Sheet earnings.
- Owner balance is presented as công nợ/vãng lai chủ, not automatically as a formal loan.
- Production TT133 mapping version 3 adds standard operating cash-flow counterpart accounts.
- Unresolved `3389-BANK-CLEAR` inflows remain visibly unclassified; no guessed revenue, investment or
  owner-funding classification was created.
- Production API, worker and web run revision
  `7e6f5f5521a7a44e92a4fe24599283ddb889cd7c`; the web container remains on
  `ghcr.io/leolionart/naai-erp-web:latest` and is healthy.
- The local production-data UI renders all five executive-metric workspaces and preserves truthful N/A
  states where the ledger does not yet provide a valid denominator or reviewed source set.
