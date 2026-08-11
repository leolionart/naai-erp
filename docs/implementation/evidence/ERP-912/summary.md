# ERP-912 summary

The expense automation dialog now presents supplier creation, supplier-role assignment and quick
purchase-invoice ingestion as three independent copyable cURLs. The quick invoice accepts the basic
information normally available from OCR: supplier, invoice date, category, description and gross
amount, without requiring a project or payment account.

The safe default records the known gross amount as management cost, sets deductible VAT to zero and
keeps tax eligibility unreviewed until real tax values are supplied. The commercial-document API now
also converts malformed n8n staging payloads into structured validation failures rather than leaking
an undefined `.map` runtime error.
