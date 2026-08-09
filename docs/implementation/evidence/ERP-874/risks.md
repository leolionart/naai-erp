# ERP-874 risks

- Existing production projects with missing service lines are not modified by this code change; they still require a reviewed metadata update or controlled re-import.
- Customer aliases are intentionally explicit and versioned. New spelling variants require review instead of automatic fuzzy matching.
- Labels outside the reviewed web alias set remain `unmapped_service_line`; expanding the map requires a business-reviewed canonical service-line decision.
- Production behavior changes only after the remaining API/CLI commit is published and deployed.
