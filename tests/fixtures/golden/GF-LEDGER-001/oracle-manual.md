# GF-LEDGER-001 Independent Manual Oracle

This reviewed fixture is maintained independently from production report code.

- Opening journal: debit and credit `500,000,000` VND.
- Period activity: debit and credit `209,000,000` VND.
- Cumulative posted/reversed-history movements: debit and credit `709,000,000` VND.
- Closing balances: Bank Dr 310m; AR Dr 105m; Equipment Dr 80m; OPEX Dr 40m; AP Cr 30m; Capital Cr 450m; Revenue Cr 50m; VAT Output Cr 5m.
- Closing debit presentation totals `535,000,000`; closing credit presentation totals `535,000,000`; net difference zero.

The cumulative movement total is intentionally different from the closing-side presentation. Original reversed history remains reportable together with its inverse reversal.

Reviewed artifact SHA-256:

- `input.json`: `f543bdd5f07ee5950286b0f7215832f93469a7bc56e8c4228fbda81c4305894e`
- `expected-journals.csv`: `6db179429c186b66a1da28e2740e44e8a65bb572696ea58309e3892589bb1835`
- `expected-trial-balance.csv`: `ba3f9f4961e3a3b0a1ab792f2d05f7b97512658ed9534d10716545956290c952`
- `expected-general-ledger.csv`: `0886466edfb1a3ca8b17868dc3bf04fd58ad17d258d2f6cda89ffc49818aaa64`
