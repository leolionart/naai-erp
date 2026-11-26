"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  NegativeCustodyAlertContract,
  OwnerCustodyCashCountContract,
} from "@naai-erp/contracts";
import { NegativeCustodyAlert } from "@/components/dashboard/negative-custody-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatApiErrorMessage, useAuthenticatedApiClient } from "@/lib/api";
import { formatMinorVnd } from "@/lib/format";

type CashCountListResponse = Readonly<{
  asOf: string;
  currency: string;
  custodyAccountCode: string;
  currentBookBalanceMinor: string;
  negativeCustodyAlert: NegativeCustodyAlertContract | null;
  items: readonly OwnerCustodyCashCountContract[];
}>;

export function CashCountSection() {
  const { client: api, hydrated, hasToken } = useAuthenticatedApiClient();
  const [state, setState] = useState<CashCountListResponse>();
  const [countedOn, setCountedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [countedBalanceMinor, setCountedBalanceMinor] = useState("0");
  const [reason, setReason] = useState("Kiểm quỹ tiền mặt do chủ giữ cuối tháng");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  const loadData = useCallback(
    async (dateParam?: string) => {
      try {
        const qs = dateParam ? `?asOf=${encodeURIComponent(dateParam)}` : "";
        const data = await api.data<CashCountListResponse>(`banking/cash-counts${qs}`);
        setState(data);
      } catch (err) {
        setError(formatApiErrorMessage(err, "Không thể tải dữ liệu kiểm quỹ."));
      }
    },
    [api],
  );

  useEffect(() => {
    if (!hydrated || !hasToken) return;
    void loadData(countedOn);
  }, [countedOn, hasToken, hydrated, loadData]);

  const bookMinor = BigInt(state?.currentBookBalanceMinor ?? "0");
  const parsedCounted = /^\d+$/.test(countedBalanceMinor.trim())
    ? BigInt(countedBalanceMinor.trim())
    : null;
  const previewDiff = parsedCounted !== null ? parsedCounted - bookMinor : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (parsedCounted === null || !reason.trim()) return;
    setSubmitting(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const recorded = await api.data<OwnerCustodyCashCountContract>("banking/cash-counts", {
        method: "POST",
        body: {
          countedOn,
          countedBalanceMinor: parsedCounted.toString(),
          reason: reason.trim(),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      setSuccess(
        recorded.journalId
          ? `Đã lưu biên bản kiểm quỹ và hạch toán chênh lệch ${formatMinorVnd(recorded.differenceMinor)} vào TK ${recorded.adjustmentAccountCode}.`
          : "Đã lưu biên bản kiểm quỹ: tiền mặt thực tế khớp hoàn toàn với sổ cái.",
      );
      setNote("");
      await loadData(countedOn);
    } catch (err) {
      setError(formatApiErrorMessage(err, "Không thể ghi nhận biên bản kiểm quỹ."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <NegativeCustodyAlert
        alert={state?.negativeCustodyAlert}
        ownerCashCustodyMinor={state?.currentBookBalanceMinor}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Lỗi kiểm quỹ</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert>
          <AlertTitle>Đã ghi nhận kiểm quỹ</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">Lập biên bản kiểm quỹ (111-OWNER-CUSTODY)</CardTitle>
            <CardDescription>
              Chủ doanh nghiệp nhập số tiền mặt thực tế đang giữ hộ công ty; phần chênh lệch so với
              sổ cái sẽ tự động hạch toán vào tài khoản thừa/thiếu quỹ kèm lý do.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="rounded-lg bg-muted p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Số dư sổ cái ({state?.custodyAccountCode ?? "111-OWNER-CUSTODY"}):
                  </span>
                  <span className="font-semibold tabular-nums">{formatMinorVnd(bookMinor)}</span>
                </div>
                {previewDiff !== null ? (
                  <div className="mt-1 flex justify-between">
                    <span className="text-muted-foreground">Chênh lệch dự kiến:</span>
                    <span className="font-medium tabular-nums">
                      {previewDiff === 0n
                        ? "0 ₫ (Khớp quỹ)"
                        : previewDiff > 0n
                          ? `+${formatMinorVnd(previewDiff)} (Thừa quỹ → Có 711-CASH-OVER)`
                          : `${formatMinorVnd(previewDiff)} (Thiếu quỹ → Nợ 811-CASH-SHORT)`}
                    </span>
                  </div>
                ) : null}
              </div>

              <FieldGroup>
                <Field>
                  <FieldLabel>Ngày kiểm quỹ</FieldLabel>
                  <Input
                    type="date"
                    value={countedOn}
                    onChange={(e) => setCountedOn(e.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>Tiền mặt thực tế chủ đang giữ (VND)</FieldLabel>
                  <Input
                    inputMode="numeric"
                    value={countedBalanceMinor}
                    onChange={(e) => setCountedBalanceMinor(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="0"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>Lý do kiểm quỹ / giải trình chênh lệch</FieldLabel>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
                </Field>
                <Field>
                  <FieldLabel>Ghi chú biên bản (tùy chọn)</FieldLabel>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Chi tiết mệnh giá tiền mặt hoặc ghi chú bổ sung..."
                  />
                </Field>
              </FieldGroup>

              <Button
                type="submit"
                disabled={submitting || parsedCounted === null || !reason.trim()}
              >
                Lưu biên bản kiểm quỹ
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-base">Lịch sử biên bản kiểm quỹ</CardTitle>
            <CardDescription>
              Mọi lần kiểm quỹ đều lưu vết kiểm toán và liên kết trực tiếp tới bút toán điều chỉnh.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!state?.items.length ? (
              <p className="text-sm text-muted-foreground">Chưa có biên bản kiểm quỹ nào.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày</TableHead>
                    <TableHead className="text-right">Sổ cái</TableHead>
                    <TableHead className="text-right">Thực đếm</TableHead>
                    <TableHead className="text-right">Chênh lệch</TableHead>
                    <TableHead>Trạng thái / Bút toán</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.countedOn}</div>
                        <div className="text-xs text-muted-foreground">{row.reason}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinorVnd(row.bookBalanceMinor)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinorVnd(row.countedBalanceMinor)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinorVnd(row.differenceMinor)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={row.status === "matched" ? "secondary" : "outline"}>
                            {row.status === "matched"
                              ? "Khớp quỹ"
                              : row.status === "overage"
                                ? `Thừa quỹ (${row.adjustmentAccountCode})`
                                : `Thiếu quỹ (${row.adjustmentAccountCode})`}
                          </Badge>
                          {row.journalId ? (
                            <Link
                              href="/accounting/journals"
                              className="text-xs underline underline-offset-2"
                            >
                              Bút toán: {row.journalId.slice(0, 8)}
                            </Link>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
