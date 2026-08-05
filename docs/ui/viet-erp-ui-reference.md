# VietERP UI reference audit

## Reference boundary

This audit uses the local checkout `/tmp/viet-erp-reference` at commit
`40970cc8847439ab08e7212ce70915afb38c6140` (`fix: replace RTRobotics logo PNG files with VietERP branded logos`). The repository is MIT licensed at `/tmp/viet-erp-reference/LICENSE`; this document extracts patterns and lessons, not source code.

Primary paths reviewed:

- `apps/CRM/components.json`
- `apps/CRM/tailwind.config.ts`
- `apps/CRM/src/app/globals.css`
- `apps/CRM/src/app/(app)/layout.tsx`
- `apps/CRM/src/components/layout/{Sidebar,Header,PageShell}.tsx`
- `apps/CRM/src/components/ui/`
- `apps/CRM/src/components/ui/virtual-table.tsx`
- `apps/CRM/src/components/contacts/ContactForm.tsx`
- `apps/CRM/src/app/(app)/companies/page.tsx`
- `packages/dashboard/src/components/`
- `packages/dashboard/src/presets/`
- `packages/dashboard/src/types.ts`

## Reusable information architecture

VietERP CRM uses a recognizable operational application hierarchy:

1. A persistent application shell owns global navigation and user actions.
2. A collapsible desktop sidebar becomes an off-canvas mobile sidebar.
3. A compact header owns global search, locale, theme, notifications and user menu.
4. A `PageShell` gives every route a title, optional description and right-aligned actions.
5. A page starts with search/filter controls, then one primary data view, pagination and a clear create/import/export path.
6. Detail and creation routes are separate when the workflow is long; dialogs are reserved for bounded confirmation or editing.

The strongest pattern for NAAI ERP is the separation between global shell, page header and module content. It is more scalable than keeping hero copy, feature cards, API notes and operational tables on every module page.

Recommended NAAI ERP route hierarchy inspired by this structure:

```text
/
  dashboard
  accounting/
    journals
    trial-balance
    general-ledger
    fiscal-periods
  documents/
    sales
    purchases
    credit-notes
  expenses
  evidence
  integrations/
    inbound
    outbound
  settings/
    organization
    accounts
    dimensions
    parties
    projects
```

Keep organization context and permissions global. Keep posting, approval, reversal and replay actions visibly attached to the selected resource rather than burying them in generic navigation.

## Layout conventions worth adapting

### Application shell

`apps/CRM/src/app/(app)/layout.tsx` composes `Sidebar`, `Header` and a single scrolling main region. The useful properties are:

- sidebar and header do not scroll with business content;
- only the main content region owns vertical scrolling;
- desktop collapse and mobile off-canvas behavior share one navigation definition;
- navigation is permission-filtered before rendering;
- collapsed navigation retains labels through tooltips.

For NAAI ERP, use CSS breakpoints as the primary responsive mechanism. JavaScript media queries should be limited to interaction state, not required for first layout paint.

### Page shell

`apps/CRM/src/components/layout/PageShell.tsx` provides a small and reusable contract: title, description, actions and children. Adapt this as a server-compatible component and add:

- breadcrumbs;
- optional status badge;
- compact period/organization context;
- a responsive action area that collapses secondary actions into a menu;
- a slot for warnings such as closed periods, missing evidence or unreconciled data.

### List page

`apps/CRM/src/app/(app)/companies/page.tsx` demonstrates a consistent list flow: permission-aware actions, debounced search, filter select, skeletons, empty state, data cards and pagination. For accounting records, use the same flow but prefer tables over cards because users compare dates, accounts, counterparties and amounts across rows.

### Dashboard composition

`packages/dashboard/src/components/DashboardGrid.tsx` and `packages/dashboard/src/presets/*.ts` separate widget metadata from grid rendering. Preserve this idea:

- a typed widget definition;
- explicit size (`sm`, `md`, `lg`, `xl`);
- named dashboard presets;
- independent refresh policy per widget;
- standard loading, error and empty states.

Do not preserve the implementation's dynamic Tailwind string (`grid-cols-${columns}`), which can be removed by static class extraction. NAAI ERP should use an explicit class map or CSS grid custom property.

## Component inventory

The CRM is configured as shadcn/ui `new-york`, React Server Components enabled, Tailwind CSS variables enabled, neutral base color and Lucide icons in `apps/CRM/components.json`. Its primitives are Radix-based.

Installed shadcn/Radix-style primitives under `apps/CRM/src/components/ui/`:

- Inputs: `input`, `textarea`, `select`, `switch`, `calendar`, `label`, `field-error`.
- Actions and feedback: `button`, `badge`, `toast`, `toaster`, `skeleton`.
- Containers: `card`, `separator`, `scroll-area`.
- Overlays: `dialog`, `sheet`, `popover`, `dropdown-menu`, `tooltip`, `command`.
- Navigation/view switching: `tabs`.
- Identity: `avatar`.
- Data: `table`, `virtual-table`.

Useful composed components:

- `layout/PageShell.tsx`: route title/action contract.
- `command-palette/CommandPalette.tsx`: global resource navigation/search.
- `import/ImportWizard.tsx`: staged file workflow.
- `documents/DocumentPanel.tsx`: evidence/document association.
- `activities/ActivityFeed.tsx`: chronological audit-like view.
- `orders/StatusTimeline.tsx`: lifecycle visualization.
- `analytics/AnalyticsKPICards.tsx` and dashboard charts.

Recommended initial NAAI ERP component set if shadcn is adopted:

- `button`, `badge`, `card`, `table`, `input`, `select`, `textarea`, `checkbox`;
- `field`, `field-group`, `field-set` for accessible forms;
- `dialog`, `alert-dialog`, `sheet`, `dropdown-menu`, `tooltip`;
- `tabs`, `breadcrumb`, `sidebar`, `pagination`, `scroll-area`;
- `alert`, `empty`, `skeleton`, `spinner`, `sonner`;
- `command` for global search;
- chart wrapper only when management dashboards begin.

Use installed source components rather than wrapping every primitive immediately. Build NAAI-specific compositions such as `MoneyCell`, `DocumentStateBadge`, `PeriodLockAlert`, `ApprovalActions` and `FinancialDataTable` above the primitives.

## Tokens and visual language

`apps/CRM/src/app/globals.css` contains two layers of tokens:

- standard shadcn semantic HSL tokens (`background`, `foreground`, `card`, `primary`, `muted`, `destructive`, `border`, `ring`, chart colors);
- CRM-specific page/card/sidebar/text/border and glass-effect tokens.

The reusable lesson is semantic token ownership, not the exact colors. NAAI ERP should keep one semantic layer and avoid maintaining parallel names for the same concepts.

Good token groups:

- surfaces: background, surface, elevated, overlay;
- text: foreground, muted foreground, subtle foreground;
- borders and focus ring;
- actions: primary, secondary, destructive;
- financial states: positive, negative, warning, informational, neutral;
- workflow states: draft, review, approved, posted, reversed, quarantined, dead-letter;
- charts: five accessible categorical colors;
- spacing, radius and shadow primitives.

Use tabular numerals for money, quantities and dates. Positive/negative colors must not be the only carrier of meaning; include sign, label or icon. Debit and credit should use stable column placement rather than decorative colors.

## Table conventions

The generic `packages/dashboard/src/components/DataTable.tsx` provides filtering, sorting and pagination. `apps/CRM/src/components/ui/virtual-table.tsx` provides virtualization for large data sets. Reuse the concepts but not these implementations unchanged.

NAAI ERP tables should define:

- stable column IDs and server-compatible sort/filter parameters;
- right-aligned money and numeric columns with tabular numerals;
- sticky header and optional sticky totals row;
- selected-row state exposed with `aria-selected`;
- keyboard-focusable rows only when the row itself performs an action;
- a visible primary link in the first column rather than click-only `<tr>` or `<div>` rows;
- column visibility and density controls for accounting users;
- pagination from API totals; virtualization only after measured need;
- explicit loading, empty, error and stale-data states;
- drill-down from totals to journal line and source document.

For Trial Balance and General Ledger, never sort formatted money strings. Sort exact minor-unit values or server results. Do not recompute accounting totals in the browser.

## Form conventions

`apps/CRM/src/components/contacts/ContactForm.tsx` shows schema-based validation, reusable fields and grouped inputs. Retain schema validation and immediate field-error clearing. Improve the composition when adopting current shadcn:

- use `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription` and `FieldError`;
- set `data-invalid` on the field and `aria-invalid` on the control;
- use `FieldSet`/`FieldLegend` for tax, evidence and allocation groups;
- keep one-column flow on narrow screens and two columns only where fields are naturally paired;
- never require JSON for a primary business flow;
- show calculated gross, VAT and allocation totals read-only and update them with exact decimal/minor-unit logic;
- keep save draft distinct from approve/post;
- require a reason in confirmation dialogs for privileged lifecycle actions;
- preserve server error codes and map them to the relevant field or workflow alert.

Long invoice/expense forms should use sections or a stepper: identity and dates, lines, allocations/tax, evidence, review summary. Avoid placing every field in one undifferentiated card.

## Dialog and action conventions

`apps/CRM/src/components/ui/dialog.tsx` is a standard Radix Dialog implementation with overlay, content, close control, title and description primitives. For NAAI ERP:

- every Dialog, Sheet and Drawer must contain an accessible title;
- destructive or irreversible-looking actions use `AlertDialog`;
- approve, post, reverse, reopen and replay require explicit reason and show the financial/resource consequence;
- dialogs do not contain entire multi-line invoice forms; use dedicated routes or wide sheets;
- focus returns to the trigger after close;
- loading disables duplicate submission and shows a spinner;
- success/failure feedback uses a toast plus persistent inline state where the user must act.

## Accessibility and responsive requirements

- Meet WCAG 2.2 AA contrast for text, focus and statuses.
- Preserve visible focus; do not replace outlines with color-only hover states.
- All icon-only actions need an accessible name and tooltip.
- Sidebar collapse, mobile menu and dialogs must be keyboard operable and focus-managed.
- Status, trend, VAT eligibility and positive/negative values need text in addition to color.
- Table headers expose sorting state with `aria-sort`.
- Errors are linked with `aria-describedby`; global errors use an alert region.
- Announce async save/load results with an `aria-live` region.
- At widths below 768px, navigation becomes a Sheet; toolbars wrap; tables scroll horizontally; forms become one column; secondary actions move to an overflow menu.
- Do not hide critical financial columns on mobile without an explicit detail path.
- Respect reduced motion. Avoid backdrop blur and hover lifts as prerequisites for understanding state.

## What not to copy

1. Do not copy the exact emerald CRM identity or `RTR-CRM` branding. NAAI ERP needs its own restrained financial identity.
2. Do not copy the parallel shadcn and `--crm-*` token systems wholesale; they duplicate semantic responsibilities.
3. Do not copy pervasive glassmorphism, blur and glow. They increase rendering cost and reduce clarity in dense accounting screens.
4. Do not copy hard-coded Tailwind colors such as `#10B981`, `gray-*`, `red-*` into business components. Use semantic tokens and component variants.
5. Do not copy bilingual labels concatenated with `|`. Use the existing Vietnamese-first product language and an actual localization layer if English is added.
6. Do not copy remote Google Font imports from `globals.css`; self-host fonts or use the system stack for privacy, reliability and performance.
7. Do not copy `window.location.href` navigation from `packages/dashboard/src/components/KPICard.tsx`; use Next navigation/links.
8. Do not copy eager Recharts imports from `ChartWidget.tsx`; dynamically load chart code only on dashboard routes.
9. Do not copy client-side sorting/filtering for unbounded financial tables. Use server pagination and query parameters.
10. Do not copy clickable non-semantic virtual rows without keyboard handling.
11. Do not copy JavaScript-only mobile layout detection as the base layout mechanism.
12. Do not copy exact source files without preserving the MIT notice where legally required. Prefer clean-room reimplementation from documented behavior and current shadcn sources.

## Staged migration plan

### Stage 0 — Freeze contracts

- Inventory existing NAAI ERP page/module states and screenshot current workflows.
- Preserve REST contracts and exact accounting behavior.
- Add UI smoke tests for navigation, create draft, review, approve/post and error display.

### Stage 1 — Foundations

- Introduce semantic tokens, typography, focus rules and spacing conventions.
- Add a utility for class composition and a minimal shadcn/Radix set.
- Build `AppShell`, `PageShell`, `PageHeader`, status badges and feedback primitives.
- Keep existing workspaces functional inside the new shell.

### Stage 2 — Navigation and module routes

- Replace query-string module switching with route-based module pages.
- Add responsive Sidebar/Sheet, breadcrumbs and organization context.
- Keep server layouts static; isolate token storage and interactive controls into small client islands.

### Stage 3 — Data views

- Replace generic tables with typed `FinancialDataTable` compositions.
- Move filtering, sorting and pagination into API queries.
- Add exact money cells, totals, lifecycle badges, empty/skeleton/error states and keyboard navigation.

### Stage 4 — Forms and workflows

- Migrate documents, expenses and evidence into accessible typed forms.
- Add line/allocation editors without JSON, validation summaries and privileged-action dialogs.
- Preserve reason, maker-checker, organization, period-lock and idempotency controls.

### Stage 5 — Dashboards

- Adopt the typed widget/preset idea from `packages/dashboard`, but define NAAI metrics from report APIs.
- Dynamically load charts and parallelize independent server requests.
- Add data-confidence and drill-down indicators to every KPI.

### Stage 6 — Verification and removal

- Test keyboard, screen reader, responsive widths and reduced motion.
- Compare UI/API output against golden fixtures.
- Remove legacy shell/classes only after route-by-route parity.
- Record third-party component versions and license notices.
