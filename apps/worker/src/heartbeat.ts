export type WorkerHeartbeat = {
  service: "worker";
  status: "ok";
  recordedAt: string;
};

export function createHeartbeat(now: Date = new Date()): WorkerHeartbeat {
  return {
    service: "worker",
    status: "ok",
    recordedAt: now.toISOString(),
  };
}
