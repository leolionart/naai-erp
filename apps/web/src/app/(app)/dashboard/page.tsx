import Link from "next/link";
import {
  ArrowRightIcon,
  BookOpenIcon,
  FileArchiveIcon,
  FileTextIcon,
  ReceiptTextIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";

const modules = [
  {
    href: "/accounting/journals",
    title: "Sổ kế toán",
    description: "Journal, kỳ kế toán và báo cáo sổ cái.",
    icon: BookOpenIcon,
  },
  {
    href: "/documents",
    title: "Hóa đơn",
    description: "Hóa đơn đầu ra, đầu vào và credit note.",
    icon: FileTextIcon,
  },
  {
    href: "/expenses",
    title: "Chi phí",
    description: "Chi phí có/không hóa đơn và hoàn ứng.",
    icon: ReceiptTextIcon,
  },
  {
    href: "/evidence",
    title: "Chứng từ",
    description: "Upload, review và quản lý phiên bản chứng từ.",
    icon: FileArchiveIcon,
  },
] as const;

export default function DashboardPage() {
  return (
    <div className="route-page">
      <PageHeader
        title="Tổng quan vận hành"
        description="Truy cập các module đã có API, CLI và luồng thao tác trên admin UI."
        breadcrumbs={[{ label: "Admin" }, { label: "Tổng quan" }]}
        status={<Badge variant="secondary">Gate G3</Badge>}
      />
      <div className="route-page-content flex flex-col gap-6">
        <section
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Module đang hoạt động"
        >
          {modules.map(({ href, title, description, icon: Icon }) => (
            <Card key={href}>
              <CardHeader>
                <Icon aria-hidden="true" />
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant="outline">Organization scoped · audited</Badge>
              </CardContent>
              <CardFooter>
                <Button asChild variant="outline" className="w-full">
                  <Link href={href}>
                    Mở module <ArrowRightIcon data-icon="inline-end" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </section>
        <Card>
          <CardHeader>
            <CardTitle>Tình trạng nền tảng</CardTitle>
            <CardDescription>
              Foundation, master data, accounting kernel, documents và integrations đã qua
              PostgreSQL CI.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {["G0 Foundation", "G1 Master data", "G2 Accounting", "P3 Documents"].map((item) => (
              <div className="rounded-md border p-3" key={item}>
                <strong className="text-sm">{item}</strong>
                <p className="text-xs text-muted-foreground">Hoàn tất và có evidence</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
