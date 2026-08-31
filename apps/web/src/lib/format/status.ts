const STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: "Bản nháp",
  submitted: "Đã gửi duyệt",
  evidence_pending: "Chờ chứng từ",
  validated: "Đã kiểm tra",
  verified: "Đã xác minh",
  approved: "Đã duyệt",
  issued: "Đã phát hành",
  posted: "Đã vào sổ",
  partially_paid: "Thanh toán một phần",
  paid: "Đã thanh toán",
  reversed: "Đã đảo",
  active: "Đang hoạt động",
  in_progress: "Đang thực hiện",
  completed: "Hoàn thành",
  inactive: "Ngừng hoạt động",
  pending: "Đang chờ",
  review: "Cần review",
  review_required: "Cần review",
  unreviewed: "Chưa review",
  eligible: "Đủ điều kiện",
  partially_eligible: "Đủ điều kiện một phần",
  ineligible: "Không đủ điều kiện",
  accountant_override: "Kế toán ghi đè",
  retry_scheduled: "Chờ thử lại",
  quarantined: "Cần xử lý",
  needs_review: "Cần xem xét",
  rejected: "Đã từ chối",
  dead_letter: "Hết lượt thử",
  delivered: "Đã gửi",
  failed: "Thất bại",
  imported: "Đã nhập",
  suggested: "Đã gợi ý",
  matched: "Đã khớp",
  reconciled: "Đã đối soát",
  ignored: "Đã bỏ qua",
  candidate: "Có candidate",
  pending_counterpart: "Chờ đối ứng",
  unmatched: "Đã hủy ghép",
};

export type StatusTone = "ready" | "warning" | "error" | "muted" | "info";

export function normalizeStatus(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function formatStatus(value: string | null | undefined): string {
  if (!value) return "—";
  const normalized = normalizeStatus(value);
  return STATUS_LABELS[normalized] ?? normalized.replaceAll("_", " ");
}

export function statusTone(value: string | null | undefined): StatusTone {
  const status = normalizeStatus(value ?? "");
  if (
    [
      "approved",
      "issued",
      "posted",
      "paid",
      "active",
      "completed",
      "delivered",
      "verified",
      "reconciled",
      "eligible",
      "accountant_override",
    ].includes(status)
  )
    return "ready";
  if (
    [
      "pending",
      "submitted",
      "evidence_pending",
      "partially_paid",
      "retry_scheduled",
      "needs_review",
      "review",
      "review_required",
      "unreviewed",
      "partially_eligible",
      "suggested",
      "matched",
      "in_progress",
    ].includes(status)
  )
    return "warning";
  if (
    ["rejected", "quarantined", "dead_letter", "failed", "inactive", "ineligible"].includes(status)
  )
    return "error";
  if (["draft", "reversed", "imported", "ignored"].includes(status)) return "muted";
  return "info";
}
