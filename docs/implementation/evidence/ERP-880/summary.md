# ERP-880 summary

## Outcome

Collapsed desktop sidebar groups now use the shared shadcn/Radix `HoverCard` primitive. Its pointer
grace area keeps the submenu open while the pointer crosses from the icon trigger into the floating
navigation panel, replacing the custom timer-driven hover state that caused repeated flicker.

## Files changed

- `apps/web/src/components/layout/app-navigation.tsx`
- `apps/web/src/components/ui/hover-card.tsx`
- `apps/web/src/components/layout/app-navigation.test.tsx`
- `apps/web/e2e/admin-navigation.spec.ts`
- Product rule, test specification, catalog and task ledger documentation for ERP-880.

## Decisions

- Use `HoverCard` because the collapsed group remains hover/focus discoverable and its Radix pointer
  grace area owns trigger-to-content movement.
- Keep destinations as normal links inside a labelled `nav` landmark rather than applying menu roles
  without menu-style arrow-key behavior.
- Expanded and mobile sidebar behavior remains on the existing `Collapsible` composition.
