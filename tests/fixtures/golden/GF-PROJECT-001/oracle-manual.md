# Manual oracle review — GF-PROJECT-001

Reviewed independently from production code using integer VND minor units.

For every project:

1. `gross margin = recognized revenue - labor - freelancer/direct cost`.
2. `contribution margin = gross margin - variable overhead`.
3. `fully loaded profit = contribution margin - fixed overhead`.
4. Margin basis points use half-away-from-zero rounding of `margin / recognized revenue * 10,000`.
5. Realized hourly rate uses half-away-from-zero rounding of `recognized revenue / billable hours`.
6. Utilization uses half-away-from-zero rounding of `billable hours / available hours * 10,000`.
7. Overrun compares actual direct plus all overhead against the approved cost budget.
8. Recognized but uninvoiced work and overdue receivables remain confidence flags; collected cash is never used as profit.

The TOTAL row is recalculated from source totals rather than summing project percentages or project hourly rates. The four control rows are independently tied to ledger/read-model dimensions with zero difference.

The rate and overhead policy version identifiers are historical references. A newer rate or allocation policy must not rewrite this reviewed August snapshot.
