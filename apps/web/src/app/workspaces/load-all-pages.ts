function withPaging(path: string, limit: number, cursor?: string): string {
  const qIndex = path.indexOf("?");
  const base = qIndex >= 0 ? path.slice(0, qIndex) : path;
  const params = new URLSearchParams(qIndex >= 0 ? path.slice(qIndex + 1) : "");
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);
  else params.delete("cursor");
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Follows `data.nextCursor` of a bounded list (BR-READ-001/002) and returns every row. */
export async function loadAllPages(
  request: (path: string) => Promise<{ data?: unknown }>,
  path: string,
  maxPages = 50,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await request(withPaging(path, 100, cursor));
    const data = payload.data as
      { items?: Record<string, unknown>[]; nextCursor?: string } | undefined;
    rows.push(...(data?.items ?? []));
    cursor = data?.nextCursor;
    if (!cursor) break;
  }
  return rows;
}
