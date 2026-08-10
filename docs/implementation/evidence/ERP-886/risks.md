# ERP-886 risks

- An organization with no active service-line dimension receives structured
  `SERVICE_LINE_REQUIRED`; quick creation does not invent master data.
- Existing service plans are unchanged. Editing retains their existing code, service line and
  recurrence unless those fields are explicitly changed through the machine contract.
- Production endpoint readback remains a deployment responsibility; this task did not push or
  deploy.
