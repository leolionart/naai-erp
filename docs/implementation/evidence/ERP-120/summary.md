# ERP-120 implementation summary

- Added organization-scoped cost-center, service-line, category, client, project and contract dimension value foundations.
- Added effective-dated account dimension requirements with change reason, actor and correlation metadata.
- Added versioned category defaults for account, pinned tax-policy version, cost center and service line.
- Added exact percentage and minor-unit allocation validators.
- Added explicit rounding-residual account requirements.
- Added migration `0002_typical_mastermind.sql` and cross-organization integration coverage.

Start commit: `0fb1b6c0fccee3a305719ba8ccf9fc053c9ddc9a`.

Rules covered: `BR-DIM-001`, `BR-DIM-002`.
