export function ownerSettlementDashboardAmounts(financials?: {
  ownerPayableMinor?: string;
  companyOwesOwnerMinor?: string;
  ownerHoldsCompanyFundsMinor?: string;
}) {
  const companyOwesOwner = BigInt(
    financials?.companyOwesOwnerMinor ?? financials?.ownerPayableMinor ?? "0",
  );
  const ownerHoldsCompanyFunds = BigInt(financials?.ownerHoldsCompanyFundsMinor ?? "0");
  return {
    companyOwesOwnerMinor: (companyOwesOwner > 0n ? companyOwesOwner : 0n).toString(),
    ownerHoldsCompanyFundsMinor: (ownerHoldsCompanyFunds > 0n
      ? ownerHoldsCompanyFunds
      : 0n
    ).toString(),
  };
}

export function shouldShowNetCompanyFunds(companyOwesOwnerMinor: string) {
  return BigInt(companyOwesOwnerMinor) > 0n;
}

export function money(value: string | null | undefined, currency = "VND") {
  if (value == null) return "N/A";
  return `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} ${currency === "VND" ? "₫" : currency}`;
}

export function ratio(value: number | null | undefined) {
  return value == null
    ? "N/A"
    : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value / 100)}%`;
}

export function months(value: string | null | undefined) {
  if (value == null) return "N/A";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(Number(value) / 1000)} tháng`;
}

export function formatStatusBadge(status?: string): string | null {
  if (!status) return null;
  const map: Record<string, string> = {
    missing_reviewed_burn: "Thiếu burn rate",
    out_of_balance: "Lệch đối soát",
    missing: "Thiếu dữ liệu",
    review_required: "Cần review",
    unreviewed: "Chưa review",
    review: "Cần review",
    at_risk: "Cần lưu ý",
    on_track: "Đạt mục tiêu",
    "Cần rà soát": "Cần rà soát",
    "Chưa có dữ liệu": "Chưa có dữ liệu",
    "Dồn tích": "Dồn tích",
  };

  if (
    status === "available" ||
    status === "tied" ||
    status === "ok" ||
    status === "ready" ||
    status === "normal" ||
    status === "balanced"
  ) {
    return null;
  }

  if (/^\d+\s/.test(status)) {
    return status;
  }

  return map[status] ?? status;
}

export type MetricCardVariant = "surface" | "primary" | "muted" | "danger";
export type MetricScopeTone = "period" | "balance";

function formatViDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatDashboardPeriodShortLabel(search: URLSearchParams): string {
  const kind = search.get("periodKind") ?? "year";
  const startsOn = search.get("startsOn") ?? "";
  const endsOn = search.get("endsOn") ?? "";
  const yearMatch = /^(\d{4})-01-01$/.exec(startsOn);
  if (kind === "year" && yearMatch && endsOn === `${yearMatch[1]}-12-31`) {
    return `Năm ${yearMatch[1]}`;
  }
  const startParts = /^(\d{4})-(\d{2})-01$/.exec(startsOn);
  if (kind === "quarter" && startParts) {
    const quarter = Math.floor((Number(startParts[2]) - 1) / 3) + 1;
    return `Quý ${quarter}/${startParts[1]}`;
  }
  if (kind === "month" && startParts) {
    return `Tháng ${startParts[2]}/${startParts[1]}`;
  }
  if (startsOn && endsOn) {
    return `${formatViDate(startsOn)} – ${formatViDate(endsOn)}`;
  }
  return "Kỳ đang chọn";
}

export function formatDashboardPeriodScope(search: URLSearchParams): string {
  return `Theo kỳ lọc · ${formatDashboardPeriodShortLabel(search)}`;
}

export function formatDashboardBalanceScope(
  search: URLSearchParams,
  todayIso = new Date().toISOString().slice(0, 10),
): string {
  const asOfDate = search.get("asOfDate") ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) && asOfDate < todayIso) {
    return `Số dư lũy kế đến ${formatViDate(asOfDate)}`;
  }
  return "Số dư toàn thời gian";
}

export const metricCardVariantStyles: Record<
  MetricCardVariant,
  Readonly<{
    card: string;
    title: string;
    description: string;
    trend: string;
    badge: string;
    arrow: string;
  }>
> = {
  surface: {
    card: "border-border/60 bg-card/90 text-card-foreground hover:border-primary/50 hover:bg-accent/30",
    title: "group-hover:text-primary",
    description: "text-muted-foreground",
    trend: "var(--color-trend)",
    badge: "",
    arrow: "bg-foreground text-background",
  },
  primary: {
    card: "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
    title: "text-primary-foreground",
    description: "text-primary-foreground/80",
    trend: "var(--primary-foreground)",
    badge:
      "border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/20",
    arrow: "bg-primary-foreground text-primary",
  },
  muted: {
    card: "border-border/60 bg-muted/70 text-card-foreground hover:border-primary/50 hover:bg-muted",
    title: "group-hover:text-primary",
    description: "text-muted-foreground",
    trend: "var(--color-trend)",
    badge: "",
    arrow: "bg-foreground text-background",
  },
  danger: {
    card: "border-destructive/40 bg-destructive text-destructive-foreground hover:bg-destructive/90",
    title: "text-destructive-foreground",
    description: "text-destructive-foreground/80",
    trend: "var(--destructive-foreground)",
    badge:
      "border-destructive-foreground/30 bg-destructive-foreground/15 text-destructive-foreground hover:bg-destructive-foreground/20",
    arrow: "bg-destructive-foreground text-destructive",
  },
};
