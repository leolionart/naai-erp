# ADR-010: Import Staging Queue and In-place Quick View Editing

- Status: Accepted
- Date: 2026-08-07
- Task: ERP-800
- Rules: BR-MIG-001, BR-MIG-002, BR-MIG-003, BR-MVP-006

## Context

During real-world data onboarding, external workbook rows often contain incomplete master-data mappings, unclassified expense categories, or ambiguous tax treatments. Directly rejecting or forcing automated guesswork would compromise accounting invariants and create audit discrepancies.

Furthermore, requiring users to navigate away from listing workspaces to separate full-page routes for minor corrections creates operational friction.

## Decision

1. **Import Staging Queue**:
   - Every imported workbook row is persisted into an organization-scoped review queue (`workbook_import_review_rows`).
   - Unresolved rows remain safely in staging without creating unverified accounting journals or altering historical posted entries.
   - Users can review, map, and correct staging data via UI/API, which then safely promotes the record through canonical application services.

2. **In-place Quick View Workspace Editing**:
   - Document and expense list workspaces support full in-place editing within a responsive Quick View Dialog.
   - Separate detail page routes (`/documents/[documentId]`, `/expenses/[expenseId]`) are consolidated into the Quick View drawer/modal pattern to streamline daily accounting workflows.

3. **Formatted Currency & Global Period Selectors**:
   - Currency inputs display formatted values with thousand separators and the Vietnamese Dong (`₫`) symbol for user readability, while maintaining exact minor-unit integer precision in application and database layers.
   - Report and dashboard workspaces support quick period shortcuts (MTD, YTD, full year) and respect URL-driven date range parameters.

## Consequences

- Direct database modification is prohibited; all corrections flow through validated domain application services.
- Posted accounting journals remain strictly immutable; edits apply only to draft/staging records or create linked reversal entries when amending posted transactions.
