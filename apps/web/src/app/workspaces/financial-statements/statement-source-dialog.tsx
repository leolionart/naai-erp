"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MoneyCell } from "@/components/financial/money-cell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  financialStatementsApi,
  type FinancialStatementDrilldown,
  type FinancialStatementLine,
  type FinancialStatementReport,
  useAuthenticatedApiClient,
} from "@/lib/api";
import { vatSourceHref } from "./statement-report-normalization";

export function SourceDialog({
  report,
  line,
  onClose,
}: Readonly<{
  report?: FinancialStatementReport;
  line?: FinancialStatementLine;
  onClose: () => void;
}>) {
  const { client: api, hydrated, hasToken } = useAuthenticatedApiClient();
  const [data, setData] = useState<FinancialStatementDrilldown>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!report || !line || !hydrated) return;
    setData(undefined);
    setError("");
    if (!hasToken) {
      setError("AUTH_REQUIRED");
      return;
    }
    const query = new URLSearchParams({
      statement: report.statement,
      lineCode: line.lineCode,
      endsOn: report.range.endsOn,
      asOfInstant: report.asOfInstant,
      framework: report.framework,
      basis: report.basis,
    });
    if (report.range.startsOn) query.set("startsOn", report.range.startsOn);
    api
      .data<FinancialStatementDrilldown>(`${financialStatementsApi.drilldown}?${query}`)
      .then((next) => {
        setData(next);
        setError("");
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Không tải được nguồn"),
      );
  }, [api, hasToken, hydrated, line, report]);
  return (
    <Dialog
      open={Boolean(line)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[min(90vh,52rem)] flex-col sm:max-w-4xl">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-bold">
                Chi tiết Nguồn · {line?.label}
              </DialogTitle>
              <DialogDescription className="text-xs mt-1">
                Danh sách bút toán & chứng từ cấu thành nên chỉ số {line?.label} trong kỳ báo cáo.
              </DialogDescription>
            </div>
            {line?.amountMinor ? (
              <div className="text-right">
                <span className="text-xs text-muted-foreground block">Tổng tiền chỉ số:</span>
                <span className="text-lg font-bold text-primary">
                  <MoneyCell minor={line.amountMinor} />
                </span>
              </div>
            ) : null}
          </div>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2 pr-1">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Không tải được nguồn</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {data?.items && data.items.length > 0 ? (
            <div className="overflow-hidden">
              <div className="bg-muted/50 px-4 py-2 text-xs font-semibold grid grid-cols-12 gap-2 border-b">
                <span className="col-span-3">TÀI KHOẢN KẾ TOÁN</span>
                <span className="col-span-3">NGÀY & MÃ BÚT TOÁN</span>
                <span className="col-span-3">CHỨNG TỪ NGUỒN</span>
                <span className="col-span-3 text-right">SỐ TIỀN</span>
              </div>
              <div className="divide-y max-h-96 overflow-y-auto">
                {data.items.map((item) => (
                  <div
                    key={`${item.journalId}:${item.lineNumber}`}
                    className="px-4 py-3 text-sm grid grid-cols-12 gap-2 items-center hover:bg-muted/30 transition-colors"
                  >
                    <div className="col-span-3">
                      <p className="font-semibold text-xs text-primary">{item.accountCode}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.accountName}</p>
                    </div>
                    <div className="col-span-3">
                      <p className="text-xs font-mono">{item.journalDate}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        Journal #{item.journalId}
                      </p>
                    </div>
                    <div className="col-span-3">
                      {item.sourceId ? (
                        <div className="flex flex-col gap-1 items-start">
                          <Badge
                            variant="secondary"
                            className="font-mono text-[10px] px-1.5 py-0.5"
                          >
                            {item.sourceId}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-6 text-[11px] px-1.5 text-primary"
                          >
                            <Link
                              href={
                                item.sourceId.startsWith("doc-") || item.sourceId.startsWith("inv-")
                                  ? `/documents/${encodeURIComponent(item.sourceId)}`
                                  : `/documents`
                              }
                            >
                              Mở chứng từ <ChevronRight className="size-3 ml-0.5" />
                            </Link>
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          Bút toán trực tiếp
                        </span>
                      )}
                    </div>
                    <div className="col-span-3 text-right">
                      <span className="font-bold text-sm">
                        <MoneyCell minor={item.amountMinor} />
                      </span>
                      <p className="text-[10px] text-muted-foreground">
                        Dòng {item.lineNumber} · v{item.journalVersion}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : !error ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Đang tải danh sách dòng bút toán chi tiết...
            </div>
          ) : null}

          {line?.sourceLineIds?.length ? (
            <section className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-3 mt-2">
              <h4 className="text-xs font-semibold text-muted-foreground">
                DANH SÁCH MÃ CHỨNG TỪ NGUỒN (SOURCE IDS)
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {line.sourceLineIds.map((id) => (
                  <Badge key={id} variant="outline" className="font-mono text-xs bg-background">
                    {id}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <DialogFooter className="border-t pt-3">
          {report?.statement === "vat_reconciliation" &&
          (line?.lineCode === "net_vat_payable" || line?.lineCode === "unreviewed_input_vat") ? (
            <Button variant="default" size="sm" asChild>
              <Link href={vatSourceHref(report)}>
                Xử lý VAT chưa review <ChevronRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          ) : null}
          <DialogClose asChild>
            <Button variant="outline">Đóng cửa sổ</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
