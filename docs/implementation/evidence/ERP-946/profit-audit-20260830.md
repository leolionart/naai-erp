# PROD profit audit 2026-08-30

Environment: PROD organization `naai`. The audit was read-only and followed the
backup `naai-erp-20260830-150939-pre-profit-audit.dump`.

## Annual derived totals

- 2024: revenue `0`, posted expense `4,944,942`, accounting profit `-4,944,942`, taxable profit `355,329,474`, CIT `71,065,894`.
- 2025: revenue `188,790,250`, posted expense `457,867,973`, accounting profit `-269,077,723`, taxable profit `91,196,693`, CIT `18,239,338`.
- 2026 YTD through 2026-08-30: revenue `115,256,787`, posted expense `127,415,389`, accounting profit `-12,158,602`, taxable profit `51,083,000`, CIT `10,216,600`.

The first two dashboard values above are the pre-fix readback. The dashboard
query was incorrectly binding `asOf` as the expense/CIT range end. With the
selected annual end date, the reconciled estimates are 2024 taxable profit
`-4,944,942` / CIT `0`, and 2025 taxable profit `27,955,091` / CIT `5,591,018`.
The 2026 YTD result is unchanged because its selected end date is before the
audit `asOf` date.

## Controls

- Posted/reversed journal debit-credit imbalance: `0`.
- All audited posted expense lines currently have `cit_state=ineligible` and `cit_eligible_minor=0`.
- No credit notes were present in the active PROD commercial-document set at audit time.

## Anomalies requiring correction workflow

- Several `tax_payment` rows are posted to expense account `642-OPEX` and categorized as `SALARY` or `OTHER_EXPENSE`; this may be a classification error, but needs the source payment/evidence before reversal and replacement.
- `Hoàn tiền cọc` is categorized as `SALARY`; it should be reviewed against the deposit-refund category and its original deposit relationship.
- Utilities, meals, server/domain, office decoration and electronic-equipment descriptions are inconsistently mapped to categories; the category must be corrected through the metadata/correction workflow, not by rewriting posted journals.
- 2025 and 2026 taxable profit is positive despite accounting losses because the current tax read model adds all ineligible expense adjustments. This is data/configuration-driven, not a hardcoded amount. It must not be changed without evidence that a line is CIT-eligible or that a tax-payment/deposit movement is not an expense.

No posted amount or journal was rewritten. No tax eligibility was guessed.
