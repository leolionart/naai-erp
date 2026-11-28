"use client";

import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CircleAlert, Users } from "lucide-react";
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
import type { OperatingDashboardWire } from "./dashboard-contracts";
import { money, ratio } from "./dashboard-presentation";
import { effectiveEndsOn } from "./dashboard-queries";

export function OperatingPulseSection({
  operating,
  search,
}: {
  operating?: OperatingDashboardWire;
  search: URLSearchParams;
}) {
  const q = search.toString();
  const overdueCount = operating?.collections.overdueCount ?? 0;
  const flagged = operating?.dataQuality.flaggedCount ?? 0;
  const pendingImportRows = operating?.dataQuality.pendingCount ?? 0;
  const activeProjects = operating?.backlog.projects ?? [];
  const clientRows = operating?.clientConcentration.clients ?? [];
  const portfolioProgress = (operating?.backlog.portfolioProgressBps ?? 0) / 100;

  return (
    <section aria-labelledby="operating-pulse-title" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="operating-pulse-title" className="text-lg font-semibold">
            Nhịp vận hành
          </h2>
          <p className="text-sm text-muted-foreground">
            Công việc, khách hàng và dữ liệu cần chú ý trong cùng kỳ báo cáo.
          </p>
        </div>
        <Badge variant={flagged + pendingImportRows > 0 ? "secondary" : "outline"}>
          {flagged + pendingImportRows > 0
            ? `${flagged + pendingImportRows} việc cần xem`
            : "Vận hành ổn định"}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="overflow-hidden bg-primary text-primary-foreground lg:col-span-5">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <Badge variant="secondary">Danh mục dự án</Badge>
              <BriefcaseBusiness aria-hidden="true" className="size-5 opacity-80" />
            </div>
            <CardTitle className="text-3xl tabular-nums">{activeProjects.length} dự án</CardTitle>
            <CardDescription className="text-primary-foreground/75">
              {money(operating?.backlog.remainingMinor, operating?.currency)} giá trị hợp đồng còn
              lại.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>Tiến độ xuất hóa đơn</span>
              <span className="font-medium tabular-nums">
                {new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
                  portfolioProgress,
                )}
                %
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-primary-foreground/20"
              role="progressbar"
              aria-label="Tiến độ xuất hóa đơn của danh mục dự án"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={portfolioProgress}
            >
              <div
                className="h-full rounded-full bg-primary-foreground transition-[width]"
                style={{ width: `${portfolioProgress}%` }}
              />
            </div>
            <div className="flex justify-between gap-4 text-xs text-primary-foreground/75">
              <span>Đã xuất {money(operating?.backlog.invoicedMinor, operating?.currency)}</span>
              <span>Hợp đồng {money(operating?.backlog.contractedMinor, operating?.currency)}</span>
            </div>
          </CardContent>
          <CardFooter>
            <Button asChild variant="secondary" size="sm">
              <Link href="/projects">
                Xem danh mục <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Khách hàng trọng tâm</CardTitle>
              <Users aria-hidden="true" className="size-5 text-primary" />
            </div>
            <CardDescription>
              Tỷ trọng doanh thu giúp nhận diện mức độ tập trung khách hàng.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Khách hàng lớn nhất</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {operating?.clientConcentration.topClientShareBps == null
                    ? "N/A"
                    : ratio(operating.clientConcentration.topClientShareBps)}
                </p>
              </div>
              <Badge variant="outline">{clientRows.length} khách hàng</Badge>
            </div>
            <div className="space-y-3">
              {clientRows.slice(0, 3).map((client, index) => (
                <div key={client.clientId ?? `${client.clientName}-${index}`} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium">
                      {client.clientName ?? "Khách hàng chưa đặt tên"}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {money(client.revenueMinor, operating?.currency)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${(client.shareBps ?? 0) / 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              {!clientRows.length ? (
                <p className="text-sm text-muted-foreground">Chưa có doanh thu theo khách hàng.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-accent/40 lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Hàng đợi rà soát</CardTitle>
              <CircleAlert aria-hidden="true" className="size-5 text-accent-foreground" />
            </div>
            <CardDescription>Những việc cần xử lý để số liệu đáng tin cậy hơn.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href={`/dashboard/finance-review?${q}`}
              className="flex items-center justify-between gap-3 rounded-lg bg-card p-3 text-sm shadow-sm transition-colors hover:bg-muted"
            >
              <span>Ngoại lệ báo cáo</span>
              <Badge variant={flagged ? "secondary" : "outline"}>{flagged}</Badge>
            </Link>
            <Link
              href="/settings/background-activities"
              className="flex items-center justify-between gap-3 rounded-lg bg-card p-3 text-sm shadow-sm transition-colors hover:bg-muted"
            >
              <span>Dữ liệu chờ chuẩn hóa</span>
              <Badge variant={pendingImportRows ? "secondary" : "outline"}>
                {pendingImportRows}
              </Badge>
            </Link>
            <Link
              href={`/receivables?asOf=${search.get("asOfDate") ?? effectiveEndsOn(search)}`}
              className="flex items-center justify-between gap-3 rounded-lg bg-card p-3 text-sm shadow-sm transition-colors hover:bg-muted"
            >
              <span>Khoản phải thu quá hạn</span>
              <Badge variant={overdueCount ? "destructive" : "outline"}>{overdueCount}</Badge>
            </Link>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/finance-review?${q}`}>Mở hàng đợi</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </section>
  );
}
