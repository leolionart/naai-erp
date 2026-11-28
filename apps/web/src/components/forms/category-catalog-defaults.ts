export type DefaultCategoryOption = Readonly<{
  code: string;
  name: string;
  defaultAccount: string;
}>;

export const INBOUND_CATEGORIES: readonly DefaultCategoryOption[] = [
  { code: "SALARY", name: "Chi phí Lương & Thưởng nhân sự", defaultAccount: "642-OPEX" },
  {
    code: "FREELANCE_OUTSOURCE",
    name: "Chi phí Cộng tác viên & Gia công dự án",
    defaultAccount: "642-OPEX",
  },
  {
    code: "PROJECT_COMMISSION",
    name: "Chi phí Hoa hồng & CTV dự án",
    defaultAccount: "642-OPEX",
  },
  { code: "MEAL", name: "Chi phí Ăn uống / Tiếp khách", defaultAccount: "642-OPEX" },
  { code: "OFFICE_SUPPLIES", name: "Chi phí Văn phòng phẩm / Vật tư", defaultAccount: "642-OPEX" },
  { code: "INTERNET_TELECOM", name: "Chi phí Internet / Điện thoại", defaultAccount: "642-OPEX" },
  { code: "ELECTRICITY_WATER", name: "Chi phí Điện / Nước", defaultAccount: "642-OPEX" },
  { code: "ELECTRONIC_EQUIP", name: "Chi phí Thiết bị điện tử", defaultAccount: "642-OPEX" },
  { code: "SERVER_CLOUD", name: "Chi phí Máy chủ / Cloud Services", defaultAccount: "642-OPEX" },
  { code: "DOMAIN_HOSTING", name: "Chi phí Tên miền / Hosting", defaultAccount: "642-OPEX" },
  { code: "VEHICLE_RENTAL", name: "Chi phí Thuê xe / Thuê pin sạc", defaultAccount: "642-OPEX" },
  { code: "DECORATION", name: "Chi phí Trang trí văn phòng", defaultAccount: "642-OPEX" },
  { code: "DEPOSIT_REFUND", name: "Chi phí Hoàn tiền cọc / Đặt cọc", defaultAccount: "642-OPEX" },
  {
    code: "COMPANY_ADMIN_FEE",
    name: "Chi phí Hành chính & Pháp lý công ty",
    defaultAccount: "642-OPEX",
  },
  {
    code: "STAFF_CLIENT_WELFARE",
    name: "Chi phí Phúc lợi nhân sự & Quà tặng KH",
    defaultAccount: "642-OPEX",
  },
  { code: "TAX", name: "Chi phí Thuế & Phí nhà nước", defaultAccount: "642-OPEX" },
  { code: "OWNER_DRAWING", name: "Chi tiêu cá nhân chủ sở hữu", defaultAccount: "642-OPEX" },
  { code: "ACCOUNTING_SERVICES", name: "Chi phí dịch vụ kế toán", defaultAccount: "642-OPEX" },
  { code: "OTHER_EXPENSE", name: "Chi phí mua vào khác", defaultAccount: "642-OPEX" },
] as const;

export const OUTBOUND_CATEGORIES: readonly DefaultCategoryOption[] = [
  { code: "SOFTWARE_DEV", name: "Doanh thu Phát triển phần mềm / App", defaultAccount: "5113" },
  { code: "WEB", name: "Doanh thu Thiết kế và phát triển web", defaultAccount: "5113" },
  { code: "CONSULTING", name: "Doanh thu Dịch vụ tư vấn / Giải pháp", defaultAccount: "5113" },
  { code: "DESIGN_MEDIA", name: "Doanh thu Thiết kế / Truyền thông", defaultAccount: "5113" },
  {
    code: "SYSTEM_MAINTENANCE",
    name: "Doanh thu Bảo trì / Vận hành hệ thống",
    defaultAccount: "5113",
  },
  { code: "PRODUCT_SALES", name: "Doanh thu Bán hàng hóa / Thiết bị", defaultAccount: "5111" },
  { code: "RETAINER_FEE", name: "Doanh thu Phí Retainer hàng tháng", defaultAccount: "5113" },
  { code: "OTHER_REVENUE", name: "Doanh thu bán ra khác", defaultAccount: "5113" },
] as const;

export function buildCategoryNameLookup(
  ...catalogs: readonly (readonly Record<string, unknown>[])[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const list of catalogs) {
    for (const item of list) {
      const code = String(item.code ?? "").trim();
      const name = String(item.name ?? item.displayName ?? item.display_name ?? "").trim();
      if (code && name && !map[code]) {
        map[code] = name;
      }
    }
  }
  return map;
}

export function getCategoryName(
  categoryCode?: string,
  liveLookup?: Readonly<Record<string, string>>,
): string {
  if (!categoryCode) return "";
  const fromLive = liveLookup?.[categoryCode];
  if (fromLive) return fromLive;
  const inboundMatch = INBOUND_CATEGORIES.find((c) => c.code === categoryCode);
  if (inboundMatch) return inboundMatch.name;
  const outboundMatch = OUTBOUND_CATEGORIES.find((c) => c.code === categoryCode);
  if (outboundMatch) return outboundMatch.name;
  return categoryCode;
}
