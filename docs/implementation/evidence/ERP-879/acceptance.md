# ERP-879 acceptance

- [x] Migration inventory registers 0046 after 0045.
- [x] Existing posted-expense metadata regression remains green when database integration is enabled;
  the current local command was skipped because no local PostgreSQL runtime was available.
- [x] Production migration and representative API mutation succeed.
- [x] All production expense payees are populated and read back.
