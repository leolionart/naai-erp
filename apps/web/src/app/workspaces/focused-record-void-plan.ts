import type { Row, SourceKind } from "./focused-record-shared";

/**
 * Which "remove a wrong transaction" action the API allows for a record. The rules mirror the
 * backend so the UI offers only what will succeed:
 *  - drafts without a journal are deleted/discarded (no ledger effect to undo);
 *  - issued/posted records are voided by a reversing journal (history is kept, net effect zero);
 *  - records that already have payments cannot be voided until those are unapplied.
 */
export type VoidPlan =
  | Readonly<{
      kind: "delete" | "cancel" | "reverse";
      method: "DELETE" | "POST";
      /** Path suffix relative to `<endpoint>/<id>`. */
      suffix: string;
      versioned: boolean;
      buttonLabel: string;
      title: string;
      description: string;
      success: string;
    }>
  | Readonly<{ kind: "blocked"; message: string }>;

function field(row: Row, key: string) {
  const value = row[key] ?? row[key.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`)];
  return value === undefined || value === null ? "" : String(value);
}

export function voidPlan(source: SourceKind, record: Row): VoidPlan | undefined {
  const state = field(record, "state");
  const hasJournal = Boolean(field(record, "journalId"));
  if (source === "documents") {
    if (state === "draft" && !hasJournal)
      return {
        kind: "delete",
        method: "DELETE",
        suffix: "",
        versioned: true,
        buttonLabel: "Xóa bản nháp",
        title: "Xóa bản nháp chứng từ?",
        description:
          "Bản nháp chưa ghi sổ nên xóa không ảnh hưởng sổ cái. Thao tác được ghi audit và không thể hoàn tác.",
        success: "Đã xóa bản nháp chứng từ.",
      };
    if (["captured", "validated", "verified", "approved"].includes(state) && !hasJournal)
      return {
        kind: "cancel",
        method: "POST",
        suffix: "/cancel",
        versioned: false,
        buttonLabel: "Hủy chứng từ",
        title: "Hủy chứng từ này?",
        description:
          "Chứng từ chưa ghi sổ sẽ chuyển sang trạng thái đã hủy; sổ cái không thay đổi.",
        success: "Đã hủy chứng từ.",
      };
    if (["issued", "posted"].includes(state))
      return {
        kind: "reverse",
        method: "POST",
        suffix: "/reverse",
        versioned: true,
        buttonLabel: "Void (đảo bút toán)",
        title: "Void chứng từ đã ghi sổ?",
        description:
          "Hệ thống tạo bút toán đảo để triệt tiêu ảnh hưởng đến doanh thu, chi phí, VAT và công nợ, rồi chuyển chứng từ sang đã hủy. Lịch sử được giữ nguyên; bút toán gốc không bị xóa.",
        success: "Đã void chứng từ bằng bút toán đảo.",
      };
    if (["partially_paid", "paid"].includes(state))
      return {
        kind: "blocked",
        message:
          "Chứng từ đã có thanh toán/đối soát nên không thể void trực tiếp. Hãy gỡ khớp thanh toán trước, hoặc dùng chức năng sửa & thay thế.",
      };
    return undefined;
  }
  if (source === "expenses") {
    if (state === "draft")
      return {
        kind: "delete",
        method: "DELETE",
        suffix: "",
        versioned: true,
        buttonLabel: "Xóa bản nháp",
        title: "Xóa bản nháp chi phí?",
        description:
          "Bản nháp chưa ghi sổ nên xóa không ảnh hưởng sổ cái. Thao tác được ghi audit và không thể hoàn tác.",
        success: "Đã xóa bản nháp chi phí.",
      };
    if (state === "posted")
      return {
        kind: "reverse",
        method: "POST",
        suffix: "/reverse",
        versioned: true,
        buttonLabel: "Void (đảo bút toán)",
        title: "Void chi phí đã ghi sổ?",
        description:
          "Hệ thống tạo bút toán đảo để triệt tiêu chi phí, VAT và ảnh hưởng quỹ, rồi chuyển chi phí sang đã đảo. Lịch sử được giữ nguyên; bút toán gốc không bị xóa. Không thể void nếu chi phí đã được đối soát ngân hàng.",
        success: "Đã void chi phí bằng bút toán đảo.",
      };
  }
  return undefined;
}
