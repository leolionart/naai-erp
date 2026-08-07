# ERP-810 Tests

```text
pnpm test:docs
# Verified 10 accepted ADRs, 11 rule references, and 26 AI relationship resources.
```

The validation checks accepted ADR/rule traceability and parses the relationship manifest to verify:

- unique resource IDs;
- known creation stages and dependency targets;
- parent stages do not occur after child stages;
- reference targets and missing-reference policies are complete;
- direct database access and guessed relationships are prohibited;
- canonical guide sections and machine-readable recipes exist.
