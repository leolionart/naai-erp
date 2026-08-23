# Local development organization scope

The local development database is intentionally scoped to the real organization `naai`.
Test fixtures must use an isolated database or transaction and must not leave test organizations in
the shared dev database.

Verify the guard with:

```sh
node scripts/verify-dev-organization-scope.mjs
```

The cleanup backup is kept outside Git under `.local-backups/`. Never apply this cleanup to
production; production organization data requires an explicit migration and backup/restore plan.
