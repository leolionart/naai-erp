# Risks and follow-ups

- Integration suites using fixed organization IDs (`org-a`, `org-b`) must run against a clean disposable database with `--fileParallelism=false` when executed together to avoid cross-file fixture collisions.
- Node 26 emitted the repository's existing engine warning (`>=22 <25`); no behavior failure was observed.
