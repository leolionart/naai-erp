import { createHeartbeat } from "./heartbeat.js";

const heartbeatIntervalMs = Number.parseInt(
  process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? "30000",
  10,
);

function reportHeartbeat(): void {
  process.stdout.write(`${JSON.stringify(createHeartbeat())}\n`);
}

reportHeartbeat();
const timer = setInterval(reportHeartbeat, heartbeatIntervalMs);

function shutdown(): void {
  clearInterval(timer);
  process.exitCode = 0;
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
