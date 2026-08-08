# ERP-852 acceptance

- [x] Funding treatment is stored per organization-scoped expense category.
- [x] Expense records snapshot the category and funding treatment used at creation/update time.
- [x] `company_funds` affects company cash through the normal posted accounting flow.
- [x] `owner_paid_company_cost` is included in real company cost and owner payable without pretending
  the payment left a company bank/cash account.
- [x] `tax_only_non_cash` remains visible for VAT/CIT evidence but is excluded from company-funds
  balance reduction.
- [x] Dashboard net-company-funds calculations use posted read models and disclose unclassified
  records.
- [x] Users can configure additional categories and their default treatment through the UI/API.
- [x] Organization scope, authorization and audit behavior remain enforced.
