# ERP-720 Risks

- Customer classification uses organization-scoped `party-roles` with role `client`; callers must create both the party and client role.
- Local development auto-hydration is tenant-specific convenience behavior and must not be treated as a production authentication design.
- CORS is intentionally restricted to the configured web origin; production deployments must set the correct origin explicitly.
- Real imported totals prove UI/data integration but do not replace accountant reconciliation or tax filing review.
- Automated desktop/mobile Playwright coverage passed 67/67, but accountant-facing visual and accounting-policy acceptance remain separate review activities.
- Final implementation SHA and exact-commit CI evidence remain pending until commit and push are completed.
