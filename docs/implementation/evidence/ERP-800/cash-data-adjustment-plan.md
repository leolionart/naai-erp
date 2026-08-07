# ERP-800 Cash Data Investigation And Adjustment Plan

## Purpose

This document records the current cash-data anomalies and a non-destructive adjustment plan for the
`naai` organization. It is an investigation artifact only. No posted journal is changed, reversed or
reclassified by this document.

Owner clarification received on 2026-08-07: money withdrawn or transferred from the company account
to a personal account for company purchases, payroll or other company payments remains company money
under personal custody until it is supported by an eligible company expense, returned, or otherwise
classified.

## Current ledger readback

Approved Executive Metrics policy `naai-executive-metrics`, version 1, maps
`unrestricted_cash` to account `111` with sign `1`. Account `111` is an asset account named
`Tiền mặt và tiền gửi`, so the current dashboard formula correctly uses debit minus credit.

As currently posted:

| Measure             |               Amount |
| ------------------- | -------------------: |
| Account 111 debits  |      985,653,157 VND |
| Account 111 credits |    1,458,082,864 VND |
| Account 111 balance | **-472,429,707 VND** |

The negative result is therefore not a UI sign-formatting error. It reflects incomplete or incorrect
historical classification in the posted data.

## Reconciliation of account 111 movements

| Journal category                               |       Debit |      Credit |  Net cash effect |
| ---------------------------------------------- | ----------: | ----------: | ---------------: |
| Bank reconciliation receipts, 41 lines         | 400,271,725 |           0 |     +400,271,725 |
| Legacy expense imports, 209 lines              |           0 | 872,701,432 |     -872,701,432 |
| Reversals of legacy expense imports, 200 lines | 585,381,432 |           0 |     +585,381,432 |
| Purchase payment settlements, 186 lines        |           0 | 563,911,666 |     -563,911,666 |
| Orphan payment settlements, 14 lines           |           0 |  21,469,766 |      -21,469,766 |
| **Current balance**                            |             |             | **-472,429,707** |

The 200 reversed legacy expenses total 585,381,432 VND. Their replacement purchase and orphan
payment settlements total the same 585,381,432 VND, so the migration replacement set is balanced at
this aggregate level.

The remaining nine legacy expense journals were not reversed. Their total is exactly 287,320,000
VND and they are the rows requiring classification below.

## Rows requiring classification

### A. Company funds under personal custody: 235,320,000 VND

These five rows are posted as expenses that credit account `111`, although their source classification
is `Rút tiền mặt sử dụng` / `CASH_TRANSFER`.

| Source row | Date       | Description              |      Amount |
| ---------: | ---------- | ------------------------ | ----------: |
|         22 | 2025-02-25 | Rút tiền mặt sử dụng     |  45,000,000 |
|         46 | 2025-04-28 | Rút tiền mặt sử dụng     |  40,000,000 |
|         85 | 2025-07-30 | Rút tiền mặt sử dụng     |  27,320,000 |
|        151 | 2026-02-04 | Rút tiền mặt sử dụng     |  23,000,000 |
|        173 | 2026-03-22 | Mở sổ tiết kiệm lãi 7.7% | 100,000,000 |

Planned treatment:

1. Do not treat the transfer itself as an expense.
2. Reverse the incorrectly posted expense journal through the normal reversal lifecycle.
3. Repost the transfer to a dedicated asset/subledger representing company funds held by a named
   custodian. An accountable advance account such as `141` is the default candidate; the final chart
   of accounts code and custodian dimension require owner/accountant approval.
4. Settle that asset only when supported company expenses, payroll payments, return transfers or
   another approved use are matched to it.
5. Treat the 100,000,000 VND savings deposit separately. Verify ownership, bank evidence, term and
   withdrawal restrictions before deciding whether it belongs to unrestricted cash, restricted cash,
   or short-term investment/deposit.

### B. Rows currently labeled owner withdrawal: 52,000,000 VND

Four rows of 13,000,000 VND each are posted as `Chi tiêu cá nhân / Rút vốn chủ sở hữu`, dated monthly
from 2025-08-05 through 2025-11-05. They are also the only four staged `owner_movement` rows and still
carry `owner_movement_requires_classification`.

Planned treatment:

- If these amounts were retained solely for company spending, reclassify them to company funds under
  personal custody using the same controlled reversal/repost flow as group A.
- If any amount was genuinely personal consumption, owner draw, dividend, loan or capital return,
  retain it outside unrestricted company cash and classify it to the approved equity/receivable/loan
  treatment.
- Do not bulk-reclassify these four rows without evidence because their current source wording
  explicitly says personal spending/owner withdrawal.

## Residual gap after custody reclassification

Adding all nine questioned rows back to management-available company funds would produce:

`-472,429,707 + 287,320,000 = -185,109,707 VND`

Therefore the withdrawal classification is material but does not fully explain the negative balance.
The remaining 185,109,707 VND gap is exactly the excess of replacement payment settlements
(585,381,432 VND) over recorded bank reconciliation receipts (400,271,725 VND).

Before any final cash balance is accepted, investigate:

1. Opening cash and bank balances before the first imported transaction.
2. Owner capital contributions or owner loans used to fund company payments.
3. Company receipts not present in the 41 imported bank transactions.
4. Expenses paid directly from personal funds before reimbursement; these should create an amount
   payable to the person, not negative company cash.
5. Whether the 14 orphan settlements have exact bank/custodian evidence and valid source invoices.
6. Whether account `111` improperly combines bank, physical cash and personal-custody balances without
   account/subledger separation.

## Target data model and dashboard presentation

Maintain separate balances for:

- Company bank and physical cash.
- Reviewed company funds under personal custody.
- Restricted deposits or investments.
- Unsettled accountable advances.
- Personal-funded company expenses payable back to the person.

The dashboard should show:

1. `Tiền tại ngân hàng/quỹ`.
2. `Tiền công ty do cá nhân giữ` — only reviewed and reconciled custody balances.
3. `Tổng tiền khả dụng` — approved unrestricted components only.
4. `Tạm ứng chưa đối soát` and `Tiền cá nhân đã chi hộ` as separate warnings, not cash.

The canonical balance sheet must continue to follow the approved account mapping. A management cash
metric may include reviewed custody balances only after its semantic mapping and evidence rules are
approved; it must not blindly include every balance in account `141`.

## Proposed execution sequence

1. Export the nine source rows, journal IDs and available bank/source evidence into a review sheet.
2. Assign a custodian and classification to each row: company custody, restricted deposit, genuine
   owner movement, personal-funded expense, or unresolved.
3. Reconcile downstream purchases/payroll against custody advances without creating a second expense.
4. Identify and document the missing opening/funding amount for the residual 185,109,707 VND.
5. Produce proposed reversal and replacement journals in dry-run form.
6. Obtain owner/accountant approval for account codes, effective dates and semantic cash inclusion.
7. Execute through versioned REST/CLI services with idempotency and audit evidence; never update posted
   journal lines directly.
8. Re-run trial balance, cash/bank reconciliation, AR/AP, P&L, balance sheet and Executive Dashboard
   readbacks before accepting the corrected data.

## Acceptance conditions for a later correction task

- Every questioned withdrawal has source evidence, custodian and approved classification.
- Posted history is preserved through reversal/replacement journals.
- No purchase, payroll or expense is recognized twice.
- Debit equals credit for every new posted journal.
- Account 111 no longer becomes negative solely because internal custody transfers were treated as
  expenses.
- The residual opening/funding gap is resolved or remains explicitly reported as an exception.
- Dashboard cash components tie to the approved semantic mapping and drill down to journal/source IDs.
