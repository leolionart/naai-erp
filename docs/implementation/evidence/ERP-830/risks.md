# ERP-830 Risks

- Live capabilities can differ from checked-in documentation; the skill requires runtime discovery.
- The skill does not add missing REST/CLI operations and must stop at documented parity gaps.
- Production mutations still depend on valid credentials, RBAC and explicit authority.
- Accounting classification that depends on owner/accountant policy cannot be inferred by the skill.
