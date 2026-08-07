# ERP-841 risks

- The project-cost subsystem has no canonical API/CLI operation that materializes
  `project_cost_items` from posted expense, purchase, timesheet or reclassification sources. Direct
  cost display now reads posted purchase allocations canonically, but overhead pools still cannot be
  seeded without forbidden business-table SQL.
- Consequently the dashboard must continue describing its profit number as ledger profit until a
  posted overhead allocation run exists; ERP-841 must not be marked done before that gap is closed or
  the fully-loaded card is changed to a truthful non-fully-loaded label.
- The web project budget create form still lacks the scope-change inputs required for a revision; the
  existing approved demo baseline is read-only safe.
- Commercial invoice allocations still persist project attribution in `dimensions.projectId`; they
  do not persist canonical `contractId` or `milestoneId`. The issue gate prevents aggregate project
  over-invoicing but cannot report exactly which contract or milestone an allocation consumed.
- The added salary, freelance and contract-dev records are direct-cost and expense examples only.
  Shared payroll remains on operating expense and is not presented as project cost until a canonical
  overhead allocation run exists, preventing double counting or a false fully-loaded claim.
