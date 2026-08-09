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

## Standalone release Compose configuration

```text
Command: POSTGRES_PASSWORD=local-only SESSION_SECRET=<32-character-test-value> docker compose -f compose.yaml config --quiet
Result: PASS
```

## Standalone file download

```text
Command: download compose.yaml and deploy/env/.env.example from raw.githubusercontent.com at commit dcd91cfaa4b5aeb0b9d0079b05813e3ebb18b624
Result: PASS
Proof: downloaded Compose validates with docker compose config --quiet; environment template returned successfully.
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
