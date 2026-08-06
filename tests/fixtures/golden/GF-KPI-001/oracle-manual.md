# Manual oracle review — GF-KPI-001

This fixture is independent from production comparison code. All money is exact VND minor units; percentages use integer basis points with deterministic half-up rounding.

## Selected actual basis

At the 2024-02-15 `Asia/Ho_Chi_Minh` cutoff the source observations are:

- recognized: 120,000,000;
- invoiced: 150,000,000;
- collected: 90,000,000.

The selected basis is `recognized`, so every comparison uses 120,000,000 unless its row explicitly represents forecast accuracy or a denominator-control case. The other two axes remain visible controls and are never substituted.

## MTD target attainment

February 2024 has 29 calendar days. The cutoff includes 15 local calendar days.

```text
Prorated target = 290,000,000 × 15 / 29 = 150,000,000
MTD variance    = 120,000,000 − 150,000,000 = −30,000,000
MTD attainment  = 120,000,000 / 150,000,000 = 8,000 bps
Full variance   = 120,000,000 − 290,000,000 = −170,000,000
Full attainment = 120,000,000 / 290,000,000 = 4,138 bps
```

Target proration uses inclusive elapsed local dates and integer half-up division.

## MoM, YoY and forecast variance

```text
MoM: 120,000,000 vs 100,000,000 = +20,000,000 / +2,000 bps
YoY: 120,000,000 vs  80,000,000 = +40,000,000 / +5,000 bps
Forecast vs target: 270,000,000 vs 290,000,000 = −20,000,000 / −690 bps
Actual vs retained forecast: 300,000,000 vs 280,000,000 = +20,000,000 / +714 bps
```

The comparator kind and denominator are explicit. Forecast-versus-target and actual-versus-retained-forecast are not interchangeable.

## Missing and zero denominator

- Missing prior-year data returns `not_available` with `missing_comparison`; comparator, amount variance and percentage fields are null. It is never synthesized as zero.
- A real zero comparator preserves the valid +10,000,000 amount variance, but variance/attainment percentages are null with `zero_denominator`.

## Leap year and timezone

- `2024-02-29T16:59:59Z` is 2024-02-29 23:59:59 in Ho Chi Minh City and belongs to February.
- One second later, `2024-02-29T17:00:00Z`, is local 2024-03-01 and belongs to March.
- February 29, 2024 maps to February 28, 2023 for comparable prior-year MTD because the prior year has no February 29.

## Fiscal period

`FY2024-P02` runs 2024-01-26 through 2024-02-25. At local 2024-02-15 it has 21 elapsed days out of 31.

```text
Prorated fiscal target = 310,000,000 × 21 / 31 = 210,000,000
Fiscal MTD attainment  = 168,000,000 / 210,000,000 = 8,000 bps
```

The fiscal period is selected by its explicit dates and IDs. It must not silently become a calendar month.
