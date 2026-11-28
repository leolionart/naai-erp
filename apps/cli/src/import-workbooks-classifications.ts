import { createHash } from "node:crypto";
import type { ExpenseCategoryInference, ImportedParty } from "./import-workbooks-types.js";

export const REVIEWED_SALES_PROJECT_ROWS = new Map<number, number>([
  [5, 9],
  [21, 7],
  [22, 18],
  [33, 7],
  [39, 7],
]);

const normalizeForInference = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi");

const compactIdentity = (value: string) =>
  normalizeForInference(value)
    .replace(/[^a-z0-9]/g, "")
    .trim();

const reviewedPartyIdentityAliases = new Map<string, string>([
  ["wata tech", "watatek"],
  ["watatek", "watatek"],
]);

export const canonicalPartyIdentityKey = (name: string) => {
  const normalized = normalizeForInference(name).trim().replace(/\s+/g, " ");
  return reviewedPartyIdentityAliases.get(normalized) ?? normalized;
};

const reviewedServiceLineAliases = new Map<string, string>([
  ["web", "WEB"],
  ["website", "WEB"],
  ["webapp", "WEB"],
  ["webapplication", "WEB"],
  ["websitedesign", "WEB"],
  ["webdevelopment", "WEB"],
  ["websitedevelopment", "WEB"],
  ["thietkewebsite", "WEB"],
  ["phattrienwebsite", "WEB"],
  ["thietkephattrienwebsite", "WEB"],
]);

export const inferReviewedProjectServiceLine = (
  labels: readonly string[],
): Readonly<{ code: string | null; reviewFlag: string | null }> => {
  const nonblank = labels.map((label) => label.trim()).filter(Boolean);
  const matches = new Set(
    nonblank
      .map((label) => reviewedServiceLineAliases.get(compactIdentity(label)))
      .filter((code): code is string => Boolean(code)),
  );
  if (matches.size === 1) return { code: [...matches][0]!, reviewFlag: null };
  if (matches.size > 1) return { code: null, reviewFlag: "ambiguous_service_line" };
  return {
    code: null,
    reviewFlag: nonblank.length > 0 ? "unmapped_service_line" : "missing_service_line",
  };
};

const expenseCategoryRules: readonly Readonly<{
  code: string;
  label: string;
  patterns: readonly string[];
}>[] = [
  { code: "PAYROLL", label: "Lương và nhân sự", patterns: ["luong", "freelance"] },
  { code: "BONUS", label: "Thưởng", patterns: [] },
  {
    code: "MEALS_ENTERTAINMENT",
    label: "Ăn uống và tiếp khách",
    patterns: ["nha hang", "an uong", "pizza", "bbq", "kichi", "mcd premium", "golden gate"],
  },
  {
    code: "EV_BATTERY_CHARGING",
    label: "Thuê pin và sạc xe điện",
    patterns: ["thue pin", "vinfast", "v-green", "tram sac"],
  },
  {
    code: "INTERNET_TELECOM",
    label: "Internet và viễn thông",
    patterns: ["internet", "vien thong fpt"],
  },
  {
    code: "ELECTRONICS_EQUIPMENT",
    label: "Thiết bị điện tử",
    patterns: ["thiet bi dien tu", "dien thoai di dong", "mobile", "macstore", "dien may xanh"],
  },
  {
    code: "ELECTRICITY_UTILITIES",
    label: "Điện và tiện ích",
    patterns: ["tien dien", "dien luc"],
  },
  {
    code: "TAXES_FEES",
    label: "Thuế và phí",
    patterns: ["thue & phi", "thue mon bai", "nop thue", "tien phat"],
  },
  {
    code: "CASH_TRANSFER",
    label: "Tiền mặt và điều chuyển",
    patterns: ["rut tien mat", "so tiet kiem"],
  },
  {
    code: "OFFICE_FURNISHINGS",
    label: "Trang trí và nội thất văn phòng",
    patterns: ["trang tri van phong", "noi that"],
  },
  {
    code: "DOMAIN_SOFTWARE",
    label: "Tên miền và phần mềm",
    patterns: ["mua domain", "p.a viet nam"],
  },
  {
    code: "CLOUD_DIGITAL_SERVICES",
    label: "Máy chủ và dịch vụ số",
    patterns: ["dich vu may chu", "freepik", "giza network"],
  },
  { code: "DEPOSIT_REFUND", label: "Hoàn tiền đặt cọc", patterns: ["hoan tien coc"] },
  { code: "TRAVEL_TRANSPORT", label: "Đi lại và vận chuyển", patterns: ["vexere", "vjs viet nam"] },
  {
    code: "HEALTH_WELLNESS",
    label: "Y tế và chăm sóc sức khỏe",
    patterns: ["y te", "tham my", "medical"],
  },
  { code: "SPORTS_RECREATION", label: "Thể thao và phúc lợi", patterns: ["vnb sports", "hinoko"] },
];

export const inferExpenseCategory = (
  expenseType: string,
  note: string,
): ExpenseCategoryInference => {
  const originalType = expenseType.toLocaleLowerCase("vi");
  const originalNote = note.toLocaleLowerCase("vi");
  if (originalType.includes("thưởng") || originalNote.includes("thưởng"))
    return {
      code: "BONUS",
      label: "Thưởng",
      source: originalType.includes("thưởng") ? "expense_type" : "note",
    };
  const normalizedType = normalizeForInference(expenseType);
  const normalizedNote = normalizeForInference(note);
  for (const rule of expenseCategoryRules) {
    if (normalizedType && rule.patterns.some((pattern) => normalizedType.includes(pattern)))
      return { code: rule.code, label: rule.label, source: "expense_type" };
  }
  for (const rule of expenseCategoryRules) {
    if (rule.patterns.some((pattern) => normalizedNote.includes(pattern)))
      return { code: rule.code, label: rule.label, source: "note" };
  }
  return { code: "OTHER_OPERATING", label: "Chi phí vận hành khác", source: "fallback" };
};

const declaredExpenseCategories: Record<string, { code: string; label: string }> = {
  PAYROLL: { code: "SALARY", label: "Chi phí Lương & Thưởng nhân sự" },
  BONUS: { code: "SALARY", label: "Chi phí Lương & Thưởng nhân sự" },
  MEALS_ENTERTAINMENT: { code: "MEAL", label: "Chi phí Ăn uống / Tiếp khách" },
  EV_BATTERY_CHARGING: { code: "VEHICLE_RENTAL", label: "Chi phí Thuê xe / Thuê pin sạc" },
  INTERNET_TELECOM: { code: "INTERNET_TELECOM", label: "Chi phí Internet / Điện thoại" },
  ELECTRICITY_UTILITIES: { code: "ELECTRICITY_WATER", label: "Chi phí Điện / Nước" },
  ELECTRONICS_EQUIPMENT: { code: "ELECTRONIC_EQUIP", label: "Chi phí Thiết bị điện tử" },
  TAXES_FEES: { code: "TAX", label: "Chi phí Thuế & Phí nhà nước" },
  OFFICE_FURNISHINGS: { code: "DECORATION", label: "Chi phí Trang trí văn phòng" },
  DOMAIN_SOFTWARE: { code: "DOMAIN_HOSTING", label: "Chi phí Tên miền / Hosting" },
  CLOUD_DIGITAL_SERVICES: { code: "SERVER_CLOUD", label: "Chi phí Máy chủ / Cloud Services" },
  DEPOSIT_REFUND: { code: "DEPOSIT_REFUND", label: "Chi phí Hoàn tiền cọc / Đặt cọc" },
  CASH_TRANSFER: { code: "OTHER_EXPENSE", label: "Chi phí mua vào khác" },
  TRAVEL_TRANSPORT: { code: "OTHER_EXPENSE", label: "Chi phí mua vào khác" },
  HEALTH_WELLNESS: { code: "OTHER_EXPENSE", label: "Chi phí mua vào khác" },
  SPORTS_RECREATION: { code: "OTHER_EXPENSE", label: "Chi phí mua vào khác" },
  OTHER_OPERATING: { code: "OTHER_EXPENSE", label: "Chi phí mua vào khác" },
};

export const declaredExpenseCategory = (category: ExpenseCategoryInference) =>
  declaredExpenseCategories[category.code] ?? category;

export const inferSupplier = (
  personnel: string,
  note: string,
  categoryCode: string,
): Readonly<{
  name: string | null;
  source: "personnel" | "note" | "category_default" | "unresolved";
}> => {
  if (personnel.trim()) return { name: personnel.trim(), source: "personnel" };
  const noteLines = note
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const supplierLines: string[] = [];
  for (const line of noteLines) {
    if (/^-{3,}$/.test(line) || /^\s*[\d.,]+\s*(vnd|eur|€)?\s*$/iu.test(line)) break;
    supplierLines.push(line);
  }
  if (supplierLines.length > 0) return { name: supplierLines.join(" "), source: "note" };
  if (categoryCode === "TAXES_FEES") return { name: "Cơ quan thuế", source: "category_default" };
  return { name: null, source: "unresolved" };
};

export const createWorkbookPartyRegistry =
  (parties: Map<string, ImportedParty>) => (name: string, role: "client" | "supplier") => {
    const normalized = name.trim() || (role === "client" ? "Generic Client" : "Generic Supplier");
    const identityKey = canonicalPartyIdentityKey(normalized);
    const id = `party-${createHash("sha256").update(identityKey).digest("hex").slice(0, 24)}`;
    const current = parties.get(id);
    if (current && !current.roles.includes(role)) current.roles.push(role);
    else if (!current)
      parties.set(id, {
        id,
        displayName: normalized,
        normalizedTaxId: null,
        status: "active",
        roles: [role],
      });
    return id;
  };
