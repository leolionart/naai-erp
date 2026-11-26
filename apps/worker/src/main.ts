import { randomUUID } from "node:crypto";
import { createHeartbeat } from "./heartbeat.js";
import { OutboundDeliveryRunner } from "./outbound-delivery.js";
import { PgOutboundDeliveryStore } from "./pg-outbound-delivery-store.js";
import pg from "pg";
import { PgTelegramNotificationStore, TelegramNotifier } from "./telegram-notifier.js";

const heartbeatIntervalMs = Number.parseInt(
  process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? "30000",
  10,
);
const deliveryPollIntervalMs = Number.parseInt(
  process.env.OUTBOUND_DELIVERY_POLL_INTERVAL_MS ?? "5000",
  10,
);
const deliveryBatchSize = Number.parseInt(process.env.OUTBOUND_DELIVERY_BATCH_SIZE ?? "20", 10);
const workerId = process.env.WORKER_ID ?? `worker-${randomUUID()}`;
const configuredPurgeInterval = Number.parseInt(
  process.env.OPERATIONAL_LOG_PURGE_INTERVAL_MS ?? "3600000",
  10,
);
const operationalLogPurgeIntervalMs =
  Number.isInteger(configuredPurgeInterval) && configuredPurgeInterval >= 60_000
    ? configuredPurgeInterval
    : 3_600_000;

function reportHeartbeat(): void {
  process.stdout.write(`${JSON.stringify(createHeartbeat())}\n`);
}

reportHeartbeat();
const heartbeatTimer = setInterval(reportHeartbeat, heartbeatIntervalMs);
const deliveryStore = process.env.DATABASE_URL ? new PgOutboundDeliveryStore() : undefined;
const deliveryRunner = deliveryStore
  ? new OutboundDeliveryRunner(
      deliveryStore,
      fetch,
      (secretRef) => process.env[secretRef],
      workerId,
    )
  : undefined;
let deliveryRunning = false;

async function pollOutboundDeliveries() {
  if (!deliveryRunner || deliveryRunning) return;
  deliveryRunning = true;
  try {
    const result = await deliveryRunner.runBatch(deliveryBatchSize);
    if (result.leased || result.materialized || result.released) {
      process.stdout.write(
        `${JSON.stringify({ service: "worker", operation: "outbound_delivery", workerId, ...result })}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ service: "worker", operation: "outbound_delivery", workerId, error: error instanceof Error ? error.message : "unknown" })}\n`,
    );
  } finally {
    deliveryRunning = false;
  }
}

void pollOutboundDeliveries();
const deliveryTimer = setInterval(() => void pollOutboundDeliveries(), deliveryPollIntervalMs);
async function purgeOperationalLogs() {
  if (!deliveryStore) return;
  try {
    const purged = await deliveryStore.purgeExpiredOperationalLogs();
    if (purged)
      process.stdout.write(
        `${JSON.stringify({ service: "worker", operation: "operational_log_retention", workerId, purged })}\n`,
      );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ service: "worker", operation: "operational_log_retention", workerId, error: error instanceof Error ? error.message : "unknown" })}\n`,
    );
  }
}
void purgeOperationalLogs();
const operationalLogPurgeTimer = setInterval(
  () => void purgeOperationalLogs(),
  operationalLogPurgeIntervalMs,
);

// Telegram alerts for posted revenue/expense journals. Per-organization settings live in the
// database (configured in the app); the bot token is decrypted with SESSION_SECRET and never logged.
const telegramPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  : undefined;
const telegramNotifier = telegramPool
  ? new TelegramNotifier(
      new PgTelegramNotificationStore(telegramPool, process.env.SESSION_SECRET?.trim()),
      fetch,
    )
  : undefined;
let telegramRunning = false;

async function pollTelegramNotifications() {
  if (!telegramNotifier || telegramRunning) return;
  telegramRunning = true;
  try {
    const result = await telegramNotifier.runBatch();
    if (result.enqueued || result.leased)
      process.stdout.write(
        `${JSON.stringify({ service: "worker", operation: "telegram_notification", workerId, ...result })}\n`,
      );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ service: "worker", operation: "telegram_notification", workerId, error: error instanceof Error ? error.message.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[REDACTED]") : "unknown" })}\n`,
    );
  } finally {
    telegramRunning = false;
  }
}
if (telegramNotifier) {
  void pollTelegramNotifications();
}
const telegramTimer = telegramNotifier
  ? setInterval(() => void pollTelegramNotifications(), deliveryPollIntervalMs)
  : undefined;

async function shutdown(): Promise<void> {
  clearInterval(heartbeatTimer);
  if (telegramTimer) clearInterval(telegramTimer);
  await telegramPool?.end();
  clearInterval(deliveryTimer);
  clearInterval(operationalLogPurgeTimer);
  await deliveryStore?.close();
  process.exitCode = 0;
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
