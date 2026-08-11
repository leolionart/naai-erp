# ERP-909 summary

Implemented one shared, authenticated `API & tự động hóa` dialog across the primary customer,
project, subscription, purchase-product, revenue and expense input pages. Each page supplies its own
resource context, so the dialog reveals only the production cURL examples relevant to that page.

The examples cover ordered customer party/client-role creation, customer-linked projects, service
plans and customer subscriptions, purchase products, sales invoices, purchase invoices and direct
non-invoice expenses. They preserve organization scope, bearer authentication, idempotency, exact
minor-unit money and explicit relationship IDs.

No credential is committed or rendered before the authenticated reveal action.
