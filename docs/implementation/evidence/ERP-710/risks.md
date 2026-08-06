# ERP-710 Risks

- External metadata remains untrusted input and is stored as structured metadata only after validation.
- Inbound invoice lines require allocations that reconcile to the line amount. Missing allocations produce `DOCUMENT_ALLOCATION_MISMATCH` and quarantine rather than a partial business effect.
- Posted or otherwise locked accounting resources must never be rewritten by an external upsert.
- Duplicate heuristics supplement stable external identity and may require future accountant-configurable matching rules.
- The isolated native fixture remains separate from `naai`; it must not be treated as production data.
- Exact-commit CI is recorded for `edcbb6695aa31189e41c2c429b6a1644ce2f2f3f`; external integrations still require production credential and network validation in their deployment environment.
