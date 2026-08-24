export type DirectoryFilterRow = Readonly<Record<string, unknown>>;

export function resolveProjectDirectoryPeriod(
  search: Pick<URLSearchParams, "get">,
  today = new Date().toISOString().slice(0, 10),
) {
  const year = today.slice(0, 4);
  return {
    startsOn: search.get("startsOn") ?? `${year}-01-01`,
    endsOn: search.get("endsOn") ?? `${year}-12-31`,
  };
}

function text(row: DirectoryFilterRow, key: string) {
  return String(row[key] ?? "");
}

function dateOnly(input: string) {
  if (!input) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const date = new Date(input);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

export function projectMatchesDirectoryFilters(
  row: DirectoryFilterRow,
  filters: Readonly<{ query: string; state: string; startsOn: string; endsOn: string }>,
) {
  const normalizedQuery = filters.query.toLowerCase();
  const matchesQuery = Object.values(row).some((item) =>
    String(item ?? "")
      .toLowerCase()
      .includes(normalizedQuery),
  );
  if (!matchesQuery) return false;
  if (filters.state !== "all" && text(row, "state") !== filters.state) return false;

  const projectStartsOn = dateOnly(text(row, "starts_on"));
  const projectEndsOn = dateOnly(text(row, "ends_on"));
  if (filters.endsOn && projectStartsOn && projectStartsOn > filters.endsOn) return false;
  if (filters.startsOn && projectEndsOn && projectEndsOn < filters.startsOn) return false;
  return true;
}
