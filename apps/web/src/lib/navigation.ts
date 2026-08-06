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
  href?: string;
  description: string;
  icon: NavigationIcon;
  status: NavigationStatus;
  badge?: string;
  children?: readonly NavigationChild[];
}>;

export type NavigationChild = Readonly<{
  key: string;
  label: string;
  href: string;
  description: string;
  status: NavigationStatus;
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
        description: "Giao dịch đầu ra và đầu vào; tình trạng có hóa đơn là bộ lọc dữ liệu.",
        icon: "invoice",
        status: "available",
        children: [
          {
            key: "sales-documents",
            label: "Đầu ra",
            href: "/documents?type=sales_invoice",
            description: "Doanh thu và hóa đơn bán ra.",
            status: "available",
          },
          {
            key: "purchase-documents",
            label: "Đầu vào",
            href: "/documents?type=purchase_invoice",
            description: "Chi phí, mua hàng và hóa đơn đầu vào.",
            status: "available",
          },
        ],
      },
      {
        key: "debt",
        label: "Công nợ",
        description: "Theo dõi công nợ khách hàng và nhà cung cấp.",
        icon: "report",
        status: "available",
        children: [
          {
            key: "receivables",
            label: "Phải thu",
            href: "/receivables",
            description: "Tuổi nợ khách hàng và đối chiếu tài khoản phải thu.",
            status: "available",
          },
          {
            key: "payables",
            label: "Phải trả",
            href: "/payables",
            description: "Hạn thanh toán nhà cung cấp và đối chiếu tài khoản phải trả.",
            status: "available",
          },
        ],
      },
      {
        key: "financial-statements",
        label: "Báo cáo tài chính",
        description: "P&L, Balance Sheet, dòng tiền trực tiếp và đối soát VAT.",
        icon: "report",
        status: "available",
        children: [
          {
            key: "profit-and-loss",
            label: "Kết quả kinh doanh",
            href: "/reports/financial-statements/profit-and-loss/current",
            description: "Doanh thu, chi phí và lợi nhuận.",
            status: "available",
          },
          {
            key: "balance-sheet",
            label: "Bảng cân đối kế toán",
            href: "/reports/financial-statements/balance-sheet/today",
            description: "Tài sản, nợ phải trả và vốn chủ sở hữu.",
            status: "available",
          },
          {
            key: "cash-flow",
            label: "Lưu chuyển tiền tệ",
            href: "/reports/financial-statements/cash-flow/current",
            description: "Dòng tiền operating, investing và financing.",
            status: "available",
          },
          {
            key: "vat-reconciliation",
            label: "Đối soát VAT",
            href: "/reports/tax/vat-reconciliation/current",
            description: "VAT đầu ra, đầu vào và điều kiện khấu trừ.",
            status: "available",
          },
          {
            key: "tax-expense-review",
            label: "Chi phí cần rà soát thuế",
            href: "/reports/tax/expense-exceptions",
            description: "Các khoản cần bổ sung chứng từ hoặc xác định điều kiện thuế.",
            status: "available",
          },
        ],
      },
      {
        key: "performance",
        label: "Hiệu suất kế hoạch",
        href: "/reports/performance",
        description: "Actual vs target, MoM, YoY và forecast variance.",
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
    for (const candidate of group.items) {
      const child = candidate.children?.find((entry) => entry.key === key);
      if (child) return child;
    }
  }
  return undefined;
}

export function isNavigationAvailable(item: NavigationItem | NavigationChild) {
  return item.status === "available" || item.status === "preview";
}
