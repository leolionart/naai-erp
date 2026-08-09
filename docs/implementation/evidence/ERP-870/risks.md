# ERP-870 risks

- Subscription schedules are not invoices, recognized revenue, receivables or cash collections.
- Automatic invoice generation is outside this task and must use canonical commercial-document services if added later.
- Production requires migration `0045_customer_service_subscriptions` before these endpoints can be
  used; no production deployment was performed in this task.
- The local UI E2E suite uses controlled API fixtures. Production-data smoke testing remains a
  deployment gate because the current production API does not yet expose ERP-870 endpoints.
