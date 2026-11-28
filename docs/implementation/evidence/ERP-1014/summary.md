# ERP-1014 Summary — Suppress Resolved Historical Telegram Worker Errors

## Outcome

Fixed false-positive active worker error alerts on `/settings/telegram` when historical `telegram_notifications` failures occurred earlier in the 7-day window and Telegram notifications subsequently recovered.

## Root Cause

1. `PgTelegramSettingsStore.delivery()` previously queried `select last_error from telegram_notifications where organization_id = $1 and last_error is not null order by created_at desc limit 1` without checking `state`, age, `max(sent_at)` or `telegram_settings.updated_at`. On production (`naai`), 11 startup failures on `2026-11-26` (`Telegram settings or bot token are unavailable`) remained returned forever as `delivery.lastError` despite 372 consecutive successful deliveries through `2026-11-28`.
2. `TelegramSettingsWorkspace` rendered a destructive banner whenever `lastError` was present and also marked the 7-day failure KPI card `Có lỗi` (`destructive`) with `"Xem chi tiết lỗi bên dưới"` whenever `failed > 0`, even after recovery.
3. Successful test sends (`POST /telegram-settings/test`) did not acknowledge connection recovery, and `PATCH /telegram-settings` omitted `delivery` from its response.

## Changes

- `apps/api/src/telegram-settings/pg-telegram-settings.store.ts`:
  - Added `buildTelegramDeliveryStats()` and updated `delivery()` to inspect only recent (`7 days`) `failed`/`pending` rows with `last_error is not null`, computing `error_at = least(now(), greatest(created_at, next_attempt_at - interval '5 minutes'))` and clearing `lastError` to `null` whenever `lastSentAt >= errorAt` or `settingsUpdatedAt > errorAt`.
  - Returned live `delivery` stats from `upsert()` and added `acknowledgeTestSuccess()` to refresh `telegram_settings.updated_at` when `POST /telegram-settings/test` succeeds.
- `apps/api/src/telegram-settings/telegram-settings.service.ts` & `telegram-settings.types.ts`:
  - Invoked `store.acknowledgeTestSuccess?.(context.organizationId)` when `sendTest()` receives HTTP `2xx` from Telegram.
- `apps/web/src/app/workspaces/telegram-settings-workspace.tsx`:
  - Added `describeTelegramFailureState()` separating active unresolved worker errors (`Cần kiểm tra`, `destructive` badge + banner) from resolved 7-day historical counts (`Đã phục hồi`, `secondary` badge, no error banner) and zero-failure state (`Ổn định`).
  - Cleared local `saved.delivery.lastError` immediately upon a successful test send.
- Documentation & Tests:
  - Updated `BR-NOTIFY-004` in `docs/product/business-rules.md`, `docs/runbooks/telegram-notifications.md`, `docs/testing/test-specification.md`, and `docs/testing/test-catalog.yaml` (`T-UNIT-ERP-1014-001`, `T-INT-ERP-1014-002`).
