"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { ProjectFreelancePayablesWorkspace } from "./project-freelance-payables-workspace";

export function ProjectCostsWorkspace({ projectId }: Readonly<{ projectId: string }>) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Chi phí thực tế của dự án</CardTitle>
          <CardDescription>
            Báo cáo lấy trực tiếp từ Chi phí và hoá đơn mua vào đã ghi sổ có gắn dự án. Chi phí
            không chọn dự án là chi phí chung của công ty và không được đưa vào biên lợi nhuận dự
            án.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={`/reports/project-profitability/projects/${encodeURIComponent(projectId)}`}>
              Xem chi tiết doanh thu và chi phí
            </Link>
          </Button>
        </CardContent>
      </Card>
      <ProjectFreelancePayablesWorkspace projectId={projectId} compact />
    </div>
  );
}
