"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, LockIcon, StickyNoteIcon, TriangleAlert } from "lucide-react";
import type {
  CloseChecklistItemCodeContract,
  PeriodCloseChecklistContract,
} from "@naai-erp/contracts";
import { NegativeCustodyAlert } from "@/components/dashboard/negative-custody-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatApiErrorMessage, useAuthenticatedApiClient } from "@/lib/api";
import { formatMinorVnd } from "@/lib/format";

type PeriodRow = Readonly<{
  fiscalYear: number;
  periodNumber: number;
  startsOn: string;
  endsOn: string;
  state: "open" | "soft_locked" | "hard_locked";
}>;

export function PeriodCloseChecklistSection() {
  const { client: api, hydrated, hasToken } = useAuthenticatedApiClient();
  const [periods, setPeriods] = useState<readonly PeriodRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [checklist, setChecklist] = useState<PeriodCloseChecklistContract>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [actionMessage, setActionMessage] = useState<string>();
  const [closeReason, setCloseReason] = useState("Đóng sổ kế toán cuối tháng");
  const [noteItem, setNoteItem] = useState<CloseChecklistItemCodeContract>("payment_evidence_gaps");
  const [noteText, setNoteText] = useState("");
  const [noteReason, setNoteReason] = useState("Ghi chú theo dõi bổ sung chứng từ thanh toán");
  const [submitting, setSubmitting] = useState(false);

  const loadChecklist = useCallback(
    async (periodKey: string) => {
      if (!periodKey) return;
      const [fy, pn] = periodKey.split(":");
      setLoading(true);
      setError(undefined);
      try {
        const res = await api.data<PeriodCloseChecklistContract>(
          `fiscal-periods/${fy}/${pn}/close-checklist`,
        );
        setChecklist(res);
      } catch (err) {
        setError(formatApiErrorMessage(err, "Không thể tải checklist đóng kỳ."));
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (!hydrated || !hasToken) return;
    void api
      .data<{ items: readonly PeriodRow[] }>("fiscal-periods")
      .then((res) => {
        setPeriods(res.items);
        if (res.items.length > 0) {
          const openFirst = res.items.find((p) => p.state === "open") ?? res.items[0]!;
          const key = `${openFirst.fiscalYear}:${openFirst.periodNumber}`;
          setSelectedKey(key);
          void loadChecklist(key);
        }
      })
      .catch((err) => setError(formatApiErrorMessage(err, "Không thể tải danh sách kỳ kế toán.")));
  }, [api, hasToken, hydrated, loadChecklist]);

  async function handleSaveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedKey || !noteText.trim() || !noteReason.trim()) return;
    const [fy, pn] = selectedKey.split(":");
    setSubmitting(true);
    setError(undefined);
    setActionMessage(undefined);
    try {
      const res = await api.data<{ checklist: PeriodCloseChecklistContract }>(
        `fiscal-periods/${fy}/${pn}/close-checklist/notes`,
        {
          method: "POST",
          body: { itemCode: noteItem, note: noteText.trim(), reason: noteReason.trim() },
        },
      );
      setChecklist(res.checklist);
      setNoteText("");
      setActionMessage("Đã lưu ghi chú xử lý cho mục kiểm tra đóng kỳ.");
    } catch (err) {
      setError(formatApiErrorMessage(err, "Không thể lưu ghi chú checklist."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePeriodTransition(action: "close" | "reopen") {
    if (!checklist || !closeReason.trim()) return;
    const targetState =
      action === "close"
        ? checklist.periodState === "open"
          ? "soft_locked"
          : "hard_locked"
        : checklist.periodState === "hard_locked"
          ? "soft_locked"
          : "open";
    setSubmitting(true);
    setError(undefined);
    setActionMessage(undefined);
    try {
      const res = await api.data<{
        state: string;
        closedWithWarnings?: boolean;
        checklistWarnings?: readonly string[];
      }>(`fiscal-periods/${action}`, {
        method: "POST",
        body: {
          fiscalYear: checklist.fiscalYear,
          periodNumber: checklist.periodNumber,
          targetState,
          reason: closeReason.trim(),
        },
      });
      setActionMessage(
        action === "close"
          ? res.closedWithWarnings
            ? `Đã chuyển kỳ sang ${res.state} kèm ${res.checklistWarnings?.length ?? 0} cảnh báo đã ghi nhận.`
            : `Đã đóng kỳ sang trạng thái ${res.state} (không có cảnh báo).`
          : `Đã mở lại kỳ về trạng thái ${res.state}.`,
      );
      await loadChecklist(selectedKey);
    } catch (err) {
      setError(formatApiErrorMessage(err, "Không thể chuyển trạng thái kỳ kế toán."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Field className="w-72">
          <FieldLabel>Kỳ kế toán kiểm tra</FieldLabel>
          <Select
            value={selectedKey}
            onValueChange={(val) => {
              setSelectedKey(val);
              void loadChecklist(val);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn kỳ kế toán" />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem
                  key={`${p.fiscalYear}:${p.periodNumber}`}
                  value={`${p.fiscalYear}:${p.periodNumber}`}
                >
                  Kỳ {p.periodNumber}/{p.fiscalYear} ({p.startsOn} → {p.endsOn}) · {p.state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {checklist ? (
          <div className="flex items-center gap-2">
            <Badge variant={checklist.readyWithoutWarnings ? "secondary" : "destructive"}>
              {checklist.readyWithoutWarnings
                ? "Sẵn sàng đóng kỳ (0 cảnh báo)"
                : `${checklist.warningCount} mục đang cảnh báo`}
            </Badge>
            <Badge variant="outline">Trạng thái kỳ: {checklist.periodState}</Badge>
          </div>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Lỗi thao tác đóng kỳ</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {actionMessage ? (
        <Alert>
          <AlertTitle>Kết quả cập nhật</AlertTitle>
          <AlertDescription>{actionMessage}</AlertDescription>
        </Alert>
      ) : null}

      <NegativeCustodyAlert alert={checklist?.negativeCustodyAlert} />

      {loading && !checklist ? (
        <p className="text-sm text-muted-foreground">Đang kiểm tra 6 tiêu chí đóng sổ...</p>
      ) : checklist ? (
        <div className="grid gap-4 md:grid-cols-2">
          {checklist.items.map((item) => (
            <Card key={item.code}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{item.label}</CardTitle>
                  <Badge
                    variant={
                      item.status === "passed"
                        ? "secondary"
                        : item.status === "noted"
                          ? "outline"
                          : "destructive"
                    }
                  >
                    {item.status === "passed" ? (
                      <>
                        <CheckCircle2 className="mr-1 size-3.5" /> Đạt
                      </>
                    ) : item.status === "noted" ? (
                      <>
                        <StickyNoteIcon className="mr-1 size-3.5" /> Đã ghi chú
                      </>
                    ) : (
                      <>
                        <TriangleAlert className="mr-1 size-3.5" /> Cảnh báo
                      </>
                    )}
                  </Badge>
                </div>
                <CardDescription>{item.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-muted-foreground">
                {item.amountMinor !== undefined ? (
                  <div>Giá trị kiểm soát: {formatMinorVnd(item.amountMinor)}</div>
                ) : null}
                {item.note ? (
                  <div className="rounded-md bg-muted p-2 text-foreground">
                    Ghi chú ({item.note.notedBy}): {item.note.note}
                  </div>
                ) : null}
              </CardContent>
              {item.actionHref ? (
                <CardFooter className="pt-0">
                  <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-xs">
                    <Link href={item.actionHref}>
                      Mở màn hình xử lý <ChevronRight className="ml-1 size-3.5" />
                    </Link>
                  </Button>
                </CardFooter>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}

      {checklist ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ghi chú xử lý khoản thiếu bằng chứng</CardTitle>
              <CardDescription>
                Khi khoản thiếu chứng từ thanh toán đang chờ nhà cung cấp hoặc sao kê kỳ sau, lưu
                ghi chú để xác nhận đã rà soát trong checklist đóng kỳ.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleSaveNote(e)} className="space-y-3">
                <FieldGroup>
                  <Field>
                    <FieldLabel>Mục checklist</FieldLabel>
                    <Select
                      value={noteItem}
                      onValueChange={(v) => setNoteItem(v as CloseChecklistItemCodeContract)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {checklist.items.map((i) => (
                          <SelectItem key={i.code} value={i.code}>
                            {i.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Nội dung ghi chú</FieldLabel>
                    <Textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Ví dụ: Đang chờ ngân hàng cập nhật ủy nhiệm chi cuối tháng..."
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Lý do kiểm toán</FieldLabel>
                    <Input
                      value={noteReason}
                      onChange={(e) => setNoteReason(e.target.value)}
                      required
                    />
                  </Field>
                </FieldGroup>
                <Button type="submit" variant="outline" disabled={submitting}>
                  Lưu ghi chú checklist
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Đóng hoặc mở lại kỳ kế toán</CardTitle>
              <CardDescription>
                Checklist chỉ cảnh báo, không chặn cứng: chủ doanh nghiệp vẫn có thể đóng kỳ khi
                nhập rõ lý do (mọi cảnh báo được lưu vào nhật ký kiểm toán).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field>
                <FieldLabel>Lý do đóng / mở lại kỳ</FieldLabel>
                <Input
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  placeholder="Nhập lý do đóng sổ tháng..."
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {checklist.periodState !== "hard_locked" ? (
                  <Button
                    type="button"
                    disabled={submitting || !closeReason.trim()}
                    onClick={() => void handlePeriodTransition("close")}
                  >
                    <LockIcon className="mr-1.5 size-4" />
                    {checklist.periodState === "open"
                      ? "Đóng kỳ (Khóa mềm)"
                      : "Khóa cứng kỳ kế toán"}
                  </Button>
                ) : null}
                {checklist.periodState !== "open" ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={submitting || !closeReason.trim()}
                    onClick={() => void handlePeriodTransition("reopen")}
                  >
                    Mở lại kỳ kế toán
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
