# ERP-1014 Acceptance Evidence

1. **Historical worker failures do not raise false active error alerts after recovery (`BR-NOTIFY-004`)**:
   - Proven by `T-UNIT-ERP-1014-001` (`buildTelegramDeliveryStats` with `sent: 372, failed: 11, lastSentAt > candidateErrorAt` -> `lastError: null`; `describeTelegramFailureState` -> `badge: ["Đã phục hồi", "secondary"]`, `activeError: null`) and `T-INT-ERP-1014-002` against PostgreSQL (`pg-telegram-settings.integration.test.ts`).
2. **Genuine unresolved worker failures remain immediately visible (`BR-NOTIFY-004`)**:
   - Proven by `T-UNIT-ERP-1014-001` and `T-INT-ERP-1014-002`: when a notification fails after the latest `sent_at` and `telegram_settings.updated_at`, `delivery.lastError` surfaces the redacted error and UI displays `Cần kiểm tra` (`destructive`) with the troubleshooting banner.
3. **Settings save and "Gửi tin nhắn thử" verification clear superseded errors**:
   - Proven by `TelegramSettingsService.sendTest` calling `acknowledgeTestSuccess` on `2xx`, `PgTelegramSettingsStore.upsert` returning refreshed `delivery` stats, and PostgreSQL integration test assertions.
4. **DLS & Code Size Compliance (`BR-UI-008`, `BR-SIZE-001`)**:
   - Verified by `dls-compliance.test.ts` and `pnpm check:file-size`.
