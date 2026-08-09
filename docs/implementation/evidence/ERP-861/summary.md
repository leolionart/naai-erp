# ERP-861 summary

The executive dashboard now presents the owner-operated liquidity position as three non-duplicated
controls: company cash and bank, the complete Owner Current liability, and net company funds after
that liability.

Production readback for organization `naai` at 2026-08-09 confirmed:

- cash and bank: `78,333,660` VND;
- company amount owed to owner: `65,438,650` VND;
- net company funds: `12,895,010` VND;
- posted owner-paid company costs: `352,758,650` VND across 106 legacy records;
- unclassified owner-paid count and amount: `0` and `0` VND;
- classification state: `ready`.

The 106 posted records are handled by the approved `owner_final` policy and reviewed Owner Current
mapping. Their posted journals were not edited or reversed.

Twelve provisional 2024 payroll drafts credited to `3388-OWNER` were also normalized through the
versioned expense PATCH API. Each now has `expenseCategoryCode=SALARY` and
`fundingTreatment=owner_paid_company_cost`; all remain draft and therefore do not affect the ledger
or official dashboard totals. No employee, payee or project was invented without source evidence.

Files changed:

- `apps/web/src/app/workspaces/dashboard-workspaces.tsx`
- `apps/web/e2e/dashboard-drilldown.spec.ts`
- `docs/product/business-rules.md`
- `docs/testing/test-catalog.yaml`
- `docs/testing/test-specification.md`
- `docs/implementation/task-ledger.yaml`
