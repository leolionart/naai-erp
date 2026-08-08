"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, RefreshCwIcon } from "lucide-react";
import {
  CandidateConfidence,
  ExplainableFactors,
  ReconciliationControlTotals,
  ReconciliationJournalPreview,
  rowText,
  type JsonRow,
} from "@/components/banking/reconciliation-components";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { MoneyCell } from "@/components/financial/money-cell";
import { StatusBadge } from "@/components/financial/status-badge";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  createApiClient,
  DEFAULT_API_CONNECTION,
  loadApiToken,
  loadConnectionSettings,
  saveApiToken,
  saveConnectionSettings,
  type ApiConnectionSettingsV1,
} from "@/lib/api";
import { formatIsoDate } from "@/lib/format";

type Candidate = JsonRow & {
  id: string;
  rank: number;
  targetType: "commercial_document" | "expense";
  targetId: string;
  currency: string;
  outstandingMinor: string;
  confidenceBps: number;
  factors: Record<string, number>;
  status: string;
};

type AllocationDraft = Readonly<{
  targetAmountMinor: string;
  baseAmountMinor: string;
}>;

type AdjustmentDraft = Readonly<{
  id: string;
  kind: "bank_fee" | "fx_gain" | "fx_loss" | "suspense";
  accountCode: string;
  side: "debit" | "credit";
  baseAmountMinor: string;
  description: string;
}>;

export function candidateItems(payload: unknown): Candidate[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as JsonRow;
  const items = record.items;
  return Array.isArray(items) ? (items as Candidate[]) : [];
}

export function findTransactionReconciliation(payload: unknown, transactionId: string) {
  const data = payload && typeof payload === "object" ? (payload as JsonRow) : {};
  const items = Array.isArray(data.items) ? (data.items as JsonRow[]) : [];
  return items.find((item) => rowText(item, "bankTransactionId") === transactionId);
}

function mutationReconciliation(result: JsonRow): JsonRow {
  return (result.reconciliation as JsonRow | undefined) ?? result;
}

function currentAttempt(reconciliation?: JsonRow): JsonRow | undefined {
  const attempts = Array.isArray(reconciliation?.attempts)
    ? (reconciliation.attempts as JsonRow[])
    : [];
  const currentNumber = Number(rowText(reconciliation, "currentAttemptNumber"));
  return attempts.find((attempt) => Number(rowText(attempt, "attemptNumber")) === currentNumber);
}

export function ReconciliationWorkspace({ transactionId }: Readonly<{ transactionId: string }>) {
  const [connection, setConnection] = useState<ApiConnectionSettingsV1>(DEFAULT_API_CONNECTION);
  const [token, setToken] = useState("");
  const [transaction, setTransaction] = useState<JsonRow>();
  const [candidateRun, setCandidateRun] = useState<JsonRow>();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [reconciliation, setReconciliation] = useState<JsonRow>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allocations, setAllocations] = useState<Record<string, AllocationDraft>>({});
  const [adjustments, setAdjustments] = useState<AdjustmentDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Tải giao dịch để bắt đầu đối soát.");
  const [confirmAction, setConfirmAction] = useState<"reconcile" | "unreconcile">();

  useEffect(() => {
    setConnection(loadConnectionSettings(window.localStorage));
    setToken(loadApiToken(window.sessionStorage));
  }, []);

  const client = useMemo(
    () => createApiClient({ connection: () => connection, token: () => token }),
    [connection, token],
  );
  const transactionState = rowText(transaction, "state");
  const reconciliationState = rowText(reconciliation, "state");
  const readOnly = reconciliationState === "reconciled" || transactionState === "reconciled";
  const attempt = currentAttempt(reconciliation);

  function persist() {
    setConnection(saveConnectionSettings(window.localStorage, connection));
    setToken(saveApiToken(window.sessionStorage, token));
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      persist();
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể hoàn tất yêu cầu.");
    } finally {
      setBusy(false);
    }
  }

  async function readReconciliation(id: string) {
    const detail = await client.data<JsonRow>(`banking/reconciliations/${encodeURIComponent(id)}`);
    setReconciliation(detail);
    return detail;
  }

  async function loadCore() {
    const currentTransaction = await client.data<JsonRow>(
      `banking/transactions/${encodeURIComponent(transactionId)}`,
    );
    setTransaction(currentTransaction);
    try {
      const candidatePayload = await client.data<JsonRow>(
        `banking/transactions/${encodeURIComponent(transactionId)}/candidates`,
      );
      setCandidateRun(candidatePayload);
      setCandidates(candidateItems(candidatePayload));
    } catch {
      setCandidateRun(undefined);
      setCandidates([]);
    }
    const reconciliationPage = await client.data<JsonRow>("banking/reconciliations");
    const current = findTransactionReconciliation(reconciliationPage, transactionId);
    if (current) await readReconciliation(rowText(current, "id", "reconciliationId"));
    else setReconciliation(undefined);
  }

  async function load() {
    await run(async () => {
      await loadCore();
      setNotice("Đã tải transaction, candidate và reconciliation hiện tại từ API.");
    });
  }

  async function suggest() {
    await run(async () => {
      const result = await client.data<JsonRow>(
        `banking/transactions/${encodeURIComponent(transactionId)}/suggest`,
        {
          method: "POST",
          body: {
            schemaVersion: 1,
          },
        },
      );
      setNotice(
        `Candidate run ${rowText(result, "candidateRunId") || "đã tạo"}; trạng thái ${rowText(result, "state") || "đã cập nhật"}.`,
      );
      await loadCore();
    });
  }

  function toggleCandidate(candidate: Candidate) {
    setSelectedIds((current) =>
      current.includes(candidate.id)
        ? current.filter((id) => id !== candidate.id)
        : [...current, candidate.id],
    );
    setAllocations((current) => ({
      ...current,
      [candidate.id]: current[candidate.id] ?? {
        targetAmountMinor: candidate.outstandingMinor,
        baseAmountMinor: candidate.outstandingMinor,
      },
    }));
  }

  function updateAllocation(candidateId: string, patch: Partial<AllocationDraft>) {
    setAllocations((current) => ({
      ...current,
      [candidateId]: { ...current[candidateId]!, ...patch },
    }));
  }

  async function match(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selected = candidates.filter((candidate) => selectedIds.includes(candidate.id));
    if (!selected.length) return setError("Chọn ít nhất một candidate để phân bổ.");
    await run(async () => {
      const result = await client.data<JsonRow>(
        `banking/transactions/${encodeURIComponent(transactionId)}/match`,
        {
          method: "POST",
          body: {
            schemaVersion: 1,
            baseAmountMinor: form.get("baseAmountMinor"),
            exchangeRateId: form.get("exchangeRateId") || undefined,
            manualOverride: form.get("manualOverride") === "true",
            overrideReason: form.get("overrideReason") || undefined,
            overrideReference: form.get("overrideReference") || undefined,
            allocations: selected.map((candidate) => ({
              targetType: candidate.targetType,
              targetId: candidate.targetId,
              targetAmountMinor: allocations[candidate.id]!.targetAmountMinor,
              targetCurrency: candidate.currency,
              baseAmountMinor: allocations[candidate.id]!.baseAmountMinor,
            })),
            adjustments: adjustments.map(({ id: _id, ...adjustment }) => adjustment),
          },
        },
      );
      const next = mutationReconciliation(result);
      setReconciliation(next);
      const id = rowText(next, "id");
      if (id) await readReconciliation(id);
      setTransaction(
        await client.data<JsonRow>(`banking/transactions/${encodeURIComponent(transactionId)}`),
      );
      setNotice(`Đã match vào reconciliation ${id || "mới"}.`);
    });
  }

  async function confirmLifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmAction) return;
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    await run(async () => {
      const result = await client.data<JsonRow>(
        `banking/transactions/${encodeURIComponent(transactionId)}/${confirmAction}`,
        {
          method: "POST",
          body: {
            schemaVersion: 1,
            reason,
          },
        },
      );
      const next = mutationReconciliation(result);
      setReconciliation(next);
      const id = rowText(next, "id");
      if (id) await readReconciliation(id);
      setTransaction(
        await client.data<JsonRow>(`banking/transactions/${encodeURIComponent(transactionId)}`),
      );
      setNotice(
        confirmAction === "reconcile"
          ? `Đã đối soát. Journal ${rowText(next.drilldown as JsonRow | undefined, "journalId") || "đã được API ghi nhận"}.`
          : `Đã hủy đối soát. Reversal journal ${rowText(next.drilldown as JsonRow | undefined, "reversalJournalId") || "đã được API ghi nhận"}.`,
      );
      setConfirmAction(undefined);
    });
  }

  const candidateColumns: readonly FinancialColumn<Candidate>[] = [
    {
      id: "target",
      header: "Candidate",
      cell: (candidate) => (
        <div className="flex min-w-52 flex-col gap-1">
          <Link
            className="font-medium underline-offset-4 hover:underline"
            href={
              candidate.targetType === "expense"
                ? `/expenses?resourceId=${encodeURIComponent(candidate.targetId)}`
                : `/documents?resourceId=${encodeURIComponent(candidate.targetId)}`
            }
          >
            {candidate.targetId}
          </Link>
          <span className="text-xs text-muted-foreground">
            {candidate.targetType.replaceAll("_", " ")} · {candidate.status}
          </span>
        </div>
      ),
    },
    {
      id: "confidence",
      header: "Confidence",
      cell: (candidate) => <CandidateConfidence bps={Number(candidate.confidenceBps)} />,
    },
    {
      id: "outstanding",
      header: "Outstanding",
      align: "right",
      cell: (candidate) => <MoneyCell minor={candidate.outstandingMinor} />,
    },
    {
      id: "action",
      header: "Phân bổ",
      cell: (candidate) => (
        <Button
          type="button"
          size="sm"
          variant={selectedIds.includes(candidate.id) ? "secondary" : "outline"}
          onClick={() => toggleCandidate(candidate)}
          disabled={readOnly}
        >
          {selectedIds.includes(candidate.id) ? "Đã chọn" : "Chọn"}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" asChild>
          <Link href="/banking">
            <ArrowLeftIcon data-icon="inline-start" />
            Về Tài khoản &amp; Giao dịch
          </Link>
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Không thể hoàn tất đối soát</AlertTitle>
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
            <CardTitle>Giao dịch {transactionId}</CardTitle>
            <CardDescription>
              Nguồn import bất biến; số liệu và next actions đọc từ API.
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <Button variant="outline" onClick={load} disabled={busy}>
              {busy ? <Spinner /> : <RefreshCwIcon data-icon="inline-start" />}
              Tải chi tiết
            </Button>
            {!readOnly ? (
              <Button variant="outline" onClick={suggest} disabled={busy || !transaction}>
                Chạy gợi ý
              </Button>
            ) : null}
            {reconciliationState === "matched" ? (
              <Button onClick={() => setConfirmAction("reconcile")}>Đối soát</Button>
            ) : null}
            {readOnly ? (
              <Button variant="destructive" onClick={() => setConfirmAction("unreconcile")}>
                Hủy đối soát
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metadata
            label="Ngày ghi sổ"
            value={formatIsoDate(rowText(transaction, "bookingDate"))}
          />
          <div>
            <span className="text-xs text-muted-foreground">Số tiền</span>
            {rowText(transaction, "amountMinor") ? (
              <MoneyCell minor={rowText(transaction, "amountMinor")} className="text-left" />
            ) : (
              <p>—</p>
            )}
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Trạng thái</span>
            <p>{transactionState ? <StatusBadge status={transactionState} /> : "—"}</p>
          </div>
          <Metadata label="Source key" value={rowText(transaction, "sourceKey") || "—"} mono />
        </CardContent>
      </Card>

      {readOnly ? (
        <Alert>
          <AlertTitle>Reconciliation đã khóa</AlertTitle>
          <AlertDescription>
            Allocation, fee và FX chỉ đọc. Muốn rematch phải hủy đối soát với quyền phù hợp và lý do
            audit.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Candidate và confidence</CardTitle>
          <CardDescription>
            Algorithm {rowText(candidateRun, "algorithmVersion") || "—"}; threshold{" "}
            {rowText(candidateRun, "thresholdBps") || "—"} bps; ambiguity margin{" "}
            {rowText(candidateRun, "ambiguityMarginBps") || "—"} bps.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FinancialDataTable
            rows={candidates}
            columns={candidateColumns}
            rowKey={(candidate) => candidate.id}
            loading={busy && !transaction}
            emptyTitle="Chưa có candidate"
            emptyDescription="Chạy gợi ý để tạo candidate run có giải thích."
          />
          {candidates.map((candidate) => (
            <div
              className="flex flex-col gap-2 rounded-md border p-3"
              key={`${candidate.id}-factors`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <strong>{candidate.targetId}</strong>
                <CandidateConfidence bps={Number(candidate.confidenceBps)} />
                <Badge variant="outline">rank {candidate.rank}</Badge>
              </div>
              <ExplainableFactors factors={candidate.factors} />
            </div>
          ))}
        </CardContent>
      </Card>

      <form onSubmit={match}>
        <Card>
          <CardHeader>
            <CardTitle>Allocation, phí và FX</CardTitle>
            <CardDescription>
              Nhập exact minor-unit strings; API kiểm tra outstanding và cân bằng. Frontend không tự
              tính remaining.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Field>
              <FieldLabel htmlFor="bank-base-amount">Bank base amount</FieldLabel>
              <Input
                id="bank-base-amount"
                name="baseAmountMinor"
                defaultValue={rowText(transaction, "amountMinor")}
                required
                readOnly={readOnly}
              />
            </Field>
            {candidates
              .filter((candidate) => selectedIds.includes(candidate.id))
              .map((candidate) => (
                <AllocationEditor
                  key={`${candidate.id}-allocation`}
                  candidate={candidate}
                  value={allocations[candidate.id]!}
                  disabled={readOnly}
                  onChange={(patch) => updateAllocation(candidate.id, patch)}
                />
              ))}
            <AdjustmentEditor
              adjustments={adjustments}
              onChange={setAdjustments}
              disabled={readOnly}
            />
            <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="match-exchange-rate">Exchange rate ID</FieldLabel>
                <Input id="match-exchange-rate" name="exchangeRateId" readOnly={readOnly} />
              </Field>
              <Field>
                <FieldLabel htmlFor="manual-override">Manual override</FieldLabel>
                <Select name="manualOverride" defaultValue="false" disabled={readOnly}>
                  <SelectTrigger id="manual-override">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="false">Không</SelectItem>
                      <SelectItem value="true">Có — yêu cầu lý do</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="override-reason">Lý do override</FieldLabel>
                <Input id="override-reason" name="overrideReason" readOnly={readOnly} />
              </Field>
              <Field>
                <FieldLabel htmlFor="override-reference">Tham chiếu override</FieldLabel>
                <Input id="override-reference" name="overrideReference" readOnly={readOnly} />
              </Field>
            </FieldGroup>
            {!readOnly ? (
              <div>
                <Button type="submit" disabled={busy || !selectedIds.length}>
                  {busy ? <Spinner /> : null}Match và tải readback
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </form>

      <ReconciliationControlTotals detail={attempt} />
      <ReconciliationJournalPreview detail={{ ...attempt, ...(reconciliation ?? {}) }} />
      <ReconciliationDrillDown detail={reconciliation} attempt={attempt} />

      <LifecycleDialog
        action={confirmAction}
        busy={busy}
        onClose={() => setConfirmAction(undefined)}
        onSubmit={confirmLifecycle}
      />
    </div>
  );
}

export function ConnectionCard({
  connection,
  token,
  onConnection,
  onToken,
}: Readonly<{
  connection: ApiConnectionSettingsV1;
  token: string;
  onConnection: (value: ApiConnectionSettingsV1) => void;
  onToken: (value: string) => void;
}>) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Kết nối API</CardTitle>
        <CardDescription>Dùng cùng organization và token với workspace ngân hàng.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="grid gap-4 md:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="rec-api-url">API URL</FieldLabel>
            <Input
              id="rec-api-url"
              value={connection.baseUrl}
              onChange={(event) => onConnection({ ...connection, baseUrl: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="rec-org">Organization ID</FieldLabel>
            <Input
              id="rec-org"
              value={connection.organizationId}
              onChange={(event) =>
                onConnection({ ...connection, organizationId: event.target.value })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="rec-token">Access token</FieldLabel>
            <Input
              id="rec-token"
              type="password"
              value={token}
              onChange={(event) => onToken(event.target.value)}
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function Metadata({
  label,
  value,
  mono = false,
}: Readonly<{ label: string; value: string; mono?: boolean }>) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className={mono ? "break-all font-mono text-xs" : undefined}>{value}</p>
    </div>
  );
}

function AllocationEditor({
  candidate,
  value,
  disabled,
  onChange,
}: Readonly<{
  candidate: Candidate;
  value: AllocationDraft;
  disabled: boolean;
  onChange: (patch: Partial<AllocationDraft>) => void;
}>) {
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div>
        <strong>{candidate.targetId}</strong>
        <p className="text-xs text-muted-foreground">
          Outstanding API: {candidate.outstandingMinor} {candidate.currency}
        </p>
      </div>
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${candidate.id}-target`}>Target amount</FieldLabel>
          <Input
            id={`${candidate.id}-target`}
            value={value.targetAmountMinor}
            onChange={(event) => onChange({ targetAmountMinor: event.target.value })}
            readOnly={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${candidate.id}-base`}>Base amount</FieldLabel>
          <Input
            id={`${candidate.id}-base`}
            value={value.baseAmountMinor}
            onChange={(event) => onChange({ baseAmountMinor: event.target.value })}
            readOnly={disabled}
          />
        </Field>
      </FieldGroup>
    </div>
  );
}

function AdjustmentEditor({
  adjustments,
  onChange,
  disabled,
}: Readonly<{
  adjustments: AdjustmentDraft[];
  onChange: (next: AdjustmentDraft[]) => void;
  disabled: boolean;
}>) {
  const empty = {
    kind: "bank_fee" as const,
    accountCode: "",
    side: "debit" as const,
    baseAmountMinor: "",
    description: "",
  };
  const [draft, setDraft] = useState<Omit<AdjustmentDraft, "id">>(empty);
  function add() {
    if (!draft.accountCode || !draft.baseAmountMinor || !draft.description) return;
    onChange([...adjustments, { ...draft, id: crypto.randomUUID() }]);
    setDraft(empty);
  }
  return (
    <div className="flex flex-col gap-3">
      <div>
        <strong>Adjustment riêng biệt</strong>
        <p className="text-xs text-muted-foreground">
          Bank fee, FX gain/loss và suspense không gộp vào allocation.
        </p>
      </div>
      <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="adjust-kind">Loại</FieldLabel>
          <Select
            value={draft.kind}
            onValueChange={(value) =>
              setDraft({ ...draft, kind: value as AdjustmentDraft["kind"] })
            }
            disabled={disabled}
          >
            <SelectTrigger id="adjust-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {["bank_fee", "fx_gain", "fx_loss", "suspense"].map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {kind.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="adjust-account">Account code</FieldLabel>
          <Input
            id="adjust-account"
            value={draft.accountCode}
            onChange={(event) => setDraft({ ...draft, accountCode: event.target.value })}
            readOnly={disabled}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="adjust-side">Side</FieldLabel>
          <Select
            value={draft.side}
            onValueChange={(value) => setDraft({ ...draft, side: value as "debit" | "credit" })}
            disabled={disabled}
          >
            <SelectTrigger id="adjust-side">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="debit">Debit</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="adjust-base">Base amount</FieldLabel>
          <Input
            id="adjust-base"
            value={draft.baseAmountMinor}
            onChange={(event) => setDraft({ ...draft, baseAmountMinor: event.target.value })}
            readOnly={disabled}
          />
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="adjust-description">Diễn giải</FieldLabel>
          <Input
            id="adjust-description"
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            readOnly={disabled}
          />
        </Field>
      </FieldGroup>
      {!disabled ? (
        <div>
          <Button type="button" variant="outline" onClick={add}>
            Thêm adjustment
          </Button>
        </div>
      ) : null}
      {adjustments.map((adjustment) => (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border p-2"
          key={adjustment.id}
        >
          <Badge variant="outline">{adjustment.kind}</Badge>
          <MoneyCell minor={adjustment.baseAmountMinor} />
          <span>
            {adjustment.accountCode} · {adjustment.side} · {adjustment.description}
          </span>
          {!disabled ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(adjustments.filter((item) => item.id !== adjustment.id))}
            >
              Bỏ
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ReconciliationDrillDown({
  detail,
  attempt,
}: Readonly<{ detail?: JsonRow; attempt?: JsonRow }>) {
  const allocations = Array.isArray(attempt?.allocations) ? (attempt.allocations as JsonRow[]) : [];
  const drilldown = (detail?.drilldown as JsonRow | undefined) ?? {};
  const journalId = rowText(drilldown, "journalId");
  const evidenceIds = Array.isArray(drilldown.evidenceIds) ? drilldown.evidenceIds.map(String) : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Drill-down reconciliation</CardTitle>
        <CardDescription>
          Reconciliation {rowText(detail, "id") || "—"} → allocation/payment → journal →
          source/evidence.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {journalId ? (
          <Button variant="outline" asChild>
            <Link href={`/accounting/journals?journalId=${encodeURIComponent(journalId)}`}>
              Mở journal {journalId}
            </Link>
          </Button>
        ) : null}
        {allocations.map((allocation) => {
          const kind = rowText(allocation, "targetType");
          const id = rowText(allocation, "targetId");
          return (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              key={`${rowText(allocation, "lineNumber")}-${id}`}
            >
              <div>
                <strong>{id}</strong>
                <p className="text-xs text-muted-foreground">
                  Allocation {rowText(allocation, "id") || "—"} · target amount{" "}
                  {rowText(allocation, "targetAmountMinor")}
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={
                    kind === "expense"
                      ? `/expenses?resourceId=${encodeURIComponent(id)}`
                      : `/documents?resourceId=${encodeURIComponent(id)}`
                  }
                >
                  Mở source
                </Link>
              </Button>
            </div>
          );
        })}
        {evidenceIds.map((id) => (
          <Button key={id} variant="outline" size="sm" asChild>
            <Link href={`/evidence?resourceId=${encodeURIComponent(id)}`}>Evidence {id}</Link>
          </Button>
        ))}
        {!journalId && !allocations.length && !evidenceIds.length ? (
          <p className="text-sm text-muted-foreground">Chưa có readback drill-down.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LifecycleDialog({
  action,
  busy,
  onClose,
  onSubmit,
}: Readonly<{
  action?: "reconcile" | "unreconcile";
  busy: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {action === "reconcile" ? "Xác nhận đối soát" : "Hủy đối soát"}
            </DialogTitle>
            <DialogDescription>
              {action === "reconcile"
                ? "API khóa allocation và tạo journal."
                : "API tạo reversal journal và đưa giao dịch về needs_review."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="lifecycle-reason">Lý do audit</FieldLabel>
              <Input id="lifecycle-reason" name="reason" required />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button
              type="submit"
              variant={action === "unreconcile" ? "destructive" : "default"}
              disabled={busy}
            >
              {busy ? <Spinner /> : null}Xác nhận
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
