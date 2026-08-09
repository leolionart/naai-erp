# ERP-856 tests

- `pnpm --filter @naai-erp/web typecheck`: passed.
- Navigation unit test: 2/2 passed, including the direct `/settings/purchase-products` menu entry.
- Desktop Chromium E2E: 1/1 passed. The rendered screen loaded an existing VAT 8% product, created a
  VAT 10% product through POST and deactivated the existing product through the canonical endpoint.
- The in-app Browser connection was attempted first for visual QA but returned `No browser is
available`; the repository Playwright workflow provided rendered interaction coverage instead.
- Local runtime repair: migrated the native database from 40/41 to 41/41 migrations. Direct local API
  readback returned HTTP 200 with an empty purchase-product collection instead of the previous
  missing-table error.
- Production-backed development remains enabled for existing pages; only the purchase-product
  workspace uses the explicit local API override until the new resource is deployed upstream.
- Headless live-local readback loaded `/settings/purchase-products`, rendered the page heading and
  confirmed the empty-state message `Chưa có sản phẩm mua vào`.
