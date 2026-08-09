# ERP-859 summary

Made project the single user-facing commercial contract across invoice, expense and project-profile
workflows. Forms now load the canonical project list, sales project selection derives the customer,
and stale contract dimensions are removed from create/edit payloads.

The project profile promotes a single legacy contract's reference, signed date and value into the
project facts, keeps approved budget separate, and warns when legacy data contains multiple
contracts for one project.
