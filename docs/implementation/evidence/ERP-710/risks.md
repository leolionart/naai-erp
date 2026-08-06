# ERP-710 Risks

- External metadata remains untrusted input and is stored as structured metadata only after validation.
- Inbound invoice lines require allocations that reconcile to the line amount. Missing allocations produce `DOCUMENT_ALLOCATION_MISMATCH` and quarantine rather than a partial business effect.
- Posted or otherwise locked accounting resources must never be rewritten by an external upsert.
- Duplicate heuristics supplement stable external identity and may require future accountant-configurable matching rules.
- The isolated native fixture remains separate from `naai`; it must not be treated as production data.
- Exact-commit CI, pushed commit identity, and deployment proof have not yet been recorded.
