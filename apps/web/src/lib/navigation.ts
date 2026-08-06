export const NAVIGATION_STATUSES = ["available", "preview", "planned"] as const;
export type NavigationStatus = (typeof NAVIGATION_STATUSES)[number];

export type NavigationIcon =
  | "overview"
  | "folder"
  | "ledger"
  | "invoice"
  | "expense"
  | "bank"
  | "report"
  | "customer"
  | "project"
  | "review";

export type NavigationItem = Readonly<{
  key: string;
  label: string;
  href: string;
  description: string;
  icon: NavigationIcon;
  status: NavigationStatus;
  badge?: string;
}>;

export type NavigationGroup = Readonly<{
  key: string;
  label: string;
  items: readonly NavigationItem[];
}>;

export const adminNavigation = [
  {
    key: "workspace",
    label: "Điều hành",
    items: [
      {
        key: "overview",
        label: "Tổng quan",
        href: "/dashboard",
        description: "Tình trạng triển khai và lối tắt vận hành.",
        icon: "overview",
        status: "available",
      },
      {
        key: "customers",
        label: "Khách hàng",
        href: "/customers",
        description: "Hồ sơ khách hàng, hóa đơn đầu ra và công nợ phải thu.",
        icon: "customer",
        status: "available",
      },
      {
        key: "projects",
        label: "Dự án",
        href: "/projects",
        description: "Dự án, khách hàng, ngân sách, chi phí và lợi nhuận liên quan.",
        icon: "project",
        status: "available",
      },
    ],
  },
  {
    key: "data",
    label: "Dữ liệu",
    items: [
      {
        key: "import-review",
        label: "Dữ liệu cần bổ sung",
        href: "/imports/review",
        description:
          "Các dòng workbook cần xác nhận khách hàng, dự án, nhà cung cấp hoặc phân loại.",
        icon: "review",
        status: "available",
        badge: "Review",
      },
    ],
  },
  {
    key: "finance",
    label: "Tài chính",
    items: [
      {
        key: "documents",
        label: "Hóa đơn",
        href: "/documents",
        description: "Hóa đơn đầu ra, đầu vào và credit note.",
        icon: "invoice",
        status: "available",
      },
      {
        key: "expenses",
        label: "Chi phí không hóa đơn",
        href: "/expenses",
        description: "Các khoản chi phí vận hành không đủ dữ liệu để ghi nhận là hóa đơn đầu vào.",
        icon: "expense",
        status: "available",
      },
      {
        key: "receivables",
        label: "Phải thu",
        href: "/receivables",
        description: "Tuổi nợ khách hàng và đối chiếu tài khoản phải thu.",
        icon: "report",
        status: "available",
      },
      {
        key: "payables",
        label: "Phải trả",
        href: "/payables",
        description: "Hạn thanh toán nhà cung cấp và đối chiếu tài khoản phải trả.",
        icon: "report",
        status: "available",
      },
      {
        key: "financial-statements",
        label: "Báo cáo tài chính",
        href: "/reports/financial-statements",
        description: "P&L, Balance Sheet, dòng tiền trực tiếp và đối soát VAT.",
        icon: "report",
        status: "available",
      },
      {
        key: "performance",
        label: "Hiệu suất kế hoạch",
        href: "/reports/performance",
        description: "Actual vs target, MoM, YoY và forecast variance.",
        icon: "report",
        status: "available",
      },
      {
        key: "accountant-exports",
        label: "Xuất dữ liệu kế toán",
        href: "/reports/accountant-exports",
        description: "Snapshot bất biến và file CSV/XLSX bàn giao cho kế toán.",
        icon: "report",
        status: "available",
      },
    ],
  },
] as const satisfies readonly NavigationGroup[];

export function findNavigationItem(
  key: string,
  groups: readonly NavigationGroup[] = adminNavigation,
) {
  for (const group of groups) {
    const item = group.items.find((candidate) => candidate.key === key);
    if (item) return item;
  }
  return undefined;
}

export function isNavigationAvailable(item: NavigationItem) {
  return item.status === "available" || item.status === "preview";
}
