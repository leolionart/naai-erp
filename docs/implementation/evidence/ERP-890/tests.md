# ERP-890 tests

- Domain validation: passed `2/2`.
- Contract validation: passed `1/1`.
- Migration `0049_project_freelance_payables` and `0050_purchase_invoice_funding`: applied locally;
  native database status passed `51/51`.
- PostgreSQL payable/payment/AP-aging plus commercial-document integration: passed `9/9` across
  two files. The purchase assertion proves `paid`, exact credit to the selected funding account and
  no AP journal line.
- API, CLI and database typecheck: passed.
- Desktop/mobile Playwright for ERP-890: passed `3/3`.
- `pnpm check`: full repository quality gate passed.
- `git diff --check`: passed.
