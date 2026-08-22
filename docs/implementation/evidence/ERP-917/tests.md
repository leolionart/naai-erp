# ERP-917 test evidence

Results:

- API operational-log service: 2 passed.
- Worker suite including retention: 11 passed, 2 skipped.
- CLI client suite: 93 passed.
- Web API/navigation suite: 4 passed; web TypeScript passed.
- `pnpm test:docs`, ESLint on changed surfaces and `git diff --check` passed.
- Full `pnpm check` was rerun through formatting; the repository gate is otherwise pending the
  remaining long-running stages in this environment.
