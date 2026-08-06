"use client";

import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import type {
  InternalTransferContract,
  InternalTransferAttemptContract,
  InternalTransferMutationResult,
  MatchInternalTransferRequest,
  TransferCandidateContract,
  TransferCandidateListContract,
  TransferFeeContract,
  TransferLegContract,
  UnmatchInternalTransferRequest,
} from "@naai-erp/contracts";
import Link from "next/link";
import { ArrowLeftIcon, LinkIcon, RefreshCwIcon, SearchIcon, UnlinkIcon } from "lucide-react";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { MoneyCell } from "@/components/financial/money-cell";
import { StatusBadge } from "@/components/financial/status-badge";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  currentInternalTransferAttempt,
  DEFAULT_API_CONNECTION,
  internalTransferApi,
  loadApiToken,
  loadConnectionSettings,
  type ApiConnectionSettingsV1,
} from "@/lib/api";
import { formatIsoDate } from "@/lib/format";

export function internalTransferDetail(payload: InternalTransferContract) {
  return payload;
}

export function internalTransferCandidates(payload: TransferCandidateListContract) {
  return [...payload.items];
}

function mutationTransfer(payload: InternalTransferMutationResult) {
  return payload.transfer;
}

export function InternalTransferWorkspace({ transferId }: Readonly<{ transferId: string }>) {
  const [connection, setConnection] = useState<ApiConnectionSettingsV1>(DEFAULT_API_CONNECTION);
  const [token, setToken] = useState("");
  const [transfer, setTransfer] = useState<InternalTransferContract>();
  const [candidates, setCandidates] = useState<TransferCandidateContract[]>([]);
  const [selected, setSelected] = useState<TransferCandidateContract>();
  const [candidateSheet, setCandidateSheet] = useState(false);
  const [pairDialog, setPairDialog] = useState(false);
  const [unmatchDialog, setUnmatchDialog] = useState(false);
  const [unmatchReason, setUnmatchReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    "Tải chi tiết transfer để xem hai chiều và journal readback.",
  );

  useEffect(() => {
    setConnection(loadConnectionSettings(window.localStorage));
    setToken(loadApiToken(window.sessionStorage));
  }, []);
  const client = useMemo(
    () => createApiClient({ connection: () => connection, token: () => token }),
    [connection, token],
  );
  const attempt = currentInternalTransferAttempt(transfer);
  const source = attempt?.source;
  const destination = attempt?.destination;
  const fee = attempt?.fee;
  const state = transfer?.state ?? "";
  const locked = ["matched", "reconciled"].includes(state);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể hoàn tất thao tác.");
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    await run(async () => {
      const nextTransfer = await client.data<InternalTransferContract>(
        internalTransferApi.detail(transferId),
      );
      const pendingAttempt = currentInternalTransferAttempt(nextTransfer);
      const pendingTransactionId =
        pendingAttempt?.source?.transactionId ?? pendingAttempt?.destination?.transactionId;
      const candidatePayload = pendingTransactionId
        ? await client.data<TransferCandidateListContract>(
            internalTransferApi.candidates(pendingTransactionId),
          )
        : {
            transactionId: "",
            policyVersion: 0,
            thresholdBps: 0,
            outcome: "none" as const,
            items: [],
          };
      setTransfer(internalTransferDetail(nextTransfer));
      setCandidates(internalTransferCandidates(candidatePayload));
      setNotice("Đã tải transfer, candidate và journal IDs từ API.");
    });
  }

  async function pair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    await run(async () => {
      if (!transfer) return;
      const body: MatchInternalTransferRequest = {
        schemaVersion: 1,
        counterpartTransactionId: selected.transactionId,
        expectedResourceVersion: transfer.resourceVersion,
        reason,
      };
      const result = await client.data<InternalTransferMutationResult>(
        internalTransferApi.match(transferId),
        {
          method: "POST",
          body,
        },
      );
      setTransfer(mutationTransfer(result));
      setPairDialog(false);
      setCandidateSheet(false);
      setNotice("Đã ghép hai chiều transfer. Principal và fee vẫn tách biệt trong API readback.");
    });
  }

  async function unmatch() {
    if (!unmatchReason.trim()) return;
    await run(async () => {
      if (!transfer) return;
      const body: UnmatchInternalTransferRequest = {
        schemaVersion: 1,
        expectedResourceVersion: transfer.resourceVersion,
        reason: unmatchReason.trim(),
      };
      const result = await client.data<InternalTransferMutationResult>(
        internalTransferApi.unmatch(transferId),
        {
          method: "POST",
          body,
        },
      );
      setTransfer(mutationTransfer(result));
      setUnmatchDialog(false);
      setUnmatchReason("");
      setNotice("Đã hủy ghép có audit; raw bank transactions vẫn được bảo toàn.");
    });
  }

  const candidateColumns: readonly FinancialColumn<TransferCandidateContract>[] = [
    {
      id: "candidate",
      header: "Giao dịch đối ứng",
      cell: (candidate) => (
        <div className="flex min-w-48 flex-col gap-1">
          <strong>{candidate.transactionId}</strong>
          <span className="text-xs text-muted-foreground">
            {candidate.financialAccountId} · {formatIsoDate(candidate.bookingDate)}
          </span>
        </div>
      ),
    },
    {
      id: "amount",
      header: "Số tiền",
      align: "right",
      cell: (candidate) => <MoneyCell minor={candidate.amountMinor} />,
    },
    {
      id: "score",
      header: "Confidence",
      cell: (candidate) => (
        <Badge variant="outline">{(candidate.confidenceBps / 100).toFixed(2)}%</Badge>
      ),
    },
    {
      id: "action",
      header: "Thao tác",
      cell: (candidate) => (
        <Button
          size="sm"
          variant="outline"
          disabled={!candidate.eligible || locked}
          onClick={() => {
            setSelected(candidate);
            setPairDialog(true);
          }}
        >
          Ghép cặp
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" asChild>
          <Link href="/banking/internal-transfers">
            <ArrowLeftIcon data-icon="inline-start" />
            Quay lại transfer queue
          </Link>
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Không thể xử lý transfer</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>Transfer {transferId}</CardTitle>
            <CardDescription>
              Principal nội bộ không tác động P&amp;L; fee là dòng riêng.
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <Button variant="outline" onClick={load} disabled={busy}>
              {busy ? <Spinner /> : <RefreshCwIcon data-icon="inline-start" />}Tải chi tiết
            </Button>
            {!locked ? (
              <Button
                variant="outline"
                onClick={() => setCandidateSheet(true)}
                disabled={!transfer}
              >
                <SearchIcon data-icon="inline-start" />
                Tìm đối ứng
              </Button>
            ) : null}
            {locked ? (
              <Button variant="destructive" onClick={() => setUnmatchDialog(true)}>
                <UnlinkIcon data-icon="inline-start" />
                Hủy ghép
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Trạng thái" node={state ? <StatusBadge status={state} /> : "—"} />
          <Meta
            label="Principal"
            node={
              transfer ? (
                <MoneyCell minor={transfer.principalAmountMinor} className="text-left" />
              ) : (
                "—"
              )
            }
          />
          <Meta
            label="Fee riêng"
            node={fee ? <MoneyCell minor={fee.amountMinor} className="text-left" /> : "—"}
          />
          <Meta
            label="Transit outstanding"
            node={
              transfer ? (
                <MoneyCell minor={transfer.transitOutstandingMinor} className="text-left" />
              ) : (
                "—"
              )
            }
          />
        </CardContent>
      </Card>

      {state === "pending_counterpart" ? (
        <Alert>
          <AlertTitle>Chờ đối ứng qua transit</AlertTitle>
          <AlertDescription>
            Transfer mới có một leg. Principal đang nằm ở transit account{" "}
            {attempt?.transitAccountId ?? "do API chỉ định"} cho tới khi ghép chiều còn lại.
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Hai chiều chuyển nội bộ">
        <TransactionCard title="Chiều tiền ra" leg={source} missing="Chưa có giao dịch chiều ra" />
        <TransactionCard
          title="Chiều tiền vào"
          leg={destination}
          missing="Chờ giao dịch chiều vào"
        />
      </section>
      <FeeCard fee={fee} />
      <JournalAndDrilldown attempt={attempt} />

      <Dialog open={candidateSheet} onOpenChange={setCandidateSheet}>
        <DialogContent className="flex max-h-[min(90vh,48rem)] w-[min(96vw,42rem)] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Candidate giao dịch đối ứng</DialogTitle>
            <DialogDescription>
              Chỉ ghép giao dịch tài khoản sở hữu khác, chiều ngược dấu và đủ điều kiện API.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto pr-1">
            <FinancialDataTable
              rows={candidates}
              columns={candidateColumns}
              rowKey={(candidate) => candidate.transactionId}
              emptyTitle="Chưa có candidate"
              emptyDescription="Chưa import chiều đối ứng hoặc candidate đang cần review."
            />
            {candidates.map((candidate) => (
              <div
                className="mt-3 flex flex-col gap-2 rounded-md border p-3"
                key={`${candidate.transactionId}-factors`}
              >
                <div className="flex flex-wrap gap-2">
                  <strong>{candidate.transactionId}</strong>
                  {candidate.reasons.map((reason) => (
                    <Badge variant="outline" key={reason}>
                      {reason}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(candidate.factors).map(([name, value]) => (
                    <Badge variant="secondary" key={name}>
                      {name}: {String(value)}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pairDialog} onOpenChange={setPairDialog}>
        <DialogContent>
          <form onSubmit={pair}>
            <DialogHeader>
              <DialogTitle>Ghép cặp transfer</DialogTitle>
              <DialogDescription>
                {source?.transactionId || destination?.transactionId || "Leg hiện có"} ↔{" "}
                {selected?.transactionId}. Principal và fee không được chỉnh trong bước ghép.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="pair-reason">Lý do ghép</FieldLabel>
                <Input id="pair-reason" name="reason" required />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPairDialog(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                <LinkIcon data-icon="inline-start" />
                Xác nhận ghép
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={unmatchDialog} onOpenChange={setUnmatchDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hủy ghép transfer?</AlertDialogTitle>
            <AlertDialogDescription>
              API sẽ kiểm soát reversal/transit restoration. Raw bank transactions không bị sửa hoặc
              xóa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="unmatch-reason">Lý do audit</FieldLabel>
            <Input
              id="unmatch-reason"
              value={unmatchReason}
              onChange={(event) => setUnmatchReason(event.target.value)}
              required
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ nguyên</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!unmatchReason.trim() || busy}
              onClick={unmatch}
            >
              Xác nhận hủy ghép
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Meta({ label, node }: Readonly<{ label: string; node: ReactNode }>) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1">{node}</div>
    </div>
  );
}

function TransactionCard({
  title,
  leg,
  missing,
}: Readonly<{ title: string; leg?: TransferLegContract; missing: string }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{leg?.financialAccountId ?? missing}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {leg ? (
          <>
            <Meta
              label="Transaction ID"
              node={
                <Link
                  className="underline underline-offset-4"
                  href={`/banking/reconciliation/${encodeURIComponent(leg.transactionId)}`}
                >
                  {leg.transactionId}
                </Link>
              }
            />
            <Meta label="Ngày" node={formatIsoDate(leg.bookingDate)} />
            <Meta
              label="Statement amount"
              node={<MoneyCell minor={leg.statementAmountMinor} className="text-left" />}
            />
            <Meta
              label="Principal"
              node={<MoneyCell minor={leg.principalAmountMinor} className="text-left" />}
            />
            <Meta
              label="Journal"
              node={
                leg.journalId ? (
                  <Link
                    className="underline underline-offset-4"
                    href={`/accounting/journals?journalId=${encodeURIComponent(leg.journalId)}`}
                  >
                    {leg.journalId}
                  </Link>
                ) : (
                  "—"
                )
              }
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{missing}</p>
        )}
      </CardContent>
    </Card>
  );
}

function FeeCard({ fee }: Readonly<{ fee?: TransferFeeContract }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Phí ngân hàng tách riêng</CardTitle>
        <CardDescription>Fee không làm giảm principal một cách ngầm định.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Meta label="Mode" node={fee?.mode ?? "—"} />
        <Meta
          label="Amount"
          node={fee ? <MoneyCell minor={fee.amountMinor} className="text-left" /> : "—"}
        />
        <Meta label="Expense account" node={fee?.expenseAccountId ?? "—"} />
        <Meta
          label="Journal"
          node={
            fee?.journalId ? (
              <Link
                className="underline underline-offset-4"
                href={`/accounting/journals?journalId=${encodeURIComponent(fee.journalId)}`}
              >
                {fee.journalId}
              </Link>
            ) : (
              "—"
            )
          }
        />
      </CardContent>
    </Card>
  );
}

function JournalAndDrilldown({ attempt }: Readonly<{ attempt?: InternalTransferAttemptContract }>) {
  const journals = Array.isArray(attempt?.journalIds) ? attempt.journalIds.map(String) : [];
  const reversals = Array.isArray(attempt?.reversalJournalIds)
    ? attempt.reversalJournalIds.map(String)
    : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Journal readback và drill-down</CardTitle>
        <CardDescription>
          Principal chỉ qua bank/transit; fee có account riêng. Frontend không tạo posting lines.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {journals.map((id) => (
          <Button key={id} variant="outline" asChild>
            <Link href={`/accounting/journals?journalId=${encodeURIComponent(id)}`}>
              Journal {id}
            </Link>
          </Button>
        ))}
        {reversals.map((id) => (
          <Button key={id} variant="outline" asChild>
            <Link href={`/accounting/journals?journalId=${encodeURIComponent(id)}`}>
              Reversal {id}
            </Link>
          </Button>
        ))}
        {!journals.length && !reversals.length ? (
          <p className="text-sm text-muted-foreground">
            Journal/reversal IDs xuất hiện từ API readback sau mutation.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
