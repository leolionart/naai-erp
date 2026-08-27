# ERP-936 acceptance

- The latest localhost purchase invoice `00267579` now displays `Chi phí Thuê xe / Thuê pin sạc`.
- The value comes from the canonical category stored in the owning line field (`category_code` for commercial documents and `expense_category_code` for expenses). Legacy allocation/dimensions storage is read-compatible only.
- Category-empty list rows are enriched from the existing canonical detail endpoint; already-classified rows do not make extra detail requests.
- List and detail use the same category adapter and preserve the existing invoice filters and lifecycle behavior.
- Allocation-only historical category data, expense-category reporting, commercial-document integration, expense integration, API/web typechecks, migration validation and documentation validation pass.
