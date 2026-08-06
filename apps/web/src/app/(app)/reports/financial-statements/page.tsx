import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  Landmark,
  ReceiptText,
  Scale,
  WalletCards,
} from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const reports = [
  {
    title: "Báo cáo kết quả kinh doanh",
    description: "Doanh thu, direct cost, gross profit, OPEX và lợi nhuận trên accrual basis.",
    href: "/reports/financial-statements/profit-and-loss/current",
    icon: BadgeDollarSign,
    badge: "P&L",
  },
  {
    title: "Bảng cân đối kế toán",
    description: "Tài sản, nợ phải trả, vốn chủ sở hữu và kiểm soát phương trình cân đối.",
    href: "/reports/financial-statements/balance-sheet/today",
    icon: Scale,
    badge: "Balance Sheet",
  },
  {
    title: "Lưu chuyển tiền tệ trực tiếp",
    description: "Dòng tiền operating, investing và financing, đối chiếu opening/closing cash.",
    href: "/reports/financial-statements/cash-flow/current",
    icon: WalletCards,
    badge: "Direct method",
  },
  {
    title: "Đối soát VAT",
    description: "VAT đầu ra, đầu vào, phần đủ điều kiện và các hồ sơ chưa đối soát.",
    href: "/reports/tax/vat-reconciliation/current",
    icon: Landmark,
    badge: "VAT",
  },
  {
    title: "Chi phí cần rà soát thuế",
    description: "Tách số đã book, CIT deductible, VAT eligible và tình trạng chứng từ.",
    href: "/reports/tax/expense-exceptions",
    icon: ReceiptText,
    badge: "Review queue",
  },
] as const;

export default function Page() {
  return (
    <ModulePage
      title="Báo cáo tài chính"
      section="Tài chính"
      description="Mỗi báo cáo dùng một trang riêng và cùng truy về ledger, chứng từ và evidence nguồn."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => {
          const Icon = report.icon;
          return (
            <Card key={report.href} className="h-full">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <Icon aria-hidden="true" />
                  <Badge variant="outline">{report.badge}</Badge>
                </div>
                <CardTitle>{report.title}</CardTitle>
                <CardDescription>{report.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Số liệu exact VND · Ledger cutoff · Source drill-down
              </CardContent>
              <CardFooter>
                <Link
                  className="inline-flex items-center gap-2 text-sm font-medium"
                  href={report.href}
                >
                  Mở báo cáo
                  <ArrowRight aria-hidden="true" />
                </Link>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </ModulePage>
  );
}
