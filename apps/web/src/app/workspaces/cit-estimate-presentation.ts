export type CitFinancialsPresentationInput = Readonly<{
  corporateIncomeTaxRateBps?: number | null;
  corporateIncomeTaxMinor?: string | null;
  taxableProfitMinor?: string;
  corporateIncomeTaxAssumption?: string;
  corporateIncomeTaxBasis?: string;
  priorYearRevenueMinor?: string | null;
  citSmallEnterpriseIneligible?: boolean;
}>;

export function formatCitRatePercent(rateBps: number | null | undefined): string {
  if (rateBps == null) return "N/A";
  const whole = Math.trunc(rateBps / 100);
  const remainder = Math.abs(rateBps % 100);
  if (remainder === 0) return `${whole}%`;
  const decimals = String(remainder).padStart(2, "0").replace(/0+$/, "");
  return `${whole},${decimals}%`;
}

export function buildCitCardDescription(input: {
  taxableProfitFormatted: string;
  financials?: CitFinancialsPresentationInput;
}): string {
  const rateLabel = formatCitRatePercent(input.financials?.corporateIncomeTaxRateBps);
  const base = `Lợi nhuận tính thuế tạm tính ${input.taxableProfitFormatted} × thuế suất đã duyệt ${rateLabel}`;
  const assumption = input.financials?.corporateIncomeTaxAssumption?.trim();
  return assumption ? `${base} · ${assumption}` : base;
}

export function buildCitDrilldownFacts(input: {
  taxableProfitFormatted: string;
  citUnreviewedFormatted: string;
  priorYearRevenueFormatted?: string;
  financials?: CitFinancialsPresentationInput;
}): readonly Readonly<{ label: string; value: string }>[] {
  const facts: Array<{ label: string; value: string }> = [
    { label: "Lợi nhuận tính thuế", value: input.taxableProfitFormatted },
    {
      label: "Thuế suất TNDN",
      value: formatCitRatePercent(input.financials?.corporateIncomeTaxRateBps),
    },
    { label: "Chi phí CIT chưa review", value: input.citUnreviewedFormatted },
  ];
  if (input.priorYearRevenueFormatted) {
    facts.push({ label: "Doanh thu năm trước liền kề", value: input.priorYearRevenueFormatted });
  }
  if (input.financials?.corporateIncomeTaxAssumption) {
    facts.push({
      label: "Giả định & căn cứ thuế suất",
      value: input.financials.corporateIncomeTaxAssumption,
    });
  }
  return facts;
}

export function buildDashboardCitDrilldownEntries(input: {
  queryString: string;
  taxableProfitFormatted: string;
  corporateIncomeTaxFormatted: string;
  profitBeforeTaxFormatted: string;
  citIneligibleFormatted: string;
  citUnreviewedFormatted: string;
  priorYearRevenueFormatted?: string;
  financials?: CitFinancialsPresentationInput;
}) {
  const canonicalHref = `/reports/financial-statements/profit-and-loss/current?${input.queryString}`;
  return {
    "taxable-profit": {
      title: "Lợi nhuận tính thuế TNDN tạm tính",
      value: input.taxableProfitFormatted,
      formula: "Operating Dashboard API: taxableProfitMinor",
      sourceIds: [] as readonly string[],
      canonicalHref,
      facts: [
        { label: "Lợi nhuận kế toán trước thuế", value: input.profitBeforeTaxFormatted },
        { label: "Chi phí CIT không được trừ", value: input.citIneligibleFormatted },
        { label: "Chi phí CIT chưa review", value: input.citUnreviewedFormatted },
      ],
    },
    "corporate-income-tax": {
      title: "Thuế TNDN tạm tính",
      value: input.corporateIncomeTaxFormatted,
      formula: "Operating Dashboard API: corporateIncomeTaxMinor",
      sourceIds: [] as readonly string[],
      canonicalHref,
      facts: buildCitDrilldownFacts({
        taxableProfitFormatted: input.taxableProfitFormatted,
        citUnreviewedFormatted: input.citUnreviewedFormatted,
        ...(input.priorYearRevenueFormatted !== undefined
          ? { priorYearRevenueFormatted: input.priorYearRevenueFormatted }
          : {}),
        financials: input.financials,
      }),
    },
  };
}
