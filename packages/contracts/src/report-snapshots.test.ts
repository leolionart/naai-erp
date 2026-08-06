import { describe, expectTypeOf, it } from "vitest";
import type {
  AccountantReportKindContract,
  ReportSnapshotContract,
  SnapshotReproductionContract,
} from "./report-snapshots.js";
describe("ERP-650 snapshot contracts", () => {
  it("keeps hashes cutoff and readiness machine readable", () => {
    expectTypeOf<AccountantReportKindContract>().toEqualTypeOf<
      | "profit_and_loss"
      | "balance_sheet"
      | "direct_cash_flow"
      | "vat_reconciliation"
      | "tax_expense_review"
    >();
    expectTypeOf<ReportSnapshotContract["resultHash"]>().toEqualTypeOf<string>();
    expectTypeOf<ReportSnapshotContract["snapshotHash"]>().toEqualTypeOf<string>();
    expectTypeOf<ReportSnapshotContract["mappingVersions"]>().toEqualTypeOf<
      Readonly<Record<string, string>>
    >();
    expectTypeOf<ReportSnapshotContract["sourceManifest"]>().toEqualTypeOf<
      readonly Readonly<Record<string, unknown>>[]
    >();
    expectTypeOf<ReportSnapshotContract["readiness"]>().toEqualTypeOf<
      "review_required" | "final"
    >();
    expectTypeOf<SnapshotReproductionContract["reproducible"]>().toEqualTypeOf<boolean>();
  });
});
