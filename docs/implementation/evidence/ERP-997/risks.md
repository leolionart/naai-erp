# ERP-997 — Risks & Follow-ups

- Routes marked `bounded (safety net, in-memory page)` in `docs/api/list-endpoint-inventory.md` still load the organization's rows before slicing; migrate high-volume tables to SQL keyset individually as needed.
