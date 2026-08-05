# ADR-003: Accounting Invariants

- Status: Accepted
- Date: 2026-08-05
- Task: ERP-002
- Rules: BR-LED-001, BR-LED-003, BR-PER-001, BR-REV-001, BR-TAX-001

## Context

Financial correctness cannot depend on UI convention. The accounting kernel needs invariants enforced in domain logic and database transactions.

## Decision

- Store money with exact decimal/minor-unit semantics; never binary float.
- Every posted journal balances in base currency.
- A journal line has debit or credit, never both.
- Posting is atomic and idempotent.
- Posted journals are immutable; correction uses linked reversal/replacement.
- Closed periods reject ordinary posting and backdating.
- Recognized, invoiced and collected revenue remain separate measures.
- Management booking, CIT deductibility and VAT deductibility remain separate states.
- Reports consume posted ledger/read models, never unapproved drafts.
- Golden fixtures and an independent oracle validate statements.

## Enforcement layers

1. Typed domain/value objects.
2. Aggregate/state-machine validation.
3. Database constraints and transaction boundaries.
4. Property/integration/golden tests.
5. Report reconciliation gates.

## Consequences

- No business document may write arbitrary journal lines without posting rules or elevated manual-journal workflow.
- Golden expected outputs require explicit review; tests are not weakened to accommodate implementation errors.

