/**
 * In-memory sliding-window limiter for failed logins (OWASP A07 brute-force protection).
 * Keyed by client address; a lower global ceiling bounds distributed guessing.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_CLIENT = 5;
const MAX_FAILURES_GLOBAL = 50;
const MAX_TRACKED_CLIENTS = 5000;

const failures = new Map<string, number[]>();
let globalFailures: number[] = [];

function prune(entries: number[], now: number) {
  return entries.filter((timestamp) => now - timestamp < WINDOW_MS);
}

export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/** Returns the seconds to wait before another attempt, or 0 when attempts are allowed. */
export function loginRetryAfterSeconds(client: string, now = Date.now()): number {
  globalFailures = prune(globalFailures, now);
  const own = prune(failures.get(client) ?? [], now);
  if (own.length) failures.set(client, own);
  else failures.delete(client);
  const blocked =
    own.length >= MAX_FAILURES_PER_CLIENT
      ? own
      : globalFailures.length >= MAX_FAILURES_GLOBAL
        ? globalFailures
        : undefined;
  if (!blocked) return 0;
  return Math.max(1, Math.ceil((blocked[0]! + WINDOW_MS - now) / 1000));
}

export function recordLoginFailure(client: string, now = Date.now()) {
  if (failures.size >= MAX_TRACKED_CLIENTS && !failures.has(client)) {
    const oldest = failures.keys().next().value;
    if (oldest !== undefined) failures.delete(oldest);
  }
  failures.set(client, [...prune(failures.get(client) ?? [], now), now]);
  globalFailures = [...prune(globalFailures, now), now];
}

export function resetLoginFailures(client: string) {
  failures.delete(client);
}

export function resetLoginRateLimitForTests() {
  failures.clear();
  globalFailures = [];
}
