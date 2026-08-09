# ERP-872 Tests

- Preflight: `111-CASH`, `112-BANK`, `113-TRANSIT` active; all four fiscal periods open.
- Duplicate check: no matching canonical transactions or internal transfers existed.
- Bank import dry-run: 4 accepted, 0 rejected, 0 mutations.
- Cash import dry-run: 4 accepted, 0 rejected, 0 mutations.
- Bank import commit: 4 imported, 0 duplicates, 0 rejected.
- Cash import commit: 4 imported, 0 duplicates, 0 rejected.
- Internal transfers: 4 created, all `reconciled`, one posted journal each.
- Journal readback: exact Dr `111-CASH` / Cr `112-BANK` for 45,000,000; 40,000,000; 27,320,000; and 23,000,000 VND.
- Cash-history readback: four `cash-owner-custody` transactions, all `reconciled`.
- Owner Current readback unchanged: increase 352,758,650; decrease 0; closing 352,758,650 VND.
- Production account readback: `cash-owner-custody`, kind `cash`, ledger `111-CASH`, active.
- Production transfer readback: four `erp872-owner-custody-transfer-*` records, all `reconciled`.
- Production journal IDs: `b356eafd-2e15-434d-b802-5ee64b92b980`, `9728a6b2-29bc-47a5-a62e-ea907891ccdb`, `4b9a1f9f-ddb2-41b7-b388-95d38e36e566`, `966c29fb-a90c-41cc-8b5b-8ed50e3492a4`.
- Production-backed `http://localhost:3000/banking` readback: all four amounts visible in cash history with status `Đã đối soát`.
