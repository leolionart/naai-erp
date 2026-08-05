# ADR-007: Source and Dependency License Policy

- Status: Accepted
- Date: 2026-08-05
- Task: ERP-002

## Context

Research included GPL, AGPL, BSL, Elastic, MIT and Apache projects. Copying implementation code without review could impose unwanted distribution/network obligations.

## Decision

- NAAI ERP is private and `UNLICENSED` until the owner chooses a distribution license.
- Repository research is design inspiration, not automatic permission to copy code.
- MIT/BSD/Apache dependencies may be used with required notices and review.
- GPL/AGPL code is not copied into the core without explicit legal/license decision.
- BSL/Elastic/source-available code is not treated as open source; no copying without compatible commercial permission.
- External services may be integrated over APIs, with deployment/license obligations documented.
- New dependencies require license metadata, source URL and security/maintenance evaluation.
- Generated artifacts/SBOM must preserve dependency licenses.

## Consequences

- A dependency/license inventory becomes a CI/release gate in later tasks.
- License ambiguity blocks adoption rather than being resolved by assumption.

