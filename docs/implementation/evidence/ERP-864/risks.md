# ERP-864 risks

- The public `/health/ready` path is routed to the web application and returns 404; API readiness is
  verified by container health and `/api/v1/capabilities` instead.
- The release workflow emits Node.js action deprecation warnings but completed successfully.

