# ERP-710 Risks

- External metadata remains untrusted input and is stored as structured JSON only after validation.
- Posted or otherwise locked accounting resources are never rewritten by an external upsert.
- Duplicate heuristics supplement stable external identity and may require future accountant-configurable matching rules.
