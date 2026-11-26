# Remaining risks / findings not changed

- Draft expenses created by integration identities cannot be approved until tax review states are set (`EXPENSE_REVIEW_INCOMPLETE`); solopreneur tax defaults are applied only through the explicit tax-finalization batch. Needs an owner decision before auto-applying.
- Financial statement reports still flag draft tax codes as not approved even in solopreneur mode (informational).
- Webhook/integration-created records are always drafts in solopreneur mode by design.
