# Responsive layout contract

All current and future NAAI ERP screens must remain usable without document-level horizontal
scrolling at 390 px, 768 px, 1024 px and desktop widths.

## Shared invariants

- Build pages inside `PageShell` and `ModulePage`; do not create a second application shell.
- Flex and grid children that contain cards, tables, long Vietnamese text, UUIDs or money use
  `min-w-0`. Shared `SidebarInset`, `ModulePage`, `Card`, `CardHeader` and `CardContent` enforce this.
- Page headers use content-driven minimum height and wrap breadcrumbs, statuses and actions.
- Toolbars wrap. Primary actions may become full width on mobile and return to intrinsic width from
  the `sm` breakpoint.
- Tables may be wider than their card, but horizontal scrolling belongs to `table-container`; the
  document itself must never become wider than the viewport.
- Mobile layouts use one column by default. Add columns progressively with `sm`, `md`, `lg` or `xl`
  only when their content fits at that breakpoint.
- Feature screens show only metadata needed for the current decision. Detailed accounting and tax
  labels belong on their canonical detail/report screen, linked from the summary screen.

## Verification

For a changed screen, verify desktop and 390 px mobile with all of these assertions:

1. `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`.
2. Primary buttons and inputs remain fully inside the viewport.
3. Any wide table has a `table-container` whose own `scrollWidth` may exceed its `clientWidth`.
4. There is no framework overlay and no relevant console error.
5. Long names, UUIDs, badges and exact money do not expand the page shell.

Shared primitive tests are blocking. Route-level browser checks should use the same document-width
assertion so a new navigation destination cannot silently reintroduce page overflow.
