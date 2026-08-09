# ERP-865 Tests

## Documentation gate

```text
Command: pnpm test:docs
Result: PASS
Output: Verified 11 accepted ADRs, 12 rule references, and 27 AI relationship resources.
```

## Docker Compose merged configuration

```text
Command: POSTGRES_PASSWORD=local-only SESSION_SECRET=<32-character-test-value> docker compose -f compose.yaml -f compose.build.yaml config --quiet
Result: PASS
```

## Compose packaging contract

```text
Command: node scripts/verify-compose.mjs
Result: PASS
Output: Compose packaging contract passed.
```

## Diff hygiene

```text
Command: git diff --check
Result: PASS
```
