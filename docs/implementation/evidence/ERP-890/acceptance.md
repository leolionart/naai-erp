# ERP-890 acceptance

- Budget-only freelancer estimate creates no payable: enforced by payable creation only at canonical expense posting.
- Posted freelancer expense requires freelancer payee, project and due date and creates one expense-linked payable.
- Partial/full payment, exact outstanding limits, balanced journal, period/RBAC/audit/idempotency: implemented.
- AP aging source is `project_freelance_payable`; purchase invoices are excluded.
- Explicit purchase `fundingSource.financialAccountId` resolves server-side and produces paid state without AP residue.
- Missing purchase funding remains posted and is never marked paid by status alone.
- Native migration gate: `51/51` healthy.
- PostgreSQL freelancer and commercial-document integration: `9/9` passed.
- Desktop/mobile rendered workflow: `3/3` passed.
- Full repository quality gate: passed.
