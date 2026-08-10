# ERP-880 acceptance

## Stable collapsed navigation

PASS. A grouped icon opens through the Radix HoverCard primitive, and pointer movement into the
floating submenu remains visible beyond both the former 150 ms timer and the new 300 ms close delay.

## Shared library component

PASS. `apps/web/src/components/ui/hover-card.tsx` was added through the project's shadcn CLI and is
composed by `AppNavigation`; custom hover state, refs and timers were removed.

## Accessibility

PASS. Group triggers remain named buttons, destinations remain native links in a labelled navigation
landmark, active destinations retain `aria-current`, and Radix opens the HoverCard from pointer or
focus interaction.

## Regression proof

PASS. Unit coverage prevents reintroducing custom timers, and the desktop Playwright flow exercises
collapse, hover, pointer transfer, stable visibility and destination navigation.
