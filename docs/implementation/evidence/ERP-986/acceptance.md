# ERP-986 Acceptance Proof

1. **Tiered CIT rate by prior-year revenue (Law 67/2025/QH15)**:
   - Verified in `packages/domain/src/cit-rate.test.ts` (`T-UNIT-TAX-102`) and `apps/api/src/cit-policy/cit-policy.integration.test.ts`: `<= 3,000,000,000 -> 15%`, `> 3,000,000,000 && <= 50,000,000,000 -> 17%`, `> 50,000,000,000 -> 20%`.
2. **Organization-level override & assumption disclosure**:
   - `PUT /api/v1/organizations/{organizationId}/cit-policy` persists `citSmallEnterpriseIneligible` (audited, versioned, idempotent) and forces the standard 20% tier while exposing `corporateIncomeTaxRateBps` / `effectiveRateBps` and `corporateIncomeTaxAssumption` / `assumption` on both `/reports/operating-dashboard` and `/reports/tax/estimated-cit` as well as Dashboard UI & drill-down.
3. **Configurable rate tiers by year**:
   - `statutory_cit_rate_tiers` (seeded in `0074_cit_revenue_tiers.sql`) and `PUT /api/v1/organizations/{organizationId}/cit-policy/rate-tiers/{effectiveFromYear}` allow updating year brackets without code changes.
4. **Contracts, CLI, OpenAPI, Gate Matrix & Modular Size Limit**:
   - Updated `docs/api/openapi-v1.json`, `docs/implementation/solopreneur-gate-matrix.json`, `apps/cli/src/cit-client.ts`, `docs/product/business-rules.md` (`BR-TAX-102`), and verified every new code file is `<= 500` lines while existing `> 500`-line files did not grow.
