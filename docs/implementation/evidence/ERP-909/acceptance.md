# ERP-909 acceptance

- Customer page: contextual button and ordered party plus `client` role cURLs verified.
- Project page: contextual button and customer/owner relationship fields verified.
- Subscription page: service-plan and customer-subscription cURLs verified, including customer,
  plan and optional project references.
- Purchase-product page: contextual master-data cURL verified.
- Revenue page: sales-invoice cURL with customer and project allocation verified.
- Expense page: purchase-invoice and direct-expense cURLs verified without duplicate-ingestion
  guidance.
- Security: token endpoint is not called on dialog open and is called once after explicit reveal.
- Responsive UI: all six contexts pass desktop E2E; the complete expense example passes mobile
  overflow checks.
