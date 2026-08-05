# ERP-120 remaining risks and follow-ups

- Client, project and contract master data plus foreign-key binding are owned by ERP-130; ERP-120 only defines their dimension kinds.
- Version overlap is rejected at the domain/repository boundary; a PostgreSQL exclusion constraint may be introduced if range extensions are adopted.
- Allocation plans do not create journal lines. Posting-rule expansion belongs to ERP-200/ERP-210.
- Default project mapping is deferred until ERP-130 creates project master data.
- Exact-commit CI confirmed the PostgreSQL migration and all six integration tests.
