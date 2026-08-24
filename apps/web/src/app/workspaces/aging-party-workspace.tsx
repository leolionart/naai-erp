"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ExternalLinkIcon, HandCoinsIcon, RefreshCwIcon } from "lucide-react";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { KpiCard } from "@/components/financial/kpi-card";
import { MoneyCell } from "@/components/financial/money-cell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  agingApi,
  useAuthenticatedApiClient,
  type AgingItem,
  type AgingReport,
  type AgingSide,
} from "@/lib/api";
import { CustomerReceiptDialog } from "./customer-receipt-dialog";

const today = () => new Date().toISOString().slice(0, 10);

function sourceHref(item: AgingItem) {
  return item.drilldown.sourceHref;
}

function AuditLinks({ item }: Readonly<{ item: AgingItem }>) {
  return (
    <div className="flex min-w-52 flex-wrap gap-1">
      <Button size="sm" variant="outline" asChild>
        <Link href={sourceHref(item)}>
          Nguồn
          <ExternalLinkIcon data-icon="inline-end" />
        </Link>
      </Button>
      {item.drilldown.journalHrefs.map((href, index) => (
        <Button size="sm" variant="ghost" asChild key={href}>
          <Link href={href}>Journal {item.drilldown.journalIds[index]}</Link>
        </Button>
      ))}
      {item.drilldown.reconciliationHrefs.map((href, index) => (
        <Button size="sm" variant="ghost" asChild key={href}>
          <Link href={href}>Đối soát {item.drilldown.reconciliationIds[index]}</Link>
        </Button>
      ))}
      {item.drilldown.evidenceHrefs.map((href, index) => (
        <Button size="sm" variant="ghost" asChild key={href}>
          <Link href={href}>Chứng từ {item.drilldown.evidenceIds[index]}</Link>
        </Button>
      ))}
    </div>
  );
}

export function AgingPartyWorkspace({
  side,
  partyId,
}: Readonly<{ side: AgingSide; partyId: string }>) {
  const searchParams = useSearchParams();
  const asOf = searchParams.get("asOf") || today();
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [report, setReport] = useState<AgingReport>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [receiptDialog, setReceiptDialog] = useState(false);

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
      setReport(await client.data<AgingReport>(agingApi.party(side, partyId, { asOf })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tải chi tiết công nợ.");
    } finally {
      setLoading(false);
    }
  }, [asOf, client, hasToken, hydrated, partyId, side]);
  useEffect(() => {
    void load();
  }, [load]);

  const bucketAmount = (bucket: AgingItem["bucket"]) =>
    report?.bucketTotals.find((total) => total.bucket === bucket)?.baseAmountMinor ?? "0";
  const columns: readonly FinancialColumn<AgingItem>[] = [
    {
      id: "document",
      header: "Chứng từ",
      cell: (item) => (
        <div className="flex min-w-40 flex-col gap-1">
          <strong>{item.documentNumber}</strong>
          <span className="text-xs text-muted-foreground">
            {item.documentDate} → {item.dueDate}
          </span>
        </div>
      ),
    },
    {
      id: "kind",
      header: "Loại",
      cell: (item) => <Badge variant="outline">{item.balanceKind}</Badge>,
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
    { id: "audit", header: "Drill-down", cell: (item) => <AuditLinks item={item} /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            {report?.items[0]?.partyName ?? "Chưa xác định đối tác"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Snapshot tại {asOf}; không suy diễn trạng thái từ UI.
          </p>
        </div>
        <div className="flex gap-2">
          {side === "ar" && report?.items.some((item) => item.balanceKind === "receivable") ? (
            <Button onClick={() => setReceiptDialog(true)}>
              <HandCoinsIcon data-icon="inline-start" /> Ghi nhận đã thu
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link href={side === "ar" ? "/receivables" : "/payables"}>Về queue</Link>
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

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Không thể tải chi tiết</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Còn mở"
          period={report?.baseCurrency ?? "VND"}
          value={<MoneyCell minor={report?.baseOutstandingTotalMinor ?? "0"} />}
          loading={loading}
        />
        <KpiCard
          title="Trong hạn"
          period="Current"
          value={<MoneyCell minor={bucketAmount("current")} />}
          loading={loading}
        />
        <KpiCard
          title="Quá hạn >90"
          period="Ưu tiên xử lý"
          value={<MoneyCell minor={bucketAmount("over_90")} />}
          loading={loading}
        />
        <KpiCard
          title={side === "ar" ? "Credit" : "Advance"}
          period="Trình bày riêng"
          value={<MoneyCell minor={report?.baseCreditOrAdvanceTotalMinor ?? "0"} />}
          loading={loading}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Control-account tie-out</CardTitle>
            <CardDescription>Subledger phải khớp ledger theo account và currency.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {report?.controlTies.map((tie) => (
              <Alert
                variant={tie.status === "tied" ? "default" : "destructive"}
                key={`${tie.controlAccountCode}-${tie.currency}`}
              >
                <AlertTitle>
                  {tie.controlAccountCode} · {tie.currency}
                </AlertTitle>
                <AlertDescription>
                  Ledger {tie.ledgerBalanceMinor} · subledger {tie.subledgerBalanceMinor} · variance{" "}
                  {tie.differenceMinor}
                </AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Exceptions</CardTitle>
            <CardDescription>Không ẩn chênh lệch hoặc nguồn thiếu liên kết.</CardDescription>
          </CardHeader>
          <CardContent>
            {report?.exceptions.length ? (
              <div className="flex flex-col gap-2">
                {report.exceptions.map((exception) => (
                  <Alert
                    variant="destructive"
                    key={`${exception.code}-${exception.itemId ?? "report"}`}
                  >
                    <AlertTitle>{exception.code}</AlertTitle>
                    <AlertDescription>{exception.message}</AlertDescription>
                  </Alert>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Không có exception trong snapshot.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open items và allocation readback</CardTitle>
          <CardDescription>Credits/advances không được net ẩn vào invoice quá hạn.</CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={report?.items ?? []}
            columns={columns}
            rowKey={(item) => item.id}
            loading={loading}
            emptyTitle="Không có open item"
            emptyDescription="Đối tác không có số dư tại ngày báo cáo."
          />
        </CardContent>
      </Card>

      {side === "ar" ? (
        <CustomerReceiptDialog
          open={receiptDialog}
          onOpenChange={setReceiptDialog}
          invoices={(report?.items ?? []).filter((item) => item.balanceKind === "receivable")}
          onRecorded={load}
        />
      ) : null}
    </div>
  );
}
