# ERP-868 acceptance

- Legacy database mode migrates to `solopreneur`; new schema accepts only controlled/solopreneur.
- Owner + solopreneur + same creator/approver is allowed by the centralized policy decision.
- Non-owner + solopreneur remains denied; controlled mode keeps configured threshold behavior.
- Module stores use the shared resolver for approval authorization instead of scattered mode checks.
- Historical `owner_final` review references remain accepted as evidence markers.
- Env bootstrap is strict, organization-scoped and non-overwriting.
- UI persists `solopreneur` and presents correct self-approval guidance.
- Missing documents/data-quality exceptions remain visible and are not auto-cleared by business mode.
