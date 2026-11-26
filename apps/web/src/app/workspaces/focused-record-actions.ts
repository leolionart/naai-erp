import { formatApiErrorMessage } from "@/lib/api";
import { canSaveAndRecord, type WorkflowCreateCapabilities } from "./solopreneur-create-policy";
import {
  documentActions,
  expenseActions,
  human,
  text,
  type Kind,
  type Row,
  type SourceKind,
} from "./focused-record-shared";

export const DEFAULT_SOLOPRENEUR_RECORD_REASON = "Chủ ghi sổ";

const ROUTINE_LIFECYCLE_ACTIONS = new Set([
  "record",
  "submit",
  "approve",
  "post",
  "capture",
  "validate",
  "verify",
  "issue",
]);

const ELIGIBLE_EXPENSE_RECORD_STATES = new Set([
  "draft",
  "submitted",
  "evidence_pending",
  "approved",
]);

const ELIGIBLE_DOCUMENT_RECORD_STATES: Readonly<Record<string, ReadonlySet<string>>> = {
  purchase_invoice: new Set(["draft", "captured", "verified", "approved"]),
  sales_invoice: new Set(["draft", "validated"]),
  credit_note: new Set(["draft", "validated"]),
};

export function isSolopreneurOwnerMode(capabilities?: WorkflowCreateCapabilities): boolean {
  return canSaveAndRecord(capabilities);
}

export function canRecordInOneClick(
  kind: Kind | SourceKind,
  record?: Row,
  capabilities?: WorkflowCreateCapabilities,
): boolean {
  if (!record || !isSolopreneurOwnerMode(capabilities)) return false;
  if (kind === "recognition") return false;
  const state = text(record, "state");
  if (kind === "expenses") {
    return ELIGIBLE_EXPENSE_RECORD_STATES.has(state);
  }
  const docType = text(record, "type");
  return Boolean(ELIGIBLE_DOCUMENT_RECORD_STATES[docType]?.has(state));
}

export type DetailActionPlan = Readonly<{
  mode: "solopreneur_owner" | "controlled";
  showOneClickRecord: boolean;
  primaryLifecycleActions: readonly string[];
  overflowActions: readonly string[];
  showStandaloneReviewButton: boolean;
  hideMakerCheckerWarning: boolean;
}>;

export function resolveDetailActionPlan(
  kind: Kind,
  record: Row | undefined,
  capabilities?: WorkflowCreateCapabilities,
): DetailActionPlan {
  const state = text(record, "state");
  const docType = text(record, "type");
  const rawActions =
    kind === "documents"
      ? (documentActions[docType]?.[state] ?? [])
      : (expenseActions[state] ?? []);

  if (!isSolopreneurOwnerMode(capabilities)) {
    return {
      mode: "controlled",
      showOneClickRecord: false,
      primaryLifecycleActions: rawActions,
      overflowActions: [],
      showStandaloneReviewButton: kind === "expenses" && Boolean(record),
      hideMakerCheckerWarning: false,
    };
  }

  const secondaryCandidates = rawActions.filter((action) => !ROUTINE_LIFECYCLE_ACTIONS.has(action));
  const overflowActions = [
    ...secondaryCandidates,
    ...(kind === "expenses" && record ? ["review"] : []),
  ];

  return {
    mode: "solopreneur_owner",
    showOneClickRecord: canRecordInOneClick(kind, record, capabilities),
    primaryLifecycleActions: [],
    overflowActions,
    showStandaloneReviewButton: false,
    hideMakerCheckerWarning: true,
  };
}

export function defaultActionReason(
  action?: string,
  capabilities?: WorkflowCreateCapabilities,
): string {
  if (!action) return "";
  if (action === "record") return DEFAULT_SOLOPRENEUR_RECORD_REASON;
  if (ROUTINE_LIFECYCLE_ACTIONS.has(action) && isSolopreneurOwnerMode(capabilities)) {
    return DEFAULT_SOLOPRENEUR_RECORD_REASON;
  }
  return "";
}

export function actionDisplayLabel(action: string): string {
  switch (action) {
    case "record":
      return "Ghi sổ";
    case "mark-evidence-pending":
      return "Đánh dấu thiếu chứng từ";
    case "reject":
      return "Từ chối";
    case "cancel":
      return "Hủy chứng từ";
    case "review":
      return "Review quản trị / thuế";
    default:
      return human(action);
  }
}

export function formatRecordActionError(
  cause: unknown,
  fallback = "Không thể ghi sổ bản nháp.",
): string {
  if (cause && typeof cause === "object" && "details" in cause) {
    const details = (cause as { details?: unknown }).details;
    if (details && typeof details === "object" && "reasons" in details) {
      const reasons = (details as { reasons?: unknown }).reasons;
      if (Array.isArray(reasons) && reasons.length > 0) {
        const messages = reasons
          .map((entry) =>
            entry &&
            typeof entry === "object" &&
            typeof (entry as { message?: unknown }).message === "string"
              ? (entry as { message: string }).message.trim()
              : "",
          )
          .filter(Boolean);
        if (messages.length > 0) return messages.join(" ");
      }
    }
  }
  return formatApiErrorMessage(cause, fallback);
}
