export type OperatingMode = "controlled" | "solopreneur";

export type OperatingModeInfo = Readonly<{
  label: string;
  short: string;
  description: string;
}>;

/** Human wording for the organization's operating mode, shown in the app header. */
export function describeOperatingMode(mode: string | undefined): OperatingModeInfo | undefined {
  if (mode === "solopreneur")
    return {
      label: "Doanh nghiệp một người",
      short: "Một người",
      description:
        "Chủ sở hữu tự duyệt và có thể 'Lưu và ghi nhận' để ghi sổ ngay. Dữ liệu đẩy vào bằng tài khoản tích hợp (n8n/API không phải chủ sở hữu) vẫn là bản nháp, cần chủ sở hữu ghi sổ. Bản đồ báo cáo và mã thuế nháp vẫn được dùng.",
    };
  if (mode === "controlled")
    return {
      label: "Kiểm soát",
      short: "Kiểm soát",
      description:
        "Cần người duyệt khác người lập (hoặc ngưỡng tự duyệt); chứng từ đi qua các bước nháp → duyệt → ghi sổ. Bản đồ báo cáo và mã thuế phải được duyệt trước khi dùng.",
    };
  return undefined;
}
