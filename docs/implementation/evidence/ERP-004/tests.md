# ERP-004 Test Evidence

```text
pnpm test:security-baseline  PASS (4 required documents)
pnpm check                   PASS
domain tests                 PASS (6 tests)
```

Security tests include:

- Same-organization access accepted.
- Cross-organization access rejected.
- Empty organization identifier rejected.
- Explicit role allowed.
- Unassigned role denied by default.
