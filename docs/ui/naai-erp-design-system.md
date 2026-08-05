# NAAI ERP design system direction

## Purpose

This document defines a target UI system for NAAI ERP. It is informed by the VietERP reference checkout at commit `40970cc8847439ab08e7212ce70915afb38c6140`, especially `apps/CRM` and `packages/dashboard`, but is adapted for a Vietnamese management-accounting product.

The current NAAI ERP web application uses Next.js App Router with handcrafted CSS and client workspaces:

- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/styles.css`
- `apps/web/src/app/module-workspace.tsx`
- `apps/web/src/app/workspaces/`

There is currently no `components.json`, Tailwind configuration or shared component package in `apps/web`. Adoption of shadcn/Radix is therefore a planned migration, not an assumption about the present codebase.

## Product principles

1. Financial clarity before decoration.
2. Exact values and lifecycle consequences are always visible.
3. Vietnamese is the primary interface language; English is reserved for stable technical/accounting terms where helpful.
4. Every privileged action explains what will change and requires the same authorization as REST/CLI.
5. UI aggregates never invent formulas or bypass report APIs.
6. Draft, approved, posted, reversed, quarantined and dead-letter states are unmistakable without relying on color alone.
7. Dense desktop workflows remain usable, while mobile supports review and urgent actions rather than pretending to be a full spreadsheet.

## Target architecture

```text
apps/web/src/
  app/
    (app)/
      layout.tsx
      dashboard/page.tsx
      accounting/...
      documents/...
      expenses/...
      evidence/...
      integrations/...
  components/
    ui/                 # installed shadcn source components
    layout/             # AppShell, PageShell, PageHeader
    financial/          # MoneyCell, JournalStateBadge, FinancialDataTable
    workflows/          # ApprovalActions, ReasonDialog, EvidenceChecklist
  lib/
    api/                # typed REST client, server/client entry points
    format/             # exact money/date/status display
    navigation.ts       # typed permission-aware navigation definition
```

Prefer Server Components for route layout, headings and initial reads. Add `"use client"` only to forms, filters, dialogs and live interactions. Start independent server reads in parallel and avoid page-level client components that serialize large datasets.

## Shell and navigation

### Desktop

- Fixed/collapsible sidebar, 240 px expanded and approximately 64 px collapsed.
- Compact top bar for breadcrumbs, organization, current fiscal period, search and user actions.
- Main content owns scrolling; sidebar/header remain stable.
- Navigation groups: Tổng quan, Kế toán, Chứng từ, Vận hành, Tích hợp, Thiết lập.
- Hide unauthorized routes rather than rendering disabled privileged actions.

### Mobile

- Sidebar becomes an accessible Sheet opened from the header.
- Page title and primary action remain visible.
- Secondary actions move to a DropdownMenu.
- Tables scroll horizontally and expose a detail route; critical amounts and state stay visible.

### Page shell contract

```ts
type PageShellProps = {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  status?: ReactNode;
  actions?: ReactNode;
  alert?: ReactNode;
  children: ReactNode;
};
```

The alert slot carries closed-period warnings, incomplete evidence, quarantine reasons or report-confidence issues. API/CLI documentation belongs in developer documentation, not as repeated primary content on each operational page.

## Semantic tokens

Use CSS variables compatible with shadcn semantic classes. Do not introduce feature-specific raw colors in component files.

### Core surfaces and text

| Token                            | Meaning                         |
| -------------------------------- | ------------------------------- |
| `--background`                   | application canvas              |
| `--foreground`                   | primary readable text           |
| `--card` / `--card-foreground`   | panels and cards                |
| `--muted` / `--muted-foreground` | secondary surfaces/text         |
| `--border` / `--input`           | structural and form boundaries  |
| `--ring`                         | keyboard focus                  |
| `--primary`                      | primary create/save action      |
| `--destructive`                  | destructive or high-risk action |

### Financial and workflow roles

Add semantic roles expressed as text/background/border triples:

- positive and negative;
- warning and informational;
- draft, review, approved, posted, reversed;
- eligible, partially eligible, ineligible, unreviewed;
- quarantined, retry scheduled, dead-letter;
- period open, soft locked, hard locked.

Colors are supplemental. Every badge includes a localized text label and, where useful, an icon. Ensure AA contrast in light and dark themes.

### Typography

- UI: self-hosted Inter or system sans.
- Money and identifiers: inherit UI font with `font-variant-numeric: tabular-nums`.
- Code, hashes and webhook IDs: system monospace.
- Page title: 24–28 px; section title: 16–18 px; body: 14 px; table/help text: 12–13 px.
- Avoid uppercase paragraphs. Short uppercase eyebrow labels are allowed only for compact metadata.

### Shape and spacing

- Base radius: 6–8 px, not pill-shaped by default.
- Spacing scale: 4, 8, 12, 16, 24, 32 px.
- Cards use borders before shadows. Reserve stronger shadow for overlays.
- Avoid glass blur and glow in dense accounting views.

## Component standards

### Buttons

- Primary: one per local decision area.
- Secondary/outline: reversible or supporting action.
- Ghost: low-priority toolbar action.
- Destructive: cancel/delete-like action only.
- Privileged accounting actions use explicit labels: “Duyệt”, “Ghi sổ”, “Đảo bút toán”, “Mở lại kỳ”; never a generic “Xử lý”.
- Loading buttons are disabled and compose a Spinner with visible text.
- Icon-only buttons require an accessible name and Tooltip.

### Badges

Use Badge variants for states. Centralize mapping from domain enum to Vietnamese label, icon and semantic variant. Unknown states render a neutral badge with the raw safe value; they must not silently appear as successful.

### Cards and KPI widgets

Use full Card composition: header, title, description, content and optional footer. A financial KPI must include:

- metric name and period;
- formatted value and accounting basis;
- comparison label, not just an arrow;
- data-confidence or freshness state;
- drill-down target;
- loading/error/empty behavior.

Borrow the typed widget/preset concept from VietERP `packages/dashboard/src/types.ts` and `packages/dashboard/src/presets/`, not its hard-coded colors or eager chart imports.

### Tables

Create a typed `FinancialDataTable` composition over shadcn Table and API pagination.

- First column contains a real link or button.
- Money is right-aligned and tabular.
- Debit and credit have separate stable columns.
- Headers remain visible in long ledgers.
- Sort buttons expose `aria-sort`.
- Row selection uses checkboxes with accessible labels.
- Filters are reflected in URL search params.
- Totals come from the report API and remain visible when pages change.
- Loading uses Skeleton rows; empty uses Empty; failure uses Alert.
- Large General Ledger data uses server pagination first. Virtualize only after measurement.

### Forms

Use shadcn `FieldGroup` and `Field`. Related controls use `FieldSet` and `FieldLegend`.

Standard form hierarchy:

1. document identity and dates;
2. counterparty and payment terms;
3. line editor;
4. project/dimension allocation;
5. tax and evidence review;
6. calculated control totals;
7. draft save action.

Rules:

- one column by default, two columns for paired short fields at `md` and above;
- labels remain visible; placeholders are examples, not labels;
- calculated totals are read-only and formatted without losing exact input;
- allocation sum and debit/credit balance are shown continuously;
- validation is both client-friendly and server-authoritative;
- `aria-invalid` and linked descriptions/errors are mandatory;
- save draft is separated from approve/post;
- never ask users to enter dimensions or line items as JSON.

### Dialog, Sheet and AlertDialog

- Dialog: bounded edit or confirmation.
- Sheet: resource detail, filters or moderately complex review.
- AlertDialog: destructive/high-risk confirmation.
- Dedicated page: invoice, expense, journal and multi-line allocation editing.

All overlays require a title. Privileged actions show resource, amount, current/next state, period impact and reason field. Reversal also shows the linked correction behavior. Focus is trapped and restored.

### Feedback

- Toast: transient success confirmation.
- Alert: persistent warning/error requiring attention.
- Inline field error: input-specific validation.
- `aria-live`: async load/save status.
- Never expose raw stack traces, secrets, signed URLs or evidence contents in feedback.

## Page conventions

### Workflow routing

- A list/module page owns discovery, filters, compact summaries and entry actions; it must not become a single-page container for every workflow state.
- Multi-step financial work, allocation editors, reconciliation, journal review and drill-down use dedicated detail routes with stable URLs.
- Dialog handles a short bounded form; Sheet handles contextual review or filters; AlertDialog handles destructive/privileged confirmation with reason.
- Every backend module exposed as usable must be linked from the permission-aware navigation or from a visible parent-module workflow.
- New task evidence and E2E tests must prove both route reachability and the primary modal/sheet/detail-page interaction.

### List page

1. Breadcrumb/title/status and primary action.
2. Optional financial/workflow alert.
3. Search, filters, saved view/density controls.
4. Table.
5. Pagination and totals.

### Detail page

1. Identifier, state and lifecycle actions.
2. Key totals and dates.
3. Tabs: Tổng quan, Dòng chi tiết, Bút toán, Chứng từ, Lịch sử.
4. Every financial total drills down to source lines.

### Dashboard

1. Period and comparison controls.
2. Data-confidence Alert.
3. KPI grid.
4. Trend and cash/forecast charts.
5. Exceptions requiring action.

Charts are dynamically imported on dashboard routes. Non-chart content renders first. Independent report requests run in parallel.

## Accessibility baseline

- WCAG 2.2 AA.
- Logical heading hierarchy and landmark regions.
- Skip link to main content.
- Keyboard-operable navigation, tables, menus and dialogs.
- Visible focus with semantic ring token.
- No click-only `<div>` rows.
- `aria-current` for navigation and breadcrumbs.
- `aria-sort`, `aria-selected`, `aria-invalid`, `aria-describedby` where applicable.
- Status and financial sign communicated in text, not color only.
- Touch targets at least 44 px on mobile for primary controls.
- Respect `prefers-reduced-motion` and avoid essential hover interactions.

## Responsive baseline

| Width        | Behavior                                                                   |
| ------------ | -------------------------------------------------------------------------- |
| `<640px`     | single-column forms, Sheet navigation, horizontal tables, overflow actions |
| `640–1023px` | compact two-column fields/cards, collapsible sidebar                       |
| `>=1024px`   | persistent sidebar, full toolbars and dense financial tables               |

Do not hide accounting meaning to make a table fit. Use horizontal scroll, sticky identifier columns or detail routes.

## Migration sequence

1. Add screenshot and interaction smoke tests around current `apps/web` flows.
2. Decide and record shadcn preset/base, Tailwind version, icon library and aliases before initialization.
3. Add semantic tokens and minimal primitives; do not install all components.
4. Introduce server-compatible AppShell/PageShell and route-based navigation while embedding current workspaces.
5. Migrate tables and state badges.
6. Migrate forms and privileged action dialogs module by module.
7. Add dashboards only after report APIs and metric definitions are stable.
8. Remove legacy classes/components after parity, accessibility and responsive review.

At every stage, keep REST/OpenAPI as the canonical interface. The UI must not directly access PostgreSQL or reproduce accounting logic that belongs to domain/report services.
