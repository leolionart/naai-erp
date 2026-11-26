"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  OwnerRepaymentDirectionContract,
  OwnerSettlementOptionContract,
  OwnerYearEndPositionReportContract,
  OwnerYearEndSettlementRecordContract,
} from "@naai-erp/contracts";
import { NegativeCustodyAlert } from "@/components/dashboard/negative-custody-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatApiErrorMessage, useAuthenticatedApiClient } from "@/lib/api";
import { formatMinorVnd } from "@/lib/format";

type FinancialAccountOption = Readonly<{
  id: string;
  code: string;
  displayName: string;
  kind: string;
  status: string;
  ledgerAccountCode?: string;
}>;

export function OwnerSettlementSection() {
  const { client: api, hydrated, hasToken } = useAuthenticatedApiClient();
  const [fiscalYear, setFiscalYear] = useState(() => Number(new Date().toISOString().slice(0, 4)));
  const [report, setReport] = useState<OwnerYearEndPositionReportContract>();
  const [accounts, setAccounts] = useState<readonly FinancialAccountOption[]>([]);
  const [option, setOption] = useState<OwnerSettlementOptionContract>("offset_3388_1388");
  const [repaymentDirection, setRepaymentDirection] =
    useState<OwnerRepaymentDirectionContract>("company_to_owner");
  const [financialAccountId, setFinancialAccountId] = useState("");
  const [effectiveOn, setEffectiveOn] = useState(
    () => `${new Date().toISOString().slice(0, 4)}-12-31`,
  );
  const [amountMinor, setAmountMinor] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("Quyết toán công nợ chủ doanh nghiệp cuối năm");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();

  const loadPosition = useCallback(
    async (year: number) => {
      try {
        const [pos, accts] = await Promise.all([
          api.data<OwnerYearEndPositionReportContract>(
            `banking/owner-settlements/position?fiscalYear=${year}&asOf=${year}-12-31`,
          ),
          api.data<{ items: readonly FinancialAccountOption[] }>("banking/accounts"),
        ]);
        setReport(pos);
        const eligible = (accts.items ?? []).filter(
          (a) =>
            a.status === "active" &&
            a.code !== "CASH-OWNER-CUSTODY" &&
            a.ledgerAccountCode !== "111-OWNER-CUSTODY",
        );
        setAccounts(eligible);
        if (eligible[0] && !financialAccountId) setFinancialAccountId(eligible[0].id);
      } catch (err) {
        setError(formatApiErrorMessage(err, "Không thể tải vị thế quyết toán với chủ."));
      }
    },
    [api, financialAccountId],
  );

  useEffect(() => {
    if (!hydrated || !hasToken) return;
    void loadPosition(fiscalYear);
  }, [fiscalYear, hasToken, hydrated, loadPosition]);

  async function handleSettle(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      const res = await api.data<OwnerYearEndSettlementRecordContract>(
        "banking/owner-settlements",
        {
          method: "POST",
          body: {
            fiscalYear,
            effectiveOn,
            option,
            ...(option === "repayment" ? { repaymentDirection, financialAccountId } : {}),
            ...(amountMinor.trim() ? { amountMinor: amountMinor.trim() } : {}),
            ...(reference.trim() ? { reference: reference.trim() } : {}),
            reason: reason.trim(),
          },
        },
      );
      setSuccess(
        `Đã ghi sổ bút toán quyết toán (${res.debitAccountCode} / ${res.creditAccountCode}) số tiền ${formatMinorVnd(res.amountMinor)}.`,
      );
      setAmountMinor("");
      await loadPosition(fiscalYear);
    } catch (err) {
      setError(formatApiErrorMessage(err, "Không thể thực hiện bút toán quyết toán với chủ."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <Field className="w-40">
          <FieldLabel>Năm tài chính</FieldLabel>
          <Input
            type="number"
            value={fiscalYear}
            onChange={(e) => {
              const yr = Number(e.target.value) || fiscalYear;
              setFiscalYear(yr);
              setEffectiveOn(`${yr}-12-31`);
            }}
          />
        </Field>
      </div>

      <NegativeCustodyAlert alert={report?.negativeCustodyAlert} />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Lỗi quyết toán cuối năm</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert>
          <AlertTitle>Quyết toán thành công</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      {report ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Công ty nợ chủ ({report.payable3388AccountCode})</CardDescription>
              <CardTitle className="text-xl tabular-nums">
                {formatMinorVnd(report.payable3388Minor)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Các khoản chủ chi hộ và chủ nạp tiền vào công ty.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Chủ nợ công ty ({report.receivable1388AccountCode})</CardDescription>
              <CardTitle className="text-xl tabular-nums">
                {formatMinorVnd(report.receivable1388Minor)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Khoản chi cá nhân lấy từ tiền công ty (ngoài lãi lỗ, ngoài thuế).
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Vị thế ròng với chủ (3388 − 1388)</CardDescription>
              <CardTitle className="text-xl tabular-nums">
                {formatMinorVnd(report.netOwnerPositionMinor)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Không bao gồm quỹ tiền mặt công ty do chủ giữ.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>
                Quỹ công ty chủ đang giữ ({report.custody111AccountCode})
              </CardDescription>
              <CardTitle className="text-xl tabular-nums">
                {formatMinorVnd(report.ownerCustody111Minor)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              LN chưa phân phối ({report.retainedEarnings421AccountCode}):{" "}
              {formatMinorVnd(report.retainedEarnings421Minor)}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-base">Thực hiện quyết toán cuối năm với chủ</CardTitle>
            <CardDescription>
              Chọn một trong ba phương án xử lý số dư 3388 / 1388. Mọi bút toán đều kiểm tra khóa kỳ
              và lưu lý do kiểm toán.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSettle(e)} className="space-y-4">
              <FieldGroup>
                <Field>
                  <FieldLabel>Phương án quyết toán</FieldLabel>
                  <Select
                    value={option}
                    onValueChange={(v) => setOption(v as OwnerSettlementOptionContract)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="offset_3388_1388">
                        Cấn trừ 3388 với 1388 (Nợ 3388 / Có 1388)
                      </SelectItem>
                      <SelectItem value="repayment">
                        Hoàn tiền qua ngân hàng / két công ty
                      </SelectItem>
                      <SelectItem value="profit_distribution">
                        Chia lợi nhuận giải quyết phải thu (Nợ 421 / Có 1388)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                {option === "repayment" ? (
                  <>
                    <Field>
                      <FieldLabel>Chiều hoàn tiền</FieldLabel>
                      <Select
                        value={repaymentDirection}
                        onValueChange={(v) =>
                          setRepaymentDirection(v as OwnerRepaymentDirectionContract)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="company_to_owner">
                            Công ty trả nợ chủ (Nợ 3388 / Có 112-111)
                          </SelectItem>
                          <SelectItem value="owner_to_company">
                            Chủ hoàn tiền về công ty (Nợ 112-111 / Có 1388)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel>Tài khoản ngân hàng / két công ty</FieldLabel>
                      <Select value={financialAccountId} onValueChange={setFinancialAccountId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Chọn tài khoản công ty" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.displayName} ({a.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                ) : null}

                <Field>
                  <FieldLabel>Ngày hạch toán quyết toán</FieldLabel>
                  <Input
                    type="date"
                    value={effectiveOn}
                    onChange={(e) => setEffectiveOn(e.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>Số tiền quyết toán (để trống = tối đa phần đủ điều kiện)</FieldLabel>
                  <Input
                    inputMode="numeric"
                    value={amountMinor}
                    onChange={(e) => setAmountMinor(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="Tự động lấy mức tối đa có thể tất toán"
                  />
                </Field>
                <Field>
                  <FieldLabel>Số chứng từ / quyết định tham chiếu (tùy chọn)</FieldLabel>
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="VD: QD-2026-01 hoặc mã UNC ngân hàng"
                  />
                </Field>
                <Field>
                  <FieldLabel>Lý do quyết toán</FieldLabel>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
                </Field>
              </FieldGroup>

              <Button type="submit" disabled={submitting || !reason.trim()}>
                Ghi nhận bút toán quyết toán
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-base">Lịch sử quyết toán năm {fiscalYear}</CardTitle>
            <CardDescription>
              Các bút toán hoàn tiền, cấn trừ 3388/1388 và chia lợi nhuận đã ghi nhận trong năm.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!report?.settlements.length ? (
              <p className="text-sm text-muted-foreground">
                Chưa có bút toán quyết toán cuối năm nào cho năm {fiscalYear}.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày</TableHead>
                    <TableHead>Phương án</TableHead>
                    <TableHead>Định khoản</TableHead>
                    <TableHead className="text-right">Số tiền</TableHead>
                    <TableHead>Bút toán</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.settlements.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{s.effectiveOn}</div>
                        <div className="text-xs text-muted-foreground">{s.reason}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.option}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        Nợ {s.debitAccountCode} / Có {s.creditAccountCode}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinorVnd(s.amountMinor)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href="/accounting/journals"
                          className="text-xs underline underline-offset-2"
                        >
                          {s.journalId.slice(0, 8)}
                        </Link>
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
