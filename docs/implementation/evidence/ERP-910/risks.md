# ERP-910 risks

- Gross payment alone cannot determine VAT accurately. The workflow must obtain net and VAT from
  OCR/invoice detail or a verified purchase-product VAT rule before sending the request.
- The example uses stable deterministic supplier IDs for demonstration. Production automation must
  keep tax-ID normalization and idempotency consistent across runs.
- Unknown project and payment relationships are intentionally omitted; they may be added later only
  from verified business data while the document is still mutable.
