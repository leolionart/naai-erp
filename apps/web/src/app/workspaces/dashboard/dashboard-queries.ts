import type { OperatingDashboardWire, PeriodKind } from "./dashboard-contracts";

const currentMonth = () => new Date().toISOString().slice(0, 7);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const monthEnd = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
};

/**
 * Build the URL for a dashboard metric drill-down while preserving the
 * dashboard's active period and dimension filters. Keeping this in one place
 * prevents KPI cards from silently dropping the selected reporting range.
 */
export function dashboardMetricDrilldownHref(
  metricKey: string,
  search: URLSearchParams | string = "",
) {
  const query = typeof search === "string" ? search : search.toString();
  const suffix = query ? `?${query}` : "";
  return `/dashboard/drilldown/${encodeURIComponent(metricKey)}${suffix}`;
}

export function periodRange(anchorMonth: string, kind: PeriodKind) {
  const [year, month] = anchorMonth.split("-").map(Number);
  if (kind === "year")
    return { label: String(year), startsOn: `${year}-01-01`, endsOn: `${year}-12-31` };
  if (kind === "quarter") {
    const quarter = Math.floor((month - 1) / 3) + 1;
    const startMonth = String((quarter - 1) * 3 + 1).padStart(2, "0");
    const endMonth = `${year}-${String(quarter * 3).padStart(2, "0")}`;
    return {
      label: `${year}-Q${quarter}`,
      startsOn: `${year}-${startMonth}-01`,
      endsOn: monthEnd(endMonth),
    };
  }
  return { label: anchorMonth, startsOn: `${anchorMonth}-01`, endsOn: monthEnd(anchorMonth) };
}

export function resolvedDashboardSearch(
  input: URLSearchParams,
  sourceControls?: OperatingDashboardWire["sourceControls"],
) {
  const search = new URLSearchParams(input);
  const requestedPeriod = search.get("periodId");
  const periodMatch = /^(?:CAL-)?(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(
    requestedPeriod ?? currentMonth(),
  );
  const latestSourcePeriod = sourceControls?.monthly
    .map((row) => row.period)
    .filter((value) => /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value))
    .sort()
    .at(-1);
  const period = requestedPeriod
    ? (periodMatch?.[1] ?? currentMonth())
    : (latestSourcePeriod ?? currentMonth());
  if (!periodMatch || !requestedPeriod) search.set("periodId", `CAL-${period}`);
  if (!search.has("actualBasis")) search.set("actualBasis", "invoiced");

  const kind = (search.get("periodKind") as PeriodKind | null) ?? "year";
  if (!search.has("periodKind")) search.set("periodKind", kind);

  // Use startsOn/endsOn from URL (set by PeriodRangeNavigator) when present,
  // otherwise compute from period + kind.
  const existingStartsOn = search.get("startsOn");
  const existingEndsOn = search.get("endsOn");
  const hasExplicitRange =
    existingStartsOn &&
    existingEndsOn &&
    ISO_DATE.test(existingStartsOn) &&
    ISO_DATE.test(existingEndsOn) &&
    existingStartsOn <= existingEndsOn;

  let startsOn: string;
  let endsOn: string;
  if (hasExplicitRange) {
    startsOn = existingStartsOn;
    endsOn = existingEndsOn;
  } else {
    const range = periodRange(period, kind);
    startsOn = range.startsOn;
    endsOn = range.endsOn;
  }

  // Resolve asOfDate: check asOfDate, then asOfInstant (set by PeriodRangeNavigator),
  // fallback to endsOn. An explicit cutoff may be earlier than the selected period end;
  // individual report queries clamp their end date to that cutoff.
  const rawAsOfInstant = search.get("asOfInstant");
  const asOfFromInstant = rawAsOfInstant ? rawAsOfInstant.slice(0, 10) : undefined;
  let asOfDate = search.get("asOfDate") ?? asOfFromInstant ?? endsOn;
  if (!ISO_DATE.test(asOfDate)) asOfDate = endsOn;
  const today = new Date().toISOString().slice(0, 10);
  // Never send a future asOf — clamp to today
  if (asOfDate > today) asOfDate = today;
  // But asOf must be >= startsOn for the query to be valid
  if (asOfDate < startsOn) asOfDate = startsOn;
  search.set("startsOn", startsOn);
  search.set("endsOn", endsOn);
  search.set("asOfDate", asOfDate);
  return search;
}

export function reportQuery(search: URLSearchParams) {
  const query = new URLSearchParams();
  const startsOn = search.get("startsOn") ?? "2025-01-01";
  const endsOn = effectiveEndsOn(search);
  query.set("startsOn", startsOn);
  query.set("endsOn", endsOn);
  query.set("asOfInstant", `${search.get("asOfDate") ?? endsOn}T16:59:59.999Z`);
  query.set("framework", "TT133");
  for (const key of ["serviceLineCode", "teamId", "ownerId", "projectId"]) {
    const value = search.get(key);
    if (value) query.set(key, value);
  }
  return query;
}

export function effectiveEndsOn(search: URLSearchParams) {
  const endsOn = search.get("endsOn") ?? "2025-12-31";
  const asOfDate = search.get("asOfDate") ?? endsOn;
  return endsOn > asOfDate ? asOfDate : endsOn;
}

export function performanceQuery(search: URLSearchParams) {
  const query = new URLSearchParams();
  query.set("periodId", search.get("periodId") ?? "CAL-2025-01");
  query.set("periodBasis", "calendar");
  query.set("actualBasis", search.get("actualBasis") ?? "invoiced");
  const asOfDate = search.get("asOfDate") ?? search.get("endsOn") ?? "2025-12-31";
  query.set("asOfInstant", `${asOfDate}T16:59:59.999Z`);
  for (const key of ["serviceLineCode", "teamId", "ownerId"]) {
    const value = search.get(key);
    if (value) query.set(key, value);
  }
  return query;
}

export function actualSummaryQuery(search: URLSearchParams) {
  const query = new URLSearchParams({
    actualBasis: search.get("actualBasis") ?? "invoiced",
    from: search.get("startsOn") ?? "2025-01-01",
    to: effectiveEndsOn(search),
  });
  for (const key of ["serviceLineCode", "teamId", "ownerId"]) {
    const value = search.get(key);
    if (value) query.set(key, value);
  }
  return query;
}

export function projectQuery(search: URLSearchParams) {
  const query = new URLSearchParams();
  const startsOn = search.get("startsOn") ?? "2025-01-01";
  const endsOn = effectiveEndsOn(search);
  query.set("periodStart", startsOn);
  query.set("periodEnd", endsOn);
  query.set("asOf", search.get("asOfDate") ?? endsOn);
  if (search.get("serviceLineCode")) query.set("serviceLineId", search.get("serviceLineCode")!);
  return query;
}
