# ERP-857 risks and follow-ups

- Production cannot accept the new identity metadata or worker correction fields until this code and
  migration are deployed; no production deployment was performed in ERP-857.
- Payroll and bonus registers remain unavailable because the ERP has no canonical payroll/bonus
  resources or approved privacy/access policy. The workbook Controls sheet states this explicitly;
  values are not inferred from generic expenses or timesheets.
- Lark task-management sheets are outside the ERP boundary and are not reproduced.
- Customer contacts/subscriptions may be added as a later scoped resource if the owner wants those
  CRM details managed canonically rather than as party metadata.
