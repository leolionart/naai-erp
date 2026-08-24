# ERP-932 risks

- Recognition enrichment relies on existing organization-scoped project and party foreign-key
  integrity. No fallback that could cross organization boundaries was introduced.
- Legacy API presentation names remain source-compatible but deprecated; consumers should migrate to
  `effectiveOn`, `amountMinor`, `projectId`, `policyId`, `policyVersionNumber` and `evidenceIds`.
- Production deployment is intentionally separate from source push and image publication and requires
  a verified supported deployment environment/path.
