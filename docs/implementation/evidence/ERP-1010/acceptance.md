# ERP-1010 — Acceptance Criteria

1. **Statutory effective-date threshold**:
   - Purchases dated `< 2025-07-01` evaluate against `20,000,000` VND under the standard statutory policy; purchases dated `>= 2025-07-01` evaluate against `5,000,000` VND.
2. **Custom organization threshold preserved**:
   - Organizations that configure a custom `nonCashThresholdMinor != 5_000_000n` retain their explicit custom threshold across all dates.
3. **Tax finalization flag sync**:
   - `POST /expenses/tax-finalization/commit` clears stale `payment_evidence_missing` flags on finalized lines and parent headers.
