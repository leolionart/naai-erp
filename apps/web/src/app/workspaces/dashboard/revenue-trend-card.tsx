"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ExecutiveTrendChart = dynamic(() => import("@/components/dashboard/executive-trend-chart"), {
  loading: () => <Skeleton className="h-48 w-full" />,
  ssr: false,
});

export function RevenueTrendCard({
  points,
  currency,
}: {
  points: readonly Readonly<{ label: string; valueMinor: string }>[];
  currency: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Link
            href="/documents?invoiceStatus=present"
            className="group/link flex items-center gap-1.5 transition-colors"
          >
            <CardTitle className="text-base font-semibold transition-colors group-hover/link:text-primary">
              Xu hướng doanh thu
            </CardTitle>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-50 transition-all group-hover/link:translate-x-0.5 group-hover/link:text-primary group-hover/link:opacity-100" />
          </Link>
        </div>
        <CardDescription className="text-xs">
          So sánh doanh thu thực tế, kế hoạch mục tiêu và số liệu dự báo theo kỳ.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {points.length ? (
          <ExecutiveTrendChart points={points} currency={currency} />
        ) : (
          <p className="text-sm text-muted-foreground">Chưa có dữ liệu xu hướng.</p>
        )}
      </CardContent>
    </Card>
  );
}
