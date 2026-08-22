# ERP-921 summary

## Outcome

In progress. ERP-921 unifies correction of customer/supplier, project, category and description into
one UI/API/CLI action. Drafts update in place; issued/posted records preserve immutable history and
produce the required reversal/replacement through the same application service.

## Decisions

- The caller provides desired final business metadata once; backend matching and orchestration are
  implementation responsibilities.
- Ambiguous or incompatible relationships fail with structured errors and zero mutation.
- "Editable" does not authorize overwriting posted journals.
