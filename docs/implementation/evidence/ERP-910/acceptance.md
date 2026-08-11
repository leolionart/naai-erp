# ERP-910 acceptance

- Minimal OCR example appears first on the expense screen.
- Supplier identity is derived from tax ID through canonical party and supplier-role requests.
- Invoice example omits unknown `projectId` and `fundingSource` fields.
- VAT 8% values are explicit example controls and tax eligibility is `unreviewed`; UI copy requires
  n8n to replace them with extracted or verified catalog values rather than guessing from gross.
- Mobile dialog opens the minimal example without horizontal document overflow.
