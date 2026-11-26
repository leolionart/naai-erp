import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/api";
import {
  DEFAULT_SOLOPRENEUR_RECORD_REASON,
  actionDisplayLabel,
  canRecordInOneClick,
  defaultActionReason,
  formatRecordActionError,
  resolveDetailActionPlan,
} from "./focused-record-actions";

describe("ERP-989 focused-record solopreneur vs controlled action plan", () => {
  const solopreneurOwner = {
    operatingMode: "solopreneur",
    callerIsOwner: true,
    callerCanSaveAndRecord: true,
  } as const;

  const controlledOwner = {
    operatingMode: "controlled",
    callerIsOwner: true,
    callerCanSaveAndRecord: false,
  } as const;

  it("shows single Ghi sổ button, hides intermediate actions, and moves secondary actions to overflow in solopreneur mode", () => {
    const draftExpensePlan = resolveDetailActionPlan(
      "expenses",
      { id: "e-1", state: "draft" },
      solopreneurOwner,
    );
    expect(draftExpensePlan).toEqual({
      mode: "solopreneur_owner",
      showOneClickRecord: true,
      primaryLifecycleActions: [],
      overflowActions: ["review"],
      showStandaloneReviewButton: false,
      hideMakerCheckerWarning: true,
    });

    const submittedExpensePlan = resolveDetailActionPlan(
      "expenses",
      { id: "e-2", state: "submitted" },
      solopreneurOwner,
    );
    expect(submittedExpensePlan.showOneClickRecord).toBe(true);
    expect(submittedExpensePlan.primaryLifecycleActions).toEqual([]);
    expect(submittedExpensePlan.overflowActions).toEqual([
      "mark-evidence-pending",
      "reject",
      "review",
    ]);

    const purchaseDraftPlan = resolveDetailActionPlan(
      "documents",
      { id: "d-1", type: "purchase_invoice", state: "draft" },
      solopreneurOwner,
    );
    expect(purchaseDraftPlan.showOneClickRecord).toBe(true);
    expect(purchaseDraftPlan.primaryLifecycleActions).toEqual([]);
    expect(purchaseDraftPlan.overflowActions).toEqual(["cancel"]);

    const postedExpensePlan = resolveDetailActionPlan(
      "expenses",
      { id: "e-3", state: "posted" },
      solopreneurOwner,
    );
    expect(postedExpensePlan.showOneClickRecord).toBe(false);
    expect(
      canRecordInOneClick("recognition", { id: "r-1", state: "draft" }, solopreneurOwner),
    ).toBe(false);
  });

  it("keeps controlled mode lifecycle buttons and review button unchanged", () => {
    const controlledPlan = resolveDetailActionPlan(
      "expenses",
      { id: "e-1", state: "submitted" },
      controlledOwner,
    );
    expect(controlledPlan).toEqual({
      mode: "controlled",
      showOneClickRecord: false,
      primaryLifecycleActions: ["mark-evidence-pending", "approve", "reject"],
      overflowActions: [],
      showStandaloneReviewButton: true,
      hideMakerCheckerWarning: false,
    });
  });

  it("defaults reason to Chủ ghi sổ for routine recording/approval and keeps ledger-mutating actions mandatory", () => {
    expect(defaultActionReason("record", solopreneurOwner)).toBe(DEFAULT_SOLOPRENEUR_RECORD_REASON);
    expect(defaultActionReason("approve", solopreneurOwner)).toBe(
      DEFAULT_SOLOPRENEUR_RECORD_REASON,
    );
    expect(defaultActionReason("approve", controlledOwner)).toBe("");
    for (const mandatory of [
      "void",
      "reverse",
      "reclassify-funding",
      "reclassify-accounts",
      "reject",
      "cancel",
      "mark-evidence-pending",
    ]) {
      expect(defaultActionReason(mandatory, solopreneurOwner)).toBe("");
    }
    expect(actionDisplayLabel("mark-evidence-pending")).toBe("Đánh dấu thiếu chứng từ");
    expect(actionDisplayLabel("reject")).toBe("Từ chối");
  });

  it("surfaces structured blocking reasons from DRAFT_RECORD_BLOCKED responses", () => {
    const err = new ApiClientError({
      status: 422,
      code: "DRAFT_RECORD_BLOCKED",
      message: "DRAFT_RECORD_BLOCKED",
      details: {
        reasons: [
          { code: "PERIOD_HARD_LOCKED", message: "Kỳ kế toán đã khóa cứng." },
          { code: "COUNTER_ACCOUNT_MISSING", message: "Thiếu tài khoản đối ứng." },
        ],
      },
    });
    expect(formatRecordActionError(err)).toBe("Kỳ kế toán đã khóa cứng. Thiếu tài khoản đối ứng.");
  });
});
