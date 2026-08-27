export type SortableRecord = Record<string, unknown>;

function value(row: SortableRecord, key: string): string {
  const snake = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  const raw = row[key] ?? row[snake];
  return raw == null ? "" : String(raw);
}

/** Sort business records newest-first, with a stable id tie-breaker. */
export function sortRecordsNewestFirst<T extends SortableRecord>(
  rows: readonly T[],
  dateOf: (row: T) => string,
): T[] {
  return [...rows].sort((left, right) => {
    const leftDate = dateOf(left);
    const rightDate = dateOf(right);
    const leftTime = leftDate ? Date.parse(leftDate) : Number.NEGATIVE_INFINITY;
    const rightTime = rightDate ? Date.parse(rightDate) : Number.NEGATIVE_INFINITY;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return value(right, "id").localeCompare(value(left, "id"));
  });
}
