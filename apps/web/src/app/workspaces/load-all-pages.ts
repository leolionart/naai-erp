/** Follows `data.nextCursor` of a bounded list (BR-READ-001/002) and returns every row. */
export async function loadAllPages(
  request: (path: string) => Promise<{ data?: unknown }>,
  path: string,
  maxPages = 50,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const payload = await request(
      `${path}${separator}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    const data = payload.data as
      { items?: Record<string, unknown>[]; nextCursor?: string } | undefined;
    rows.push(...(data?.items ?? []));
    cursor = data?.nextCursor;
    if (!cursor) break;
  }
  return rows;
}
