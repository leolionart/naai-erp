"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterIcon, RefreshCwIcon } from "lucide-react";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { KpiCard } from "@/components/financial/kpi-card";
import { MoneyCell } from "@/components/financial/money-cell";
import { StatusBadge } from "@/components/financial/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverActiveAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverFooter,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  agingApi,
  useAuthenticatedApiClient,
  type AgingItem,
  type AgingReport,
  type AgingSide,
} from "@/lib/api";

const today = () => new Date().toISOString().slice(0, 10);
const bucketLabels = {
  current: "Trong hạn",
  "1_30": "Quá hạn 1–30",
  "31_60": "Quá hạn 31–60",
  "61_90": "Quá hạn 61–90",
  over_90: "Quá hạn >90",
  unclassified: "Chưa phân loại",
} as const;

function partyHref(side: AgingSide, partyId: string) {
  return side === "ar"
    ? `/receivables/customers/${encodeURIComponent(partyId)}`
    : `/payables/suppliers/${encodeURIComponent(partyId)}`;
}

export function AgingQueueWorkspace({ side }: Readonly<{ side: AgingSide }>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [report, setReport] = useState<AgingReport>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterSheet, setFilterSheet] = useState(false);

  const asOf = searchParams.get("asOf") || today();
  const partyId = searchParams.get("partyId") || "";
  const accountCode = searchParams.get("accountCode") || "";
  const bucket = searchParams.get("bucket") || "";
  const paymentStatus = searchParams.get("paymentStatus") || "";
  const includeSettled = searchParams.get("includeSettled") === "true";

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setError("");
    if (!hasToken) {
      setReport(undefined);
      setError("AUTH_REQUIRED");
      setLoading(false);
      return;
    }
    try {
      setReport(
        await client.data<AgingReport>(
          agingApi.report(side, {
            asOf,
            ...(partyId ? { partyId } : {}),
            ...(accountCode ? { accountCode } : {}),
            ...(bucket ? { bucket: bucket as AgingItem["bucket"] } : {}),
            ...(paymentStatus
              ? { paymentStatus: paymentStatus as AgingItem["paymentStatus"] }
              : {}),
            includeSettled,
            limit: 100,
          }),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tải báo cáo tuổi nợ.");
    } finally {
      setLoading(false);
    }
  }, [
    accountCode,
    asOf,
    bucket,
    client,
    hasToken,
    hydrated,
    includeSettled,
    partyId,
    paymentStatus,
    side,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters(form: FormData) {
    const params = new URLSearchParams();
    for (const key of ["asOf", "partyId", "accountCode", "bucket", "paymentStatus"] as const) {
      const value = String(form.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    if (form.get("includeSettled")) params.set("includeSettled", "true");
    router.replace(`${pathname}?${params.toString()}`);
    setFilterSheet(false);
  }

  const bucketAmount = (name: AgingItem["bucket"]) =>
    report?.bucketTotals.find((total) => total.bucket === name)?.baseAmountMinor ?? "0";
  const columns: readonly FinancialColumn<AgingItem>[] = [
    {
      id: "party",
      header: side === "ar" ? "Khách hàng" : "Nhà cung cấp",
      cell: (item) => (
        <div className="flex min-w-48 flex-col gap-1">
          <Link
            className="font-medium underline-offset-4 hover:underline"
            href={partyHref(side, item.partyId)}
          >
            {item.partyName}
          </Link>
          <span className="text-xs text-muted-foreground">{item.partyId}</span>
        </div>
      ),
    },
    {
      id: "document",
      header: "Chứng từ nguồn",
      cell: (item) => (
        <div className="flex min-w-40 flex-col gap-1">
          <strong>{item.documentNumber}</strong>
          <span className="text-xs text-muted-foreground">Đến hạn {item.dueDate}</span>
        </div>
      ),
    },
    {
      id: "original",
      header: "Gốc",
      align: "right",
      cell: (item) => <MoneyCell minor={item.originalMinor} />,
    },
    {
      id: "applied",
      header: "Đã phân bổ",
      align: "right",
      cell: (item) => <MoneyCell minor={item.settledMinor} />,
    },
    {
      id: "outstanding",
      header: "Còn lại",
      align: "right",
      cell: (item) => <MoneyCell minor={item.outstandingMinor} />,
    },
    {
      id: "bucket",
      header: "Tuổi nợ",
      cell: (item) => <StatusBadge status={bucketLabels[item.bucket]} />,
    },
    {
      id: "kind",
      header: "Loại số dư",
      cell: (item) => <Badge variant="outline">{item.balanceKind}</Badge>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button variant={side === "ar" ? "default" : "outline"} asChild>
            <Link href="/receivables">Phải thu</Link>
          </Button>
          <Button variant={side === "ap" ? "default" : "outline"} asChild>
            <Link href="/payables">Phải trả</Link>
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setFilterSheet(true)}>
            <FilterIcon data-icon="inline-start" />
            Bộ lọc
          </Button>
          <Button onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            Tải lại
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Tổng còn mở"
          period={`Tại ${asOf}`}
          value={<MoneyCell minor={report?.baseOutstandingTotalMinor ?? "0"} />}
          comparison={report?.baseCurrency ?? "VND"}
          loading={loading}
        />
        <KpiCard
          title="Trong hạn"
          period="Current"
          value={<MoneyCell minor={bucketAmount("current")} />}
          loading={loading}
        />
        <KpiCard
          title="Quá hạn 31–60"
          period="Bucket API"
          value={<MoneyCell minor={bucketAmount("31_60")} />}
          comparison="Các bucket 61–90 và >90 nằm trong open items"
          loading={loading}
        />
        <KpiCard
          title={side === "ar" ? "Customer credit" : "Supplier advance"}
          period="Không bù ẩn nợ quá hạn"
          value={<MoneyCell minor={report?.baseCreditOrAdvanceTotalMinor ?? "0"} />}
          loading={loading}
        />
      </div>

      {report?.controlTies.map((tie) => (
        <Alert
          variant={tie.status === "tied" ? "default" : "destructive"}
          key={`${tie.controlAccountCode}-${tie.currency}`}
        >
          <AlertTitle>
            {tie.status === "tied"
              ? "Đã tie-out tài khoản kiểm soát"
              : "Có chênh lệch tài khoản kiểm soát"}
          </AlertTitle>
          <AlertDescription>
            {tie.controlAccountCode} · {tie.currency} · variance{" "}
            <strong>{tie.differenceMinor}</strong>
            {tie.status === "unsupported_fx" ? " · FX chưa được hỗ trợ" : ""}
          </AlertDescription>
        </Alert>
      ))}
      {report?.exceptions.length ? (
        <Alert variant="destructive">
          <AlertTitle>Exception cần xử lý</AlertTitle>
          <AlertDescription>
            {report.exceptions.map((item) => item.message).join(" · ")}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Open items</CardTitle>
          <CardDescription>
            Số dư và bucket do report API xác định từ posting/allocation tại ngày báo cáo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={report?.items ?? []}
            columns={columns}
            rowKey={(item) => item.id}
            loading={loading}
            error={error || undefined}
            emptyTitle="Không có công nợ mở"
            emptyDescription="Thử đổi ngày báo cáo hoặc bộ lọc."
          />
        </CardContent>
      </Card>

      <Popover open={filterSheet} onOpenChange={setFilterSheet}>
        <PopoverActiveAnchor open={Boolean(filterSheet)} />
        <PopoverContent
          align="end"
          sideOffset={8}
          className="max-h-[min(80vh,40rem)] w-[min(92vw,30rem)] overflow-y-auto"
        >
          <form action={applyFilters} className="flex h-full flex-col">
            <PopoverHeader>
              <PopoverTitle>Bộ lọc tuổi nợ</PopoverTitle>
              <PopoverDescription>
                Bộ lọc được lưu trên URL để chia sẻ và tải lại đúng snapshot.
              </PopoverDescription>
            </PopoverHeader>
            <div className="flex-1 px-4 py-2">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="aging-as-of">Ngày báo cáo</FieldLabel>
                  <Input id="aging-as-of" name="asOf" type="date" defaultValue={asOf} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="aging-party">Party ID</FieldLabel>
                  <Input id="aging-party" name="partyId" defaultValue={partyId} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="aging-control">Control account</FieldLabel>
                  <Input id="aging-control" name="accountCode" defaultValue={accountCode} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="aging-bucket">Bucket</FieldLabel>
                  <Input
                    id="aging-bucket"
                    name="bucket"
                    defaultValue={bucket}
                    placeholder="current, 1_30, 31_60..."
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="aging-payment">Payment status</FieldLabel>
                  <Input
                    id="aging-payment"
                    name="paymentStatus"
                    defaultValue={paymentStatus}
                    placeholder="unpaid, partially_paid, paid"
                  />
                </Field>
                <Field orientation="horizontal">
                  <Input
                    className="size-4"
                    id="aging-settled"
                    name="includeSettled"
                    type="checkbox"
                    defaultChecked={includeSettled}
                  />
                  <FieldLabel htmlFor="aging-settled">Bao gồm khoản đã tất toán</FieldLabel>
                </Field>
              </FieldGroup>
            </div>
            <PopoverFooter>
              <Button type="submit">Áp dụng bộ lọc</Button>
            </PopoverFooter>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
