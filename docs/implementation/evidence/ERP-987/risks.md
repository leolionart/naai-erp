# ERP-987 Risks & Follow-Ups

1. **Profit distribution tax/legal formalities**:
   - For a single-member LLC (`TNHH MTV`) in Vietnam, profit distribution (`Dr 421 / Cr 1388`) after corporate income tax generally carries 0% personal income tax on owner profit share, whereas joint-stock / multi-member structures or distributions exceeding post-tax retained earnings require formal owner resolution and tax review. The UI and API require an explicit reason and optional resolution `reference`, and surface `421` retained earnings alongside unclosed profit for transparency.
2. **Soft-warning close governance**:
   - By design (`BR-CLOSE-001`), checklist warnings do not hard-block `POST /fiscal-periods/close` when an authorized owner/finance admin provides a reason. All active `checklistWarnings` are recorded immutably in `resource_audit_events` so external accountants can review any period closed with open warnings.
3. **Database migration `0078`**:
   - Additive forward-only DDL (`CREATE TABLE IF NOT EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`). Safe to apply via the standard one-shot migrate container before rolling out API/Web containers.
