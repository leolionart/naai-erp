# ERP-983 Acceptance Criteria

| Criterion | Status | Proof |
| --- | --- | --- |
| Classify company bank deposit from owner as `owner_funding` (`Nợ 112 / Có 3388`), never revenue | Pass | `PgOwnerFundingStore.record` posts `Dr bank.ledger_account_code / Cr owner_current`; `T-INT-PAY-004` verifies exact journal lines and `revenueMinor === "0"`. |
| Subsequent company expenses paid from that bank account use `company_bank`, optionally linking to funding transaction for traceability | Pass | `expenses.owner_funding_movement_id` & `commercial_documents.owner_funding_movement_id` in migration `0077`; `resolveOwnerFundingTraceability` validates matching `company_bank` account and `GET /banking/owner-funding` exposes `linkedSpendMinor` and `linkedRecords`. |
| API & CLI (`owner-funding record` / `list`) from bank transaction or manual entry with reference, reflected in owner-current position | Pass | `OwnerFundingController`, `apps/cli/src/client.ts`, `apps/cli/src/main.ts`, `apps/api/src/banking/owner-current-read-model.ts`, and `operating-dashboard-settlement.sql.ts`; verified in `T-INT-PAY-004` and `owner-funding-cli.test.ts`. |
| Connect/expose `owner_repayment` (`Nợ 3388 / Có 112`) cleanly on the same CLI/API surface | Pass | `movementType: "owner_repayment"` and CLI `owner-funding repay` / `recordOwnerRepayment` post `Dr 3388 / Cr 112` and reduce confirmed owner settlement without creating an expense. |
| Docs, OpenAPI, gate matrix, business rules (`BR-PAY-004`), task ledger, and 500-line file rule | Pass | Updated `openapi-v1.json`, `solopreneur-gate-matrix.json`, `business-rules.md`, `test-specification.md`, `test-catalog.yaml`, `task-ledger.yaml`; verified all new code files <= 500 code lines and existing >500-line files did not grow. |
