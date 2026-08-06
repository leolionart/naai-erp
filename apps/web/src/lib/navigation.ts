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
    label: "Điều hành Studio",
    items: [
      {
        key: "overview",
        label: "Tổng quan",
        href: "/dashboard",
        description: "Dòng tiền thực tế & Ước tính Thuế TNDN tạm tính.",
        icon: "overview",
        status: "available",
      },
      {
        key: "projects",
        label: "Dự án & Ngân sách",
        href: "/projects",
        description: "Doanh thu hợp đồng, chi phí server/freelancer và lợi nhuận từng dự án.",
        icon: "project",
        status: "available",
      },
      {
        key: "customers",
        label: "Khách hàng",
        href: "/customers",
        description: "Hồ sơ đối tác, dự án và lịch sử doanh thu.",
        icon: "customer",
        status: "available",
      },
    ],
  },
  {
    key: "finance",
    label: "Chứng từ & Quản lý Thuế",
    items: [
      {
        key: "documents",
        label: "Hóa đơn & Chi phí",
        description: "Quản lý hóa đơn bán ra (đầu ra) và chi phí mua vào (đầu vào).",
        icon: "invoice",
        status: "available",
        children: [
          {
            key: "sales-documents",
            label: "Hóa đơn đầu ra (Bán)",
            href: "/documents?type=sales_invoice",
            description: "Doanh thu và hóa đơn bán ra xuất cho khách hàng.",
            status: "available",
          },
          {
            key: "purchase-documents",
            label: "Hóa đơn đầu vào (Mua)",
            href: "/documents?type=purchase_invoice",
            description: "Chi phí mua hàng, server, thiết bị có hóa đơn hợp lệ.",
            status: "available",
          },
        ],
      },
      {
        key: "debt",
        label: "Công nợ",
        description: "Theo dõi tiền khách chưa trả và tiền nợ nhà cung cấp.",
        icon: "report",
        status: "available",
        children: [
          {
            key: "receivables",
            label: "Phải thu (Khách nợ)",
            href: "/receivables",
            description: "Danh sách khách hàng còn nợ tiền.",
            status: "available",
          },
          {
            key: "payables",
            label: "Phải trả (Nợ nhà CC)",
            href: "/payables",
            description: "Hạn thanh toán cho nhà cung cấp.",
            status: "available",
          },
        ],
      },
      {
        key: "financial-statements",
        label: "Báo cáo Thuế & Kế toán",
        description: "Kết quả kinh doanh và dữ liệu xuất cho đơn vị làm dịch vụ kế toán.",
        icon: "report",
        status: "available",
        children: [
          {
            key: "profit-and-loss",
            label: "Kết quả kinh doanh",
            href: "/reports/financial-statements/profit-and-loss/current",
            description: "Doanh thu, chi phí và lợi nhuận thực tế.",
            status: "available",
          },
          {
            key: "vat-reconciliation",
            label: "Đối soát Thuế GTGT (VAT)",
            href: "/reports/tax/vat-reconciliation/current",
            description: "VAT đầu ra, VAT đầu vào được khấu trừ.",
            status: "available",
          },
          {
            key: "tax-expense-review",
            label: "Chi phí rà soát Thuế (CIT)",
            href: "/reports/tax/expense-exceptions",
            description: "Cảnh báo các khoản chi chưa có hóa đơn hợp lệ.",
            status: "available",
          },
        ],
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
