import { describe, expect, it } from "vitest";
import {
  assertForecastCompositionPublishable,
  buildForecastComposition,
  createForecastComponent,
  reviewForecastManualAdjustment,
  weightedForecastComponentMinor,
  type ForecastComponent,
  type ForecastComponentDirection,
  type ForecastComponentKind,
  type ForecastComponentSection,
  type ForecastCompositionContext,
  type ForecastSourceType,
} from "./forecast-composition.js";

const context: ForecastCompositionContext = {
  organizationId: "org-naai",
  forecastVersionId: "forecast-2026-base",
  forecastState: "draft",
  actualBasis: "recognized",
  asOfDate: "2026-08-31",
  startsOn: "2026-08-01",
  endsOn: "2026-12-31",
  currency: "VND",
};

function component(
  id: string,
  section: ForecastComponentSection,
  kind: ForecastComponentKind,
  direction: ForecastComponentDirection,
  amountMinor: bigint,
  sourceType: ForecastSourceType,
  options: Readonly<{
    probabilityBps?: number;
    scheduledOn?: string;
    commercialRootId?: string;
  }> = {},
): ForecastComponent {
  return createForecastComponent(context, {
    id,
    section,
    kind,
    direction,
    amountMinor,
    ...(options.probabilityBps === undefined ? {} : { probabilityBps: options.probabilityBps }),
    scheduledOn: options.scheduledOn ?? (kind === "opening_cash" ? "2026-08-31" : "2026-09-30"),
    currency: "VND",
    source: {
      type: sourceType,
      id: `${sourceType}-${id}`,
      ...(section === "revenue" && kind !== "manual_adjustment"
        ? {
            commercialRootType: "commercial_case",
            commercialRootId: options.commercialRootId ?? id,
          }
        : {}),
    },
    createdBy: "maker-1",
  });
}

function reviewedManual(
  id: string,
  section: ForecastComponentSection,
  direction: ForecastComponentDirection,
  amountMinor: bigint,
): ForecastComponent {
  return reviewForecastManualAdjustment(
    component(id, section, "manual_adjustment", direction, amountMinor, "manual"),
    "reviewer-1",
    "Reviewed planning assumption",
    "2026-08-31T12:00:00+07:00",
  );
}

describe("ERP-610 forecast composition", () => {
  it("T-FCT-003 applies exact revenue and expense composition with half-up pipeline weighting", () => {
    const pipeline = component(
      "pipeline",
      "revenue",
      "weighted_pipeline",
      "increase",
      20_000_001n,
      "opportunity",
      { probabilityBps: 5_000 },
    );
    expect(weightedForecastComponentMinor(pipeline)).toBe(10_000_001n);
    const result = buildForecastComposition({
      context,
      actualToDateMinor: 40_000_000n,
      components: [
        component("opening", "cash", "opening_cash", "increase", 25_000_000n, "bank_balance"),
        component(
          "milestone",
          "revenue",
          "committed_milestone",
          "increase",
          30_000_000n,
          "milestone",
        ),
        component(
          "recurring",
          "revenue",
          "scheduled_recurring",
          "increase",
          12_000_000n,
          "recurring_schedule",
        ),
        pipeline,
        reviewedManual("revenue-adjustment", "revenue", "decrease", 2_000_000n),
        component(
          "expense-payroll",
          "expense",
          "payroll",
          "increase",
          35_000_000n,
          "payroll_schedule",
        ),
        component(
          "opex",
          "expense",
          "recurring_opex",
          "increase",
          8_000_000n,
          "recurring_schedule",
        ),
        reviewedManual("expense-adjustment", "expense", "increase", 1_000_000n),
      ],
    });
    expect(result.projectedRevenueMinor).toBe(90_000_001n);
    expect(result.projectedExpenseMinor).toBe(44_000_000n);
  });

  it("T-FCT-004 calculates cash separately and classifies owner funding only as financing", () => {
    const result = buildForecastComposition({
      context,
      actualToDateMinor: 0n,
      components: [
        component("opening", "cash", "opening_cash", "increase", 25_000_000n, "bank_balance"),
        component(
          "collections",
          "cash",
          "expected_collection",
          "increase",
          50_000_000n,
          "receivable",
        ),
        component("funding", "cash", "financing", "increase", 10_000_000n, "owner_funding"),
        component("payroll", "cash", "payroll", "decrease", 35_000_000n, "payroll_schedule"),
        component("ap", "cash", "ap_due", "decrease", 12_000_000n, "payable"),
        component(
          "recurring",
          "cash",
          "recurring_expense",
          "decrease",
          8_000_000n,
          "recurring_schedule",
        ),
        component("tax", "cash", "tax", "decrease", 3_000_000n, "tax_schedule"),
        component("capex", "cash", "capex", "decrease", 5_000_000n, "capex_schedule"),
      ],
    });
    expect(result.projectedClosingCashMinor).toBe(22_000_000n);
    expect(() =>
      component(
        "bad-owner-funding",
        "revenue",
        "scheduled_recurring",
        "increase",
        1n,
        "owner_funding",
      ),
    ).toThrow("financing cash inflow");
  });

  it("rejects invalid matrices, unreviewed adjustments and duplicated commercial roots", () => {
    expect(() => component("bad", "cash", "tax", "increase", 1n, "tax_schedule")).toThrow(
      "must decrease",
    );
    const pending = component("pending", "revenue", "manual_adjustment", "increase", 1n, "manual");
    expect(() =>
      reviewForecastManualAdjustment(
        pending,
        "maker-1",
        "Self review is not allowed",
        "2026-08-31T12:00:00+07:00",
      ),
    ).toThrow("maker-checker");
    expect(() => assertForecastCompositionPublishable([pending])).toThrow("requires review");
    const invoiceView = component(
      "invoice-view",
      "revenue",
      "committed_milestone",
      "increase",
      10n,
      "milestone",
      { commercialRootId: "deal-1" },
    );
    const opportunityView = component(
      "opportunity-view",
      "revenue",
      "weighted_pipeline",
      "increase",
      10n,
      "opportunity",
      { probabilityBps: 5_000, commercialRootId: "deal-1" },
    );
    expect(() => assertForecastCompositionPublishable([invoiceView, opportunityView])).toThrow(
      "double-counted",
    );
  });

  it("rejects changes against a published snapshot and requires opening cash before publish", () => {
    expect(() =>
      createForecastComponent(
        { ...context, forecastState: "published" },
        {
          id: "late",
          section: "cash",
          kind: "opening_cash",
          direction: "increase",
          scheduledOn: "2026-08-31",
          amountMinor: 1n,
          currency: "VND",
          source: { type: "bank_balance", id: "bank-1" },
          createdBy: "maker-1",
        },
      ),
    ).toThrow("immutable");
    expect(
      buildForecastComposition({ context, actualToDateMinor: 4n, components: [] })
        .projectedRevenueMinor,
    ).toBe(4n);
    expect(() => assertForecastCompositionPublishable([])).toThrow("exactly one opening cash");
  });
});
