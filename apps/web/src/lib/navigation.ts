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
      {
        key: "executive-metrics",
        label: "Chỉ số điều hành (BETA)",
        href: "/reports/executive-metrics",
        description: "Báo cáo dòng tiền, ROI, khả năng sinh lời và chỉ số sức khỏe doanh nghiệp.",
        icon: "overview",
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
        label: "Doanh thu & Chi phí",
        description: "Quản lý toàn bộ hoạt động doanh thu và chi phí, có hoặc chưa có hóa đơn.",
        icon: "invoice",
        status: "available",
        children: [
          {
            key: "sales-documents",
            label: "Quản lý doanh thu",
            href: "/documents",
            description: "Hoạt động đã xuất hóa đơn và doanh thu đã ghi nhận chưa có hóa đơn.",
            status: "available",
          },
          {
            key: "purchase-documents",
            label: "Quản lý chi phí",
            href: "/expenses",
            description: "Hóa đơn mua vào và mọi chi phí chưa có hóa đơn trong một listing.",
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
  {
    key: "banking_and_ledger",
    label: "Ngân hàng & Sổ cái",
    items: [
      {
        key: "banking",
        label: "Tiền mặt & Ngân hàng",
        description: "Quản lý dòng tiền, giao dịch và đối soát tài khoản.",
        icon: "bank",
        status: "available",
        children: [
          {
            key: "bank-accounts",
            label: "Tài khoản & Giao dịch",
            href: "/banking",
            description: "Số dư tài khoản và lịch sử giao dịch ngân hàng.",
            status: "available",
          },
          {
            key: "internal-transfers",
            label: "Chuyển tiền nội bộ",
            href: "/banking/internal-transfers",
            description: "Chuyển tiền giữa các tài khoản ngân hàng và quỹ tiền mặt.",
            status: "available",
          },
          {
            key: "statements",
            label: "Kiểm soát sao kê",
            href: "/banking/statements",
            description: "Kiểm soát số dư, import báo cáo và ngoại lệ trước khi đóng kỳ.",
            status: "available",
          },
        ],
      },
      {
        key: "ledger",
        label: "Sổ cái kế toán",
        description: "Lịch sử bút toán và hạch toán kế toán chi tiết.",
        icon: "ledger",
        status: "available",
        children: [
          {
            key: "journals",
            label: "Bút toán & Sổ nhật ký",
            href: "/accounting/journals",
            description: "Danh sách toàn bộ bút toán kế toán đã ghi nhận.",
            status: "available",
          },
        ],
      },
    ],
  },
  {
    key: "data_and_system",
    label: "Dữ liệu & Cấu hình",
    items: [
      {
        key: "master-data",
        label: "Danh mục hệ thống",
        href: "/settings/master-data",
        description: "Cấu hình tài khoản, mã thuế, phòng ban, và danh mục chuẩn.",
        icon: "folder",
        status: "available",
      },
      {
        key: "portable-data-package",
        label: "Sao lưu & nhập lại ERP",
        href: "/settings/data-package",
        description: "Export toàn bộ dữ liệu ERP ra XLSX và nhập lại có kiểm soát.",
        icon: "folder",
        status: "available",
      },
      {
        key: "accountant-exports",
        label: "Xuất dữ liệu kế toán",
        href: "/reports/accountant-exports",
        description: "Xuất khẩu file Excel chứng từ để gửi dịch vụ kế toán thuế.",
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
