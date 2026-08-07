# ADR-011: AI Data Relationships and Ingestion Contract

- Status: Accepted
- Date: 2026-08-07
- Task: ERP-810
- Rules: BR-AI-001, BR-AI-002, BR-AI-003, BR-AI-004, BR-AI-005

## Context

OpenAPI describes transport operations, business rules describe invariants, and the database schema
contains implementation foreign keys. None of those sources alone tells an AI client how to resolve
business identities, order dependent writes, retain response IDs, or correct immutable financial
history safely.

Directly documenting the database as an integration interface would also violate the application
service boundary and encourage clients to bypass organization scope, authorization, audit,
idempotency, period locks and accounting lifecycle rules.

## Decision

NAAI ERP maintains two application-level relationship artifacts:

1. `docs/api/data-relationships-and-ingestion.md` is the canonical human and LLM playbook.
2. `docs/api/data-relationship-manifest-v1.json` is the machine-readable dependency, reference,
   identity, lifecycle and recipe manifest.

The artifacts document public API/CLI resources rather than raw tables. Every relationship declares
its organization scope, source field, target resource/key, missing-reference policy and creation
stage. Recipes propagate IDs returned by earlier API calls into later requests.

## Authority order

When sources disagree, clients follow this order:

1. Business rules and accepted ADRs.
2. OpenAPI operation and runtime validation.
3. Relationship manifest and ingestion guide.
4. Examples and historical evidence.

Known API/CLI parity gaps are never treated as usable merely because an example or stale contract
mentions them.

## Consequences

- AI clients must lookup before create and never invent IDs or account/dimension codes.
- Normal invoice and expense ingestion creates the canonical source before posting; it does not
  create journal rows directly.
- Workbook review rows, evidence links and other polymorphic references remain non-canonical until
  an application service validates and links them.
- Posted/issued history is corrected through cancel, reverse, credit, replacement, retire or
  deactivate operations rather than hard delete or relationship rewrite.
- Documentation validation fails when manifest targets, stages, recipes or required safety policies
  are invalid.
