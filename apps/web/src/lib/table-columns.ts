/**
 * Column visibility is remembered per table *by header label* (not by position) under a key that
 * only depends on the route (or an explicit key). Position- or label-set-based keys lost the choice
 * whenever a column was added/removed or a header label changed, so users had to re-pick columns.
 */
export const COLUMN_STORAGE_PREFIX = "naai-erp-table-columns-v2";

export function columnStorageKey(identity: string) {
  return `${COLUMN_STORAGE_PREFIX}:${identity}`;
}

export function parseHiddenLabels(raw: string | null): ReadonlySet<string> {
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string" && value !== "")
        : [],
    );
  } catch {
    return new Set();
  }
}

export function serializeHiddenLabels(hidden: ReadonlySet<string>) {
  return JSON.stringify([...hidden].sort());
}

/** Indexes to hide; never hides every column so the table cannot disappear. */
export function hiddenIndexes(labels: readonly string[], hidden: ReadonlySet<string>) {
  const indexes = new Set(labels.flatMap((label, index) => (hidden.has(label) ? [index] : [])));
  return indexes.size >= labels.length ? new Set<number>() : indexes;
}

export function toggleLabel(
  labels: readonly string[],
  hidden: ReadonlySet<string>,
  label: string,
  visible: boolean,
): ReadonlySet<string> {
  const next = new Set(hidden);
  if (visible) {
    next.delete(label);
    return next;
  }
  next.add(label);
  // Refuse to hide the last visible column.
  return hiddenIndexes(labels, next).size === 0 && labels.length > 0 ? hidden : next;
}
