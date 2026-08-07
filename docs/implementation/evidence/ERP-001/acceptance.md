# ERP-001 Acceptance

| Criterion                                                   | Result | Evidence                                               |
| ----------------------------------------------------------- | ------ | ------------------------------------------------------ |
| Repository uses the target apps/packages/docs/deploy layout | PASS   | Workspace tree and root README                         |
| Frozen lockfile install succeeds on pinned Node/pnpm        | PASS   | `tests.md`                                             |
| Workspace dependency graph resolves                         | PASS   | 10 projects listed, 9 runnable packages                |
| Baseline lint/typecheck/test commands succeed               | PASS   | `tests.md`                                             |
| Production builds succeed                                   | PASS   | `tests.md`                                             |
| Health/readiness foundations exist                          | PASS   | Web and API health tests                               |
| No business schema created before ADR approval              | PASS   | `db/migrations/README.md` only                         |
| Private GitHub repository exists and `main` is pushed       | PASS   | https://github.com/leolionart/naai-erp                 |
| Clean clone passes frozen install and full check            | PASS   | `/private/tmp/naai-erp-clean.R7uL3d`, commit `6357dd3` |
