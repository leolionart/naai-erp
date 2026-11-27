/** Per-organization delivery target resolved from the in-app settings (token already decrypted). */
export type TelegramTarget = Readonly<{
  botToken: string;
  chatId: string;
  threadId?: number;
}>;

/** A posted journal or draft reduced to the revenue/expense effect worth notifying about. */
export type JournalNotification = Readonly<{
  organizationId: string;
  organizationName?: string;
  eventId: string;
  attempt: number;
  /** Undefined when the stored token cannot be decrypted. */
  target: TelegramTarget | undefined;
  journalId: string;
  journalDate: string;
  description: string;
  currency: string;
  revenueMinor: bigint;
  expenseMinor: bigint;
  /** True for a record created as a draft (not yet in the ledger); `journalId` is then its id. */
  draft?: boolean;
  action?: "created" | "updated" | "deleted" | "reversed" | "cancelled";
  reason?: string;
  reference?: string;
  party?: string;
  funding?: string;
}>;

const FUNDING_LABELS: Readonly<Record<string, string>> = {
  "3388-OWNER": "Chủ doanh nghiệp chi hộ (TK 3388)",
  "111-CASH": "Quỹ tiền mặt công ty",
  "111-CUSTODY": "Tiền công ty chủ giữ hộ",
  "331-AP": "Công nợ phải trả (TK 331)",
  "131-AR": "Công nợ phải thu (TK 131)",
  "112-BANK": "Tài khoản ngân hàng",
  "1121": "Tài khoản ngân hàng",
};

const DOC_TYPE_LABELS: Readonly<Record<string, string>> = {
  purchase_invoice: "Hóa đơn mua",
  sales_invoice: "Hóa đơn bán",
  credit_note: "Phiếu giảm trừ",
};

export function formatFundingDisplay(
  accountCode?: string | null,
  accountName?: string | null,
): string | undefined {
  if (accountName?.trim()) return accountName.trim();
  const code = accountCode?.trim();
  if (!code) return undefined;
  return FUNDING_LABELS[code] ?? code;
}

export function formatDocumentReference(
  type?: string | null,
  number?: string | null,
): string | undefined {
  const docNumber = number?.trim();
  if (!docNumber) return undefined;
  const label = type ? DOC_TYPE_LABELS[type] : undefined;
  return label ? `${label} ${docNumber}` : docNumber;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatMinor(minor: bigint, currency: string) {
  const exponent = currency === "VND" ? 0 : 2;
  const divisor = 10n ** BigInt(exponent);
  const whole = (minor < 0n ? -minor : minor) / divisor;
  const fraction = (minor < 0n ? -minor : minor) % divisor;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const text = exponent ? `${grouped},${fraction.toString().padStart(exponent, "0")}` : grouped;
  return `${minor < 0n ? "-" : ""}${text} ${currency}`;
}

function actionLabel(kind: "revenue" | "expense", notification: JournalNotification): string {
  const action = notification.action ?? "created";
  const draft = notification.draft === true;
  if (action === "deleted") {
    return kind === "revenue" ? "Đã xóa bản nháp doanh thu" : "Đã xóa bản nháp chi phí";
  }
  if (action === "reversed" || action === "cancelled") {
    return kind === "revenue" ? "Đã hủy / đảo sổ doanh thu" : "Đã hủy / đảo sổ chi phí";
  }
  if (action === "updated") {
    return kind === "revenue"
      ? draft
        ? "Đã sửa doanh thu (bản nháp)"
        : "Đã sửa doanh thu"
      : draft
        ? "Đã sửa chi phí (bản nháp)"
        : "Đã sửa chi phí";
  }
  return kind === "revenue"
    ? draft
      ? "Đã thêm doanh thu (bản nháp, chưa ghi sổ)"
      : "Doanh thu ghi nhận"
    : draft
      ? "Đã thêm chi phí (bản nháp, chưa ghi sổ)"
      : "Chi phí ghi nhận";
}

export function formatTelegramMessage(notification: JournalNotification): string {
  const lines: string[] = [];
  if (notification.revenueMinor !== 0n)
    lines.push(
      `💰 <b>${actionLabel("revenue", notification)}:</b> ${escapeHtml(formatMinor(notification.revenueMinor, notification.currency))}`,
    );
  if (notification.expenseMinor !== 0n)
    lines.push(
      `💸 <b>${actionLabel("expense", notification)}:</b> ${escapeHtml(formatMinor(notification.expenseMinor, notification.currency))}`,
    );
  lines.push(`📅 ${escapeHtml(notification.journalDate)}`);
  if (notification.reference) lines.push(`🧾 ${escapeHtml(notification.reference)}`);
  if (notification.party) lines.push(`👤 ${escapeHtml(notification.party)}`);
  if (notification.funding) lines.push(`💳 ${escapeHtml(notification.funding)}`);
  if (notification.description)
    lines.push(`📝 ${escapeHtml(notification.description.slice(0, 300))}`);
  if (notification.reason) lines.push(`📌 ${escapeHtml(notification.reason.slice(0, 200))}`);
  lines.push(`🏢 ${escapeHtml(notification.organizationName || notification.organizationId)}`);
  return lines.join("\n");
}
