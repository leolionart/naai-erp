export type OperationalLog = Readonly<{
  id: string;
  service: string;
  operation: string;
  status: string;
  severity: string;
  worker_id?: string | null;
  correlation_id?: string | null;
  summary?: string | null;
  details?: unknown;
  started_at: string;
  completed_at?: string | null;
  expires_at: string;
  created_at: string;
}>;

export type OperationalLogPage = Readonly<{
  items: readonly OperationalLog[];
  nextCursor?: string | null;
}>;

export const operationalLogsApi = Object.freeze({
  list: (query: Record<string, string | number | undefined> = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    const suffix = params.toString();
    return `operational-logs${suffix ? `?${suffix}` : ""}`;
  },
});
