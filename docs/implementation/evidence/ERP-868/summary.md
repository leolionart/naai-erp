# ERP-868 summary

Standardized the organization-wide operating model as `controlled | solopreneur`.

- Migration converts the legacy `owner_final` value to `solopreneur` without rewriting historical
  source-review markers.
- A centralized resolver derives self-approval and tax-default capabilities.
- An authenticated owner in solopreneur mode can self-approve journals, invoices, expenses,
  financial mappings, executive/ROI policies, planning, forecast adjustments, project recognition
  and overhead workflows. Controlled mode keeps maker-checker/threshold behavior.
- `NAAI_ERP_SOLOPRENEUR=true` bootstraps a missing policy for the configured login organization and
  never overwrites an existing organization policy.
- Web settings and copy now use “Mô hình doanh nghiệp” / “Doanh nghiệp một người”.
- Evidence, tax validation, locks, balancing, RBAC, audit and immutable posted history remain active.

Production was released from revision `96cd501708a4b7abb468bf8a69bf87823a37b262` on the user-selected
rolling `latest` channel. API, web, worker and migrate containers all report that OCI revision;
migration `0044` completed with exit code 0 and runtime services are healthy. Organization `naai`
reports `operatingMode: solopreneur`, and policy `naai-executive-metrics:1` was self-approved by the
owner with an audited reason.
