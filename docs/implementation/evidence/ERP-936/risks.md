# ERP-936 risks

- Hydration adds one detail request per category-empty commercial-document row. This is intentionally
  limited to missing-category rows; a future paginated detail projection could remove these requests.
- The API SQL projection is fixed in source but production upstream data is read-only from localhost;
  no production mutation or deployment was performed.
- Multi-line records with conflicting categories still require a future multi-category presentation
  contract; the adapter returns the first canonical non-empty category.
- Historical rows may still carry category in legacy dimensions or allocation dimensions. Read
  projections preserve those rows while new writes and metadata corrections use `category_code`.
- Migrations `0059` and `0060` restore the existing audited tax-finalization trigger exceptions after
  the category migration; they were applied and verified on the native development database.
- Homepage browser smoke was attempted but the pre-existing Next dev server on port 3000 was unresponsive and a duplicate server could not start because the repository locks the same `.next` dev instance. Deterministic chart/API/typecheck coverage passed; no browser visual pass is claimed for this follow-up.
