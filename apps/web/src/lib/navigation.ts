export const NAVIGATION_STATUSES = ["available", "preview", "planned"] as const;
export type NavigationStatus = (typeof NAVIGATION_STATUSES)[number];

export type NavigationIcon =
  | "overview"
  | "folder"
  | "ledger"
  | "invoice"
  | "expense"
  | "evidence"
  | "inbox"
  | "bank"
  | "project"
  | "forecast"
  | "report"
  | "settings";

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
        key: "master-data",
        label: "Dữ liệu nền",
        href: "/settings/master-data",
        description: "Tài khoản, thuế, dimensions, parties và dự án.",
        icon: "folder",
        status: "available",
      },
    ],
  },
  {
    key: "finance",
    label: "Tài chính",
    items: [
      {
        key: "ledger",
        label: "Sổ kế toán",
        href: "/accounting/journals",
        description: "Journal, kỳ kế toán, Trial Balance và General Ledger.",
        icon: "ledger",
        status: "available",
      },
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
        label: "Chi phí",
        href: "/expenses",
        description: "Chi phí, hoàn ứng và review quản trị/CIT/VAT.",
        icon: "expense",
        status: "available",
      },
      {
        key: "banking",
        label: "Ngân hàng & tiền mặt",
        href: "/banking",
        description: "Tài khoản tiền, import và reconciliation.",
        icon: "bank",
        status: "available",
      },
      {
        key: "receivables",
        label: "Công nợ",
        href: "/receivables",
        description: "Tuổi nợ phải thu, phải trả và đối chiếu tài khoản kiểm soát.",
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
        key: "executive-metrics",
        label: "Chỉ số điều hành",
        href: "/reports/executive-metrics",
        description: "Equity consumed, burn, runway, ROS, ROE, ROA và ROI theo mục đích.",
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
  {
    key: "operations",
    label: "Vận hành",
    items: [
      {
        key: "evidence",
        label: "Chứng từ",
        href: "/evidence",
        description: "Phiên bản file, review và signed download.",
        icon: "evidence",
        status: "available",
      },
      {
        key: "integrations",
        label: "Tích hợp",
        href: "/integrations/inbound",
        description: "Inbound inbox và outbound delivery controls.",
        icon: "inbox",
        status: "available",
      },
      {
        key: "projects",
        label: "Dự án",
        href: "/projects",
        description: "Timesheet, ngân sách và profitability.",
        icon: "project",
        status: "planned",
      },
      {
        key: "timesheets",
        label: "Thời gian",
        href: "/timesheets",
        description: "Timesheet, approval và năng lực khả dụng.",
        icon: "project",
        status: "available",
      },
      {
        key: "cost-rates",
        label: "Chi phí nhân sự",
        href: "/settings/cost-rates",
        description: "Phiên bản cost rate có hiệu lực và kiểm soát truy cập.",
        icon: "settings",
        status: "available",
      },
      {
        key: "project-costs",
        label: "Chi phí dự án",
        href: "/project-costs/unallocated",
        description: "Phân bổ direct cost và drill-down chi phí theo dự án.",
        icon: "project",
        status: "available",
      },
      {
        key: "project-revenue",
        label: "Ngân sách & doanh thu",
        href: "/revenue-recognition",
        description: "Budget, scope change, milestone và revenue recognition.",
        icon: "forecast",
        status: "available",
      },
      {
        key: "overhead",
        label: "Phân bổ overhead",
        href: "/overhead/runs",
        description: "Policy, source pool và allocation run có kiểm soát.",
        icon: "report",
        status: "available",
      },
    ],
  },
  {
    key: "planning",
    label: "Kế hoạch",
    items: [
      {
        key: "forecast",
        label: "Dự báo",
        href: "/forecast",
        description: "Target, scenario và doanh thu dự kiến.",
        icon: "forecast",
        status: "available",
      },
      {
        key: "forecast-composition",
        label: "Dự báo dòng tiền",
        href: "/forecast/composition",
        description: "Cấu phần doanh thu, chi phí và projected closing cash.",
        icon: "forecast",
        status: "available",
      },
      {
        key: "reports",
        label: "Lợi nhuận dự án",
        href: "/reports/project-profitability",
        description: "Gross, contribution và fully loaded margin theo dự án.",
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
