# ERP-1006 risks

- The remaining safety-net routes still load all rows of an organization before paging; convert the next largest (reconciliations, evidence, internal transfers) with the same helpers in `apps/api/src/common/dated-list.ts`.
- Ordering inside one booking date changed from insertion-dependent to id for bank transactions (deterministic keyset order).
