# Manual oracle review — GF-FORECAST-002

This fixture is maintained independently from production forecast code. All amounts are exact VND minor units; no binary floating-point money is used.

## Revenue forecast

Selected actual basis is `recognized` and actual-to-date is 40,000,000.

```text
Actual-to-date                 40,000,000
+ committed milestone         30,000,000
+ scheduled recurring         12,000,000
+ pipeline 20,000,000 x 50%   10,000,000
- reviewed manual adjustment   2,000,000
= projected revenue           90,000,000
```

Pipeline weighting uses integer half-up division: `(amount × probability_bps + 5,000) / 10,000`.

## Expense forecast

```text
Payroll                       35,000,000
+ recurring OPEX               8,000,000
+ reviewed manual adjustment   1,000,000
= projected expense           44,000,000
```

These are expense expectations. Payment timing is represented separately in cash components, so recording the payroll cash outflow does not create a second expense.

## Cash forecast

```text
Opening cash                  25,000,000
+ expected collections        50,000,000
+ owner financing             10,000,000
- payroll                     35,000,000
- AP due                      12,000,000
- recurring expense            8,000,000
- tax                          3,000,000
- capex                        5,000,000
= projected closing cash      22,000,000
```

Owner funding is classified as financing. It is not revenue and is not an operating collection.

## Controls

- The negative-control contract view and opportunity view share canonical root `deal:deal-duplicate` on the same scheduled date, so including both must be rejected as double-counting.
- Both manual adjustments have separate maker and reviewer identities and are reviewed before inclusion.
- Revenue, expense and cash axes may refer to the same underlying schedule because they describe different measures; deduplication is enforced within an axis, not across unlike axes.
