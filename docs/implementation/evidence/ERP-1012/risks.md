# ERP-1012 — Risks & Follow-ups

- Native `<input type="hidden">` and `<input type="file">` remain explicitly permitted by `ADR-013` and `dls-compliance.test.ts` where hidden form serialization or browser file selection is required.
- Remaining legacy oversized workspace files in `scripts/file-size-baseline.json` continue to be guarded by `BR-SIZE-001` and `dls-compliance.test.ts`.
