# ERP-911 acceptance

- A single expression reads all known `$json.output` OCR labels from the supplied workflow shape.
- Paperless identifiers, filenames, timestamps, tags and raw OCR output are retained when available.
- Tax ID, VND amounts and signed date are normalized in the expression.
- Supplier and supplier-role candidates use a deterministic normalized tax-ID identity.
- Unknown VAT, accounts, due date, project, funding and allocation amounts are not invented;
  validation remains `readyToPost: false` with explicit missing paths.
- The expression renders and copies within the existing responsive dialog.
