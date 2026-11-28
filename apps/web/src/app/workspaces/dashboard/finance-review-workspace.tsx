"use client";

import Link from "next/link";
import { ModulePage } from "@/components/layout/module-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardData } from "./use-dashboard-data";

export function FinanceReviewWorkspace() {
  const { data, loading, error, search } = useDashboardData();
  const q = search.toString();
  const rows = [
    ...(data.projects?.items.flatMap((project) =>
      project.confidenceFlags.map((flag) => ({
        id: `project:${project.projectId}:${flag.code}`,
        severity: flag.severity,
        module: "Lợi nhuận dự án",
        issue: flag.code,
        source: flag.sourceIds.join(", "),
        href: `/projects/${encodeURIComponent(project.projectId)}`,
      })),
    ) ?? []),
    ...(data.aging?.exceptions.map((item, index) => ({
      id: `aging:${index}`,
      severity: "warning",
      module: "Công nợ",
      issue: item.message,
      source: item.itemId ?? item.controlAccountCode ?? "AR aging",
      href: `/receivables?asOf=${data.aging?.asOf}`,
    })) ?? []),
    ...(data.performance?.confidenceFlags
      .filter((f) => (f.severity as string) === "critical" || !f.code.startsWith("missing_"))
      .map((flag) => ({
        id: `performance:${flag.code}`,
        severity: flag.severity,
        module: "Hiệu suất kế hoạch",
        issue: flag.reason,
        source: flag.sourceIds.join(", "),
        href: `/reports/performance/${encodeURIComponent(data.performance!.period.id)}?${q}`,
      })) ?? []),
  ];
  return (
    <ModulePage
      title="Finance review"
      description="Hàng đợi ngoại lệ từ các report API; mỗi dòng chuyển về đúng module sở hữu."
      section="Điều hành"
    >
      <div className="flex flex-col gap-6">
        <Button variant="ghost" asChild className="w-fit">
          <Link href={`/dashboard?${q}`}>Quay lại dashboard</Link>
        </Button>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Không tải được review queue</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Ngoại lệ cần xử lý</CardTitle>
            <CardDescription>
              Không trộn công thức hay sửa trạng thái tại dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {rows.map((row) => (
                  <Link
                    key={row.id}
                    href={row.href}
                    className="group rounded-lg bg-muted/40 p-4 transition-colors hover:bg-muted"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium group-hover:text-primary">{row.module}</span>
                      <Badge variant={row.severity === "critical" ? "destructive" : "outline"}>
                        {row.severity}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm">{row.issue}</p>
                    <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                      {row.source || "—"}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ModulePage>
  );
}
