# ERP-912 acceptance

- Each setup or ingestion operation is displayed as an independent copyable cURL: proven by the
  automation dialog unit/contract and E2E coverage.
- The quick invoice example contains supplier, date, category, description and total amount and does
  not require project or payment-account data: proven by the generated cURL assertions.
- Unknown VAT is not inferred: the quick example records gross cost with zero deductible VAT and an
  `unreviewed` tax state.
- Posting the n8n staging envelope directly no longer throws an undefined `.map` error: proven by the
  API regression test expecting a structured `VALIDATION_FAILED` response.
- Full repository quality gate and production builds passed.
