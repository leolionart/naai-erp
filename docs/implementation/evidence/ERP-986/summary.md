# ERP-986 Summary — Estimated Corporate Income Tax Rate by Prior-Year Revenue Tier

## Outcome

Implemented `BR-TAX-102` so NAAI ERP resolves provisional corporate income tax (CIT) rates from prior-year total posted base-currency revenue under Vietnam Law 67/2025/QH15 (from tax year 2025):

- `<= 3,000,000,000 VND` -> `15%` (`1500` bps)
- `> 3,000,000,000` and `<= 50,000,000,000 VND` -> `17%` (`1700` bps)
- `> 50,000,000,000 VND` -> `20%` (`2000` bps)

## Key Decisions & Files Changed

- **Database migration (`db/migrations/0074_cit_revenue_tiers.sql`, `packages/database/src/cit-policy-schema.ts`)**:
  - Added `statutory_cit_rate_tiers` pre-seeded with the Law 67/2025/QH15 brackets starting `effective_from_year = 2025`.
  - Added `organization_cit_policies` (`cit_small_enterprise_ineligible`, `ineligibility_reason`, `prior_year_revenue_override_minor`, `version`).
  - Added `organization_cit_rate_tiers` for year-configurable organization CIT rate schedules without code changes.
- **Domain logic (`packages/domain/src/cit-rate.ts`, `packages/domain/src/cit-rate.test.ts`)**:
  - Pure deterministic `resolveEstimatedCit`, `selectCitRateSchedule`, and `validateCitRateSchedule` functions handling exact minor-unit thresholds, missing prior-year ledger revenue (`no_prior_year_revenue` provisional current-year fallback), declared prior-year revenue, `citSmallEnterpriseIneligible` override (`ineligible_override` -> 20%), and pre-2025 fallback to `tax_code_versions`.
- **REST API, Dashboard, P&L, CLI & Web UI (`apps/api/src/cit-policy/`, `apps/api/src/operating-dashboard/`, `apps/api/src/financial-statements/`, `apps/cli/src/cit-client.ts`, `apps/web/src/app/workspaces/cit-estimate-presentation.ts`, `apps/web/src/app/workspaces/cit-policy-workspace.tsx`)**:
  - Added `GET /cit-policy`, `PUT /cit-policy`, `PUT /cit-policy/rate-tiers/:effectiveFromYear`, and `GET /reports/tax/estimated-cit`.
  - Shared `resolvePgCitEstimate` across `/reports/operating-dashboard`, `/reports/tax/estimated-cit`, and `/reports/financial-statements/profit-and-loss` while extracting helpers so every new code file is well under 500 lines and existing >500-line files shrank rather than grew.
