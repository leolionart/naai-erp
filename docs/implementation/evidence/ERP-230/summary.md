# ERP-230 Summary

Implemented controlled fiscal-period close/reopen and posting-date enforcement.

- Period lifecycle is stepwise `open → soft_locked → hard_locked` and reversed stepwise through privileged reopen.
- Close/reopen require reason, authorized actor, idempotency, audit event, period event and transactional outbox event.
- Direct period-state mutation is blocked at the API registry and PostgreSQL trigger layers.
- Fiscal period ranges cannot overlap within an organization.
- Open periods allow normal posting; soft locks use organization-configured finance roles; hard locks deny posting and backdated reversal even for elevated actors.
- Reversal checks its new posting date, so a locked original can be corrected only into an allowed open/soft period.
- REST/OpenAPI and CLI expose close/reopen without direct database access.

Start commit: `803fbc9466d9f178cf0d0224556387c4699111f0`.
