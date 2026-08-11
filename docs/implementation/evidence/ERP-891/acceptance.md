# ERP-891 Acceptance

- Local mode selects the local database, forces the web client to `http://localhost:3001`, runs native
  database setup before API/Web startup, and rejects `--write`: proven by automated tests and check mode.
- Production mode delegates to the hardened server-only production API proxy and remains read-only by
  default: proven by automated delegation coverage and live check mode.
- Saved browser API overrides cannot cross profiles because both set
  `NEXT_PUBLIC_FORCE_DEFAULT_API_CONNECTION=1`.
- Operators have short, documented commands for both profiles and can validate them without starting or
  stopping servers.
