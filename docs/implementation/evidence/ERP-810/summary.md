# ERP-810 Summary

## Outcome

Added the canonical AI data relationship and ingestion contract for NAAI ERP.

## Deliverables

- Accepted ADR defining the application-level relationship contract and authority order.
- Human/LLM guide covering identity, lookup-before-create, creation order, relationship fields,
  lifecycle, correction, error handling and end-to-end recipes.
- Machine-readable JSON manifest containing stages, resources, dependency edges, references,
  response IDs, correction policies, recipes and known unavailable operations.
- Documentation validation for duplicate resources, unknown stages/targets, reversed dependencies,
  incomplete references, safety policy and required guide sections.
- Current inbound retry wording aligned with the Paperless/n8n boundary.
- Explicit customer–project–invoice relationship rules, including the different semantics for sales
  invoices, supplier purchase invoices and credit notes, plus the exact `dimensions.projectId`
  linkage used by the transactional API.

No database schema or financial behavior was changed.
