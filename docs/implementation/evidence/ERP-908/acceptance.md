# ERP-908 acceptance

- Expense header contains the automation access button: implemented in the expense route.
- Complete purchase-invoice cURL: canonical commercial-document endpoint, exact totals, supplier,
  VAT, project/category allocation, optional company funding and external identity are present.
- Purchase-product cURL: included with the same authenticated credential.
- Stable token handling: explicit same-origin authenticated POST, private no-store response, no
  committed token or public environment variable.
- Copy and responsive dialog behavior: desktop/mobile Playwright passed; live Browser QA confirmed
  the dialog, production-token reveal, complete cURL content, zero mobile document overflow and no
  console errors.
