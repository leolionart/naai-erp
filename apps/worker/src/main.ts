import { randomUUID } from "node:crypto";
import { createHeartbeat } from "./heartbeat.js";
import { OutboundDeliveryRunner } from "./outbound-delivery.js";
import { PgOutboundDeliveryStore } from "./pg-outbound-delivery-store.js";

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

async function shutdown(): Promise<void> {
  clearInterval(heartbeatTimer);
  clearInterval(deliveryTimer);
  await deliveryStore?.close();
  process.exitCode = 0;
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
