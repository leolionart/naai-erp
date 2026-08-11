# ERP-913 risks and follow-ups

- Supplier/role creation and invoice creation are convergent and idempotent but are not one shared
  database transaction. A later invoice failure may leave valid supplier master data.
- Category inference is deliberately conservative and explainable. Ambiguous or weak matches require
  the caller/user to supply a clearer category label.
- `purchase_products` currently stores product name and VAT rate only; it has no canonical expense
  category relationship and is therefore not used to guess accounting classification. A future
  schema task can add that explicit foreign key or alias relationship.
- The quick path records gross as management cost with zero deductible VAT until real net/VAT values
  are supplied.
- Hard deletion is permanently unavailable after journal creation, lifecycle progression or a
  downstream reference; correction must then use cancel/reversal.
- Deleting an invoice does not delete a supplier party created during ingestion.
