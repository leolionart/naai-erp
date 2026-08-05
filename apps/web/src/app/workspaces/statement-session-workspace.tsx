"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2Icon, RefreshCwIcon, ShieldAlertIcon } from "lucide-react";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { KpiCard } from "@/components/financial/kpi-card";
import { MoneyCell } from "@/components/financial/money-cell";
import { StatusBadge } from "@/components/financial/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  createApiClient,
  DEFAULT_API_CONNECTION,
  loadApiToken,
  loadConnectionSettings,
  statementSessionApi,
  type ApiConnectionSettingsV1,
  type ReviewStatementExceptionRequest,
  type ReviewStatementSessionRequest,
  type StatementExceptionContract,
  type StatementImportDisposition,
  type StatementSessionDetailContract,
  type StatementTransactionContract,
} from "@/lib/api";

type ReviewAction = "approve" | "resolve" | "reject";

export function StatementSessionWorkspace({ sessionId }: Readonly<{ sessionId: string }>) {
  const [connection, setConnection] = useState<ApiConnectionSettingsV1>(DEFAULT_API_CONNECTION);
  const [token, setToken] = useState("");
  const [detail, setDetail] = useState<StatementSessionDetailContract>();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("Tải control detail để kiểm tra blockers.");
  const [review, setReview] = useState<{
    exception: StatementExceptionContract;
    action: ReviewAction;
  }>();
  const [reason, setReason] = useState("");
  const [resolutionReference, setResolutionReference] = useState("");
  const [closeDialog, setCloseDialog] = useState(false);
  const [reviewDialog, setReviewDialog] = useState(false);

  useEffect(() => {
    setConnection(loadConnectionSettings(window.localStorage));
    setToken(loadApiToken(window.sessionStorage));
  }, []);
  const client = useMemo(
    () => createApiClient({ connection: () => connection, token: () => token }),
    [connection, token],
  );
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await client.data<StatementSessionDetailContract>(
        statementSessionApi.detail(sessionId),
      );
      setDetail(payload);
      setNotice("Đã tải control detail từ API.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể tải control detail.");
    } finally {
      setLoading(false);
    }
  }, [client, sessionId]);
  useEffect(() => void load(), [load]);

  async function reviewException() {
    if (!review || !reason.trim()) return;
    setLoading(true);
    try {
      const body: ReviewStatementExceptionRequest = {
        schemaVersion: 1,
        expectedResourceVersion: detail?.session.resourceVersion ?? "",
        reason: reason.trim(),
        ...(review.action === "resolve" ? { resolutionReference: resolutionReference.trim() } : {}),
      };
      await client.data(
        statementSessionApi.reviewException(sessionId, review.exception.id, review.action),
        { method: "POST", body },
      );
      setReview(undefined);
      setReason("");
      setResolutionReference("");
      await load();
      setNotice(`Đã ${review.action} exception có audit reason.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể review exception.");
    } finally {
      setLoading(false);
    }
  }

  async function closeSession() {
    if (!detail || !reason.trim() || !detail.control.closable) return;
    setLoading(true);
    try {
      await client.data(statementSessionApi.close(sessionId), {
        method: "POST",
        body: {
          schemaVersion: 1,
          expectedResourceVersion: detail.session.resourceVersion,
          reason: reason.trim(),
        },
      });
      setCloseDialog(false);
      setReason("");
      await load();
      setNotice("Đã đóng kỳ sao kê sau khi control gates pass.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể đóng kỳ sao kê.");
    } finally {
      setLoading(false);
    }
  }

  async function reviewSession() {
    if (!detail || !reason.trim()) return;
    const body: ReviewStatementSessionRequest = {
      schemaVersion: 1,
      expectedResourceVersion: detail.session.resourceVersion,
      reason: reason.trim(),
    };
    setLoading(true);
    try {
      await client.data(statementSessionApi.review(sessionId), { method: "POST", body });
      setReviewDialog(false);
      setReason("");
      await load();
      setNotice("Đã review session; close vẫn phụ thuộc control blockers.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể review session.");
    } finally {
      setLoading(false);
    }
  }

  const imports: readonly FinancialColumn<StatementImportDisposition>[] = [
    {
      id: "import",
      header: "Import",
      cell: (row) => (
        <div className="flex min-w-40 flex-col">
          <strong>{row.importId}</strong>
          <span className="text-xs text-muted-foreground">{row.importId}</span>
        </div>
      ),
    },
    {
      id: "transactions",
      header: "Transactions",
      align: "right",
      cell: (row) => row.transactionCount,
    },
    {
      id: "accepted",
      header: "Accepted",
      align: "right",
      cell: (row) => row.acceptedTransactionCount,
    },
  ];
  const exceptions: readonly FinancialColumn<StatementExceptionContract>[] = [
    {
      id: "exception",
      header: "Exception",
      cell: (row) => (
        <div className="flex min-w-48 flex-col">
          <strong>{row.kind}</strong>
          <span className="text-xs text-muted-foreground">{row.reason}</span>
        </div>
      ),
    },
    {
      id: "amount",
      header: "Số tiền",
      align: "right",
      cell: (row) => <MoneyCell minor={row.amountMinor} />,
    },
    { id: "owner", header: "Owner / due", cell: (row) => `${row.ownerId} · ${row.reviewDue}` },
    { id: "state", header: "Trạng thái", cell: (row) => <StatusBadge status={row.state} /> },
    {
      id: "actions",
      header: "Review",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.state === "pending" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setReason("");
                setReview({ exception: row, action: "approve" });
              }}
            >
              Duyệt
            </Button>
          ) : null}
          {["pending", "approved"].includes(row.state) ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setReason("");
                setResolutionReference("");
                setReview({ exception: row, action: "resolve" });
              }}
            >
              Giải trình
            </Button>
          ) : null}
          {["pending", "approved"].includes(row.state) ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setReason("");
                setReview({ exception: row, action: "reject" });
              }}
            >
              Từ chối
            </Button>
          ) : null}
        </div>
      ),
    },
  ];
  const transactions: readonly FinancialColumn<StatementTransactionContract>[] = [
    { id: "date", header: "Ngày", cell: (row) => row.bookingDate },
    {
      id: "transaction",
      header: "Transaction",
      cell: (row) => (
        <Link
          className="underline underline-offset-4"
          href={`/banking/reconciliation/${encodeURIComponent(row.bankTransactionId)}`}
        >
          {row.bankTransactionId}
        </Link>
      ),
    },
    {
      id: "amount",
      header: "Số tiền",
      align: "right",
      cell: (row) => <MoneyCell minor={row.amountMinor} />,
    },
    {
      id: "disposition",
      header: "Import disposition",
      cell: (row) => <StatusBadge status={row.disposition} />,
    },
    {
      id: "control",
      header: "Explanation",
      cell: (row) => <StatusBadge status={row.controlStatus} />,
    },
  ];

  const control = detail?.control;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" asChild>
          <Link href="/banking/statements">Về statement queue</Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            Tải lại
          </Button>
          {detail?.session.nextActions.includes("review") ? (
            <Button
              variant="outline"
              onClick={() => {
                setReason("");
                setReviewDialog(true);
              }}
              disabled={loading}
            >
              Review session
            </Button>
          ) : null}
          <Button
            onClick={() => {
              setReason("");
              setCloseDialog(true);
            }}
            disabled={loading || detail?.session.state === "closed"}
          >
            Đóng kỳ sao kê
          </Button>
        </div>
      </div>
      <Alert variant={control?.closable ? "default" : "destructive"}>
        <AlertTitle>{control?.closable ? "Sẵn sàng đóng kỳ" : "Chưa thể đóng kỳ"}</AlertTitle>
        <AlertDescription>
          {notice}
          {control?.closeBlockers.length ? ` · Blockers: ${control.closeBlockers.join(", ")}` : ""}
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Opening"
          period={detail?.session.currency ?? "VND"}
          value={<MoneyCell minor={detail?.session.openingBalanceMinor ?? "0"} />}
          loading={loading}
        />
        <KpiCard
          title="Statement movement"
          period="Trong kỳ"
          value={<MoneyCell minor={control?.expectedMovementMinor ?? "0"} />}
          loading={loading}
        />
        <KpiCard
          title="Reported closing"
          period="Sao kê"
          value={<MoneyCell minor={detail?.session.closingBalanceMinor ?? "0"} />}
          loading={loading}
        />
        <KpiCard
          title="Control difference"
          period={control?.controlDifferenceMinor === "0" ? "Passed" : "Blocked"}
          value={<MoneyCell minor={control?.controlDifferenceMinor ?? "0"} />}
          loading={loading}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Statement control movement</CardTitle>
            <CardDescription>
              Expected movement và control difference do API xác định.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Meta
              label="Expected movement"
              value={
                <MoneyCell minor={control?.expectedMovementMinor ?? "0"} className="text-left" />
              }
            />
            <Meta
              label="Difference"
              value={
                <MoneyCell minor={control?.controlDifferenceMinor ?? "0"} className="text-left" />
              }
            />
            <Meta
              label="Kết quả"
              value={
                control?.controlDifferenceMinor === "0" ? (
                  <Badge variant="secondary">
                    <CheckCircle2Icon data-icon="inline-start" />
                    Passed
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <ShieldAlertIcon data-icon="inline-start" />
                    Blocked
                  </Badge>
                )
              }
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Transaction explanation</CardTitle>
            <CardDescription>
              Accepted, explained và pending exception được server tổng hợp.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Meta label="Accepted" value={control?.acceptedTransactionCount ?? 0} />
            <Meta label="Explained" value={control?.explainedTransactionCount ?? 0} />
            <Meta label="Pending exceptions" value={control?.pendingExceptionCount ?? 0} />
            <Meta label="Closable" value={control?.closable ? "Yes" : "No"} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import dispositions</CardTitle>
          <CardDescription>
            Duplicate/rejected rows không bị ẩn khỏi control review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={detail?.imports ?? []}
            columns={imports}
            rowKey={(row) => row.importId}
            loading={loading}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Transaction dispositions và explanations</CardTitle>
          <CardDescription>
            Accepted/duplicate/excluded tách biệt với reconciliation/control status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={detail?.transactions ?? []}
            columns={transactions}
            rowKey={(row) => row.id}
            loading={loading}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Suspense và control exceptions</CardTitle>
          <CardDescription>
            Pending exceptions: {control?.pendingExceptionCount ?? 0}. Approval/resolution luôn cần
            reason.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={detail?.exceptions ?? []}
            columns={exceptions}
            rowKey={(row) => row.id}
            loading={loading}
            emptyTitle="Không có exception mở"
            emptyDescription="Session không có suspense/control exception cần review."
          />
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(review && review.action !== "reject")}
        onOpenChange={(open) => !open && setReview(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {review?.action === "approve" ? "Duyệt exception" : "Xác nhận giải trình"}
            </DialogTitle>
            <DialogDescription>
              Ghi rõ căn cứ và tác động control trước khi cập nhật exception.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="exception-reason">Lý do audit</FieldLabel>
              <Input
                id="exception-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            {review?.action === "resolve" ? (
              <Field>
                <FieldLabel htmlFor="resolution-reference">Tham chiếu giải trình</FieldLabel>
                <Input
                  id="resolution-reference"
                  value={resolutionReference}
                  onChange={(event) => setResolutionReference(event.target.value)}
                />
              </Field>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button
              onClick={() => void reviewException()}
              disabled={
                !reason.trim() ||
                (review?.action === "resolve" && !resolutionReference.trim()) ||
                loading
              }
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={review?.action === "reject"}
        onOpenChange={(open) => !open && setReview(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Từ chối exception?</AlertDialogTitle>
            <AlertDialogDescription>
              Exception trở lại hàng chờ xử lý và tiếp tục chặn close.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="reject-reason">Lý do từ chối</FieldLabel>
              <Input
                id="reject-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ nguyên</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void reviewException()}
              disabled={!reason.trim() || loading}
            >
              Xác nhận từ chối
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={closeDialog} onOpenChange={setCloseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Đóng kỳ sao kê?</AlertDialogTitle>
            <AlertDialogDescription>
              {control?.closable
                ? "Control totals, coverage và suspense gates đã pass. Hành động sẽ khóa session."
                : `Không thể đóng. Blockers: ${control?.closeBlockers.join(", ") || "chưa tải control detail"}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field data-disabled={!control?.closable}>
              <FieldLabel htmlFor="close-reason">Lý do đóng kỳ</FieldLabel>
              <Input
                id="close-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={!control?.closable}
              />
            </Field>
          </FieldGroup>
          <AlertDialogFooter>
            <AlertDialogCancel>Chưa đóng</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void closeSession()}
              disabled={!control?.closable || !reason.trim() || loading}
            >
              Xác nhận đóng kỳ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review kỳ sao kê</DialogTitle>
            <DialogDescription>
              Xác nhận đã kiểm tra import, transaction explanations và exception context.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="review-session-reason">Lý do review</FieldLabel>
              <Input
                id="review-session-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button onClick={() => void reviewSession()} disabled={!reason.trim() || loading}>
              Xác nhận review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Meta({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
