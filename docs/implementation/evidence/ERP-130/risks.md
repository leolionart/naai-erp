# ERP-130 remaining risks and follow-ups

- Bank account numbers are sensitive and must be masked in DTOs/logs; encryption and retention controls belong to security hardening.
- Domain services must verify that the selected project client has the explicit client role before persistence.
- Merge execution that rewrites references must be transactional and audited when repositories/APIs are introduced.
- Milestone invoicing and revenue recognition states belong to ERP-300 and ERP-520.
- Exact-commit CI must confirm migration and seven integration tests before task completion.
