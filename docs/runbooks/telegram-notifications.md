# Telegram notifications for revenue and expenses

Telegram alerts are configured **inside the app** — no environment variables are needed beyond the
`SESSION_SECRET` the API and worker already share.

## Setup

1. In Telegram, create a bot with `@BotFather` and copy the bot token.
2. Add the bot to the group/channel that should receive alerts (channels: make the bot an admin) and note the Chat ID (`-100…`, or `@channelname`). For groups with Topics, also note the topic (thread) ID.
3. Open **Cấu hình & Vận hành → Thông báo Telegram** (`/settings/telegram`), paste the token and Chat ID, tick **Bật thông báo Telegram**, choose revenue and/or expense, then **Lưu cấu hình**.
4. Press **Gửi tin nhắn thử** to confirm the bot can post to the chat.

The same settings are available through REST and the CLI:

```text
GET   /api/v1/organizations/{organizationId}/telegram-settings
PATCH /api/v1/organizations/{organizationId}/telegram-settings   {"botToken","chatId","threadId","enabled","notifyRevenue","notifyExpense"}
POST  /api/v1/organizations/{organizationId}/telegram-settings/test

naai-erp telegram-settings get
naai-erp telegram-settings update --data '{"botToken":"…","chatId":"-100…","enabled":true}'
naai-erp telegram-settings test
```

Only `owner` and `finance_admin` can change settings or send the test message; reads never return the token (only `hasBotToken` and a 4-character hint). Omitted fields keep their saved value, so the token only needs to be sent once.

## Behaviour

- A message is sent for each posted journal with revenue (net credit on `5xx`/`7xx`) or expense (net debit on `6xx`/`8xx`), from invoices, expenses and manual journals. Reversal journals and entries without revenue/expense effect are skipped.
- Settings are per organization. Only journals posted **after** the notification was enabled are sent, so enabling never replays history.
- Delivery is by the worker from the `telegram_notifications` queue (one row per outbox event, so no duplicates). Transient failures retry with exponential backoff (30 s → 1 h, 5 attempts), then become `failed`; posting is never blocked.

## Security

The bot token is encrypted with AES-256-GCM using a key derived from `SESSION_SECRET` and stored in `telegram_settings`; it is never returned by the API, logged or written to audit events. **Rotating `SESSION_SECRET` makes the stored token undecryptable — re-enter the token afterwards.** The worker container therefore needs the same `SESSION_SECRET` as the API (already wired in `compose.yaml`).

## Drafts created through the API / n8n

Records that n8n or the API create as **drafts** are not in the ledger yet, so they have no journal.
With **Cả bản nháp** enabled (default) each such record sends a "bản nháp, chưa ghi sổ" message; when it is
posted later the normal "ghi nhận" message follows. Turn the option off to be notified only on posting.

## Troubleshooting: no Telegram message arrives

Open `/settings/telegram` and read **Tình trạng gửi**:

| Symptom                                                                        | Likely cause                                                                                                                                    | Fix                                                                       |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Test message fails                                                             | Wrong token/Chat ID, bot not in the chat                                                                                                        | Fix settings; add the bot (as admin for channels)                         |
| Test works, "Chưa có thông báo nào được gửi"                                   | Worker not running, or running without `SESSION_SECRET` (cannot decrypt the token)                                                              | Give the `worker` the same `SESSION_SECRET` as the API and restart it     |
| `lỗi` count grows, last error "Telegram settings or bot token are unavailable" | Same as above, or `SESSION_SECRET` was rotated                                                                                                  | Fix the secret / re-enter the token                                       |
| Nothing sent but invoice exists                                                | Notification disabled before the record was created (only records after enabling are sent), or the record is a draft and **Cả bản nháp** is off | Enable it / post the draft                                                |
| Page errors with `relation "telegram_settings" does not exist`                 | Migrations not applied                                                                                                                          | Update to an API image with startup migrations (ERP-967) or run `migrate` |

Useful read-only queries:

```sql
select state, count(*) from telegram_notifications group by state;
select outbox_event_id, state, attempts, last_error from telegram_notifications order by created_at desc limit 20;
select id, event_type, external_id, state, last_error_code, last_error_summary
  from inbound_messages order by received_at desc limit 20;
```

## Finding records pushed by n8n

Webhook receipts are listed in **Nhật ký hoạt động** (filter source "Webhook / n8n nhận vào"). A
`quarantined` row means the payload was received but **no record was created** (the error code says why,
e.g. validation failed or the event type is not allowed for that source); fix the payload and resend.
