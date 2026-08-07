# ADR-010: In-place Quick View Workspace Editing and Financial Controls

- Status: Accepted
- Date: 2026-08-07
- Task: ERP-800
- Rules: BR-MVP-003, BR-MVP-006

## Context

Financial users require streamlined document management and data verification. Navigating away from listing workspaces to separate full-page detail routes created operational friction and broke context when reviewing invoices and expenses.

In addition, financial reporting requires clear period filtering and precise money formatting across input controls.

## Decision

1. **In-place Quick View Workspace Editing**:
   - Document and expense list workspaces support full in-place editing and accounting lifecycle actions within a responsive Quick View Dialog.
   - Separate detail page routes (`/documents/[documentId]`, `/expenses/[expenseId]`) are consolidated into the Quick View modal/drawer pattern to streamline workflows without full-page reloads.

2. **Formatted Currency Inputs**:
   - Money and currency input fields across forms display formatted values with thousand separators and the Vietnamese Dong (`₫`) symbol for readability, while parsing cleanly to exact integer minor units in database and API layers.

3. **Global Period & Date Range Selectors**:
   - Report and dashboard workspaces support quick period selectors (MTD, YTD, full year) and respect URL-driven date range parameters for consistent financial viewports.

## Consequences

- Direct database modification is prohibited; all updates flow through canonical application REST endpoints.
- Posted accounting journals remain strictly immutable; edits apply only to draft records or generate linked reversal/replacement entries when amending posted transactions.
