# ERP-346 Risks

- Payment allocation remains intentionally deferred to ERP-400/410 and Gate G4.
- Browser E2E uses synthetic local credentials/data and must not depend on production secrets.
- The cross-module PostgreSQL test is verified locally only as a skipped integration definition; GitHub CI is the authoritative database execution.
