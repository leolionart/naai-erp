# GF-EXPENSE-002

Exact VND fixture for one invoice-backed operating expense allocated across two client projects and internal overhead. The fixture proves line ordering, dimension identity, allocation totals, deterministic VAT allocation and AP control balance.

The expense-class mapping convention is defined in `../GF-EXPENSE-001/README.md`. In particular, project/category labels such as freelancer, platform and overseas vendor do not replace the evidence-backed expense class and do not imply tax eligibility.

## Files

- `input.json`: immutable source and control totals.
- `expected-journals.csv`: exact line-level posting oracle.
- `expected-allocations.csv`: exact project/internal allocation oracle.
- `expected-tax-view.csv`: independent management/CIT/VAT view.
- `oracle-manual.md`: human-readable arithmetic.
- `SHA256SUMS`: reviewed artifact hashes.
