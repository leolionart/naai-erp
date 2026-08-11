# ERP-911 risks

- OCR label names are exact and case-sensitive. A future OCR prompt that renames labels must update
  this expression or emit a stable normalized schema upstream.
- The expression stages data; it intentionally does not bypass the ERP commercial-document contract.
- Invoice number extraction from raw content is a fallback regex and may remain null for unusual
  invoice layouts.
- VAT and accounting classifications still require OCR detail, verified purchase-product rules or
  user input before the ERP mutation can be considered ready.
