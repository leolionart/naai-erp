# ERP-891 Summary

Added explicit native-development profiles for selecting either local PostgreSQL plus the local API,
or production data through the existing server-only API proxy. The profiles share one web port and are
switched by restarting the development process, preventing browser credentials and Next.js build state
from leaking between modes.

Changed files:

- `scripts/dev-data-source.mjs`
- `tests/dev-data-source.test.ts`
- `package.json`
- `apps/web/.env.example`
- `docs/runbooks/native-development.md`
- testing and implementation documentation
