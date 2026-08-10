# ERP-886 summary

Service-plan quick creation now asks for only the readable service name and exact default price.
The shared application service derives the stable code, commercial defaults and canonical service
line, so REST, CLI and UI retain the same machine-readable behavior.

Changed surfaces: subscription domain/contracts, REST service and PostgreSQL store, subscription
workspace, OpenAPI/relationship guidance, regression tests and implementation documentation.

The canonical defaults are VND, monthly recurrence, interval 1, billing day 1 and an explicit quick
create audit reason. Service-line resolution is deterministic: RETAINER_FEE, then
SYSTEM_MAINTENANCE, then the first active code. It never infers a line from the plan name.
