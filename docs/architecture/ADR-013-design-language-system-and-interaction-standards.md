# ADR-013: Design Language System (DLS) and Interaction Standards

- Status: Accepted
- Date: 2026-11-28
- Task: ERP-1012
- Rules: BR-UI-004, BR-UI-007, BR-UI-008

## Context

As operational and administrative modules grew across NAAI ERP, individual screens drifted in layout width, form controls, color tokens, and interaction patterns:

- Settings screens mixed narrow ad-hoc containers (`max-w-2xl`), raw browser `<input type="checkbox">` controls, and uncontained bottom buttons instead of structured cards and footers.
- Dedicated configuration routes still hid primary connection credentials and REST/n8n endpoint guides behind header popup triggers instead of rendering them directly inside the screen layout.
- Legacy administrative workspaces used blocking browser `window.prompt` / `window.confirm` dialogs or hardcoded dark-slate terminal colors that ignored light/dark theme tokens.

Without an explicit Architecture Decision Record, a canonical DLS specification, and an automated unit-test gate, visual and interaction drift required manual review reminders on every UI change.

## Decision

1. **Full-Width Structured Workspace Grid inside `ModulePage`**:
   - Every route under `(app)` renders through `ModulePage` (or `PageHeader`) and uses full-width responsive grids (`grid gap-4` / `lg:grid-cols-2` / `xl:grid-cols-4` KPI strips) rather than narrow `max-w-xl` / `max-w-2xl` wrappers on root workspaces.
   - Dedicated configuration screens (such as `/settings/automation` and `/settings/telegram`) render their primary status summaries, credentials, forms, and API references directly inline in structured `Card` sections rather than hiding screen-level content behind header popups.

2. **Shared Accessible UI Primitives Only**:
   - Interactive controls in workspaces and feature components must use `@/components/ui/*` (`Input`, `Textarea`, `Select`, `Switch`, `Checkbox`, `Button`, `Field`, `FieldLabel`, `Collapsible`, `Dialog`, `AlertDialog`, `Table`, `Badge`, `Alert`).
   - Raw `<input>` (except `type="hidden"` or file-upload wiring), `<select>`, `<textarea>`, and blocking `window.confirm` / `window.prompt` / `window.alert` calls are prohibited outside `apps/web/src/components/ui/`.

3. **Semantic Theme Tokens and Contained Form Actions**:
   - Surfaces, borders, text, and badges use semantic CSS variables (`bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `text-destructive`, `bg-primary`) so light and dark modes stay consistent without raw `slate-*` / `red-*` / `emerald-*` page overrides.
   - Form mutations place submit and secondary actions inside `CardFooter` or `DialogFooter`, disable controls while busy or clean (`!dirty`), surface inline errors via `Alert`, and emit `sonner` toast feedback on completion.

4. **Automated CI Enforcement (`T-UNIT-ERP-1012-001`)**:
   - `apps/web/src/components/dls-compliance.test.ts` scans application workspaces, pages, and feature components on every `pnpm test` / `pnpm check` run and fails the build if raw HTML form controls, browser modal prompts, root narrow-width caps, or raw slate terminal palettes are introduced.

## Consequences

- UI consistency is enforced automatically during `pnpm check` and pre-commit hooks alongside `BR-SIZE-001`.
- New settings, operational, and financial screens share predictable layout hierarchy, keyboard accessibility, and theme parity without ad-hoc per-screen CSS.
