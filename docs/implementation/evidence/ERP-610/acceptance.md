# ERP-610 acceptance evidence

Accepted coverage:

- Local fixture pass: actual-to-date remains labeled by the forecast version's recognized, invoiced or collected basis.
- Local fixture pass: projected revenue equals actual-to-date + committed milestones + scheduled recurring + weighted pipeline + reviewed manual adjustment.
- Local fixture pass: pipeline weighting uses exact integer basis points and deterministic half-up rounding.
- Local fixture pass: canonical commercial source identity rejects the same root/date represented twice.
- Local fixture pass: payroll and recurring OPEX form the expense forecast without being duplicated by cash-payment timing.
- Local fixture pass: projected closing cash equals opening cash + expected collections + financing − payroll − AP due − recurring expense − tax − capex ± reviewed adjustment.
- Local fixture pass: owner funding is financing only; it is neither revenue nor operating collection.
- Pass locally: domain/API behavior requires maker-checker review, reason and audit metadata for manual adjustments.
- Pass locally: published and retained month-end forecast composition rejects mutation.
- Implementation and PostgreSQL test proof present: publish validates and snapshots composition atomically with the forecast state transition; a failed publish cannot leave a partially published version or detached snapshot.
- PostgreSQL regression proof present for CI execution: after publish, a newly inserted backdated recognition event does not alter composition readback because published reads use the immutable stored snapshot.
- Pass locally: mutation services enforce organization scope, authorization, idempotency and optimistic resource versions.
- Pass locally: REST/OpenAPI, capabilities and first-party CLI expose component CRUD/review/exclude and composition readback.
- Pass locally: forecast composition is reachable from admin navigation and uses a dedicated detail page, short Dialog, URL-backed filter Sheet, source Drawer and reasoned AlertDialog.
- Pass locally: the full Playwright suite passes 37/37 desktop/mobile journeys, including composition totals, component creation, edit/delete lifecycle, source review/drill-down and responsive planning routes.
- Pass locally: `pnpm check`, `pnpm db:check` and `pnpm test:fixtures` pass in the integrated worktree.
- Pass in exact-commit CI: PostgreSQL-specific ERP-610 integration proves atomic snapshot persistence, late-backdated stability, RBAC and idempotency behavior.

Exact-commit GitHub CI passed for `6cb0f3e6025549bf16f00f23ff296ddd5f694143`: https://github.com/leolionart/naai-erp/actions/runs/31058711237.
