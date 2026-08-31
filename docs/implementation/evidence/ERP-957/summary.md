# NAAI ERP brand assets

Added a shared NAAI mark/wordmark for the authenticated app shell and login page. The App Router
favicon now uses the same indigo/lime mark, and explicit metadata icon declarations keep browser
and installed-app chrome consistent.

Files changed:

- `apps/web/src/components/brand/naai-logo.tsx`
- `apps/web/src/components/brand/naai-logo.test.tsx`
- `apps/web/src/components/layout/app-navigation.tsx`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/icon.svg`
- `apps/web/public/naai-mark.svg`
- `apps/web/public/naai-logo.svg`

The logo is presentation-only: no accounting, API, authentication or organization behavior changes.
