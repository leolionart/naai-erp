# ERP-001 Test Evidence

Runtime used:

```text
Node v22.21.1
pnpm 10.30.1
```

Commands and results:

```text
pnpm install --frozen-lockfile  PASS
pnpm lint                     PASS (9/9 packages)
pnpm typecheck                PASS (9/9 packages)
pnpm test                     PASS (5 tests; all package tasks passed)
pnpm build                    PASS (9/9 packages; Next.js production build passed)
pnpm -r --depth -1 list       PASS (10 workspace projects including root)
```

Clean-clone verification:

```text
Clone source commit: 6357dd3
Temporary clone: /private/tmp/naai-erp-clean.R7uL3d
pnpm install --frozen-lockfile  PASS
pnpm check                     PASS
Next.js BUILD_ID               PRESENT
```

App smoke coverage:

- Web `/health` route test.
- API `/health/live` and `/health/ready` injection tests.
- Worker heartbeat test.
- Domain package identity test.
