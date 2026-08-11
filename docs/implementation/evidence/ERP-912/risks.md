# ERP-912 risks

- The quick invoice cURL references a supplier ID created by the preceding supplier and role cURLs;
  n8n must run those idempotent setup calls before the first invoice for that supplier.
- VAT remains intentionally unclaimed in the quick path. If OCR supplies verified net and VAT
  amounts, automation should use the full invoice example or enrich the quick body with those values.
- The example values are documentation samples and must be replaced by n8n expressions for each real
  invoice.
