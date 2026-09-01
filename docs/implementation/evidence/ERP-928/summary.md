# ERP-928 summary

Dashboard metric cards now combine a readable value, business context, status and optional monthly trend sparkline. Cards use shadcn semantic surfaces with a restrained translucent/blur treatment and no raw palette overrides.

Follow-up styling centralizes four reusable card variants (`surface`, `primary`, `muted`, `danger`).
Each variant supplies coordinated background, text, badge, trend and action-arrow tokens so light
and dark mode remain readable. Company funds uses `primary`; review queues use `muted`; overdue or
negative positions use `danger`; ordinary financial metrics use `surface`.
