"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { ModulePage } from "@/components/layout/module-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatApiErrorMessage, useAuthenticatedApiClient } from "@/lib/api";
import {
  DocumentForm,
  ExpenseForm,
  getFundingSourceLabel,
} from "@/components/forms/document-expense-forms";
import { FocusedRecordDetailToolbar, ReviewExpenseDialog } from "./focused-record-action-bar";
import {
  defaultActionReason,
  formatRecordActionError,
  resolveDetailActionPlan,
} from "./focused-record-actions";
import { FocusedRecordErrorAlert } from "./focused-record-alerts";
import { DraftReasonsAlert } from "./draft-reasons-banner";
import { ActionDialog, SourceCard } from "./focused-record-detail-dialogs";
import { presentRevenueRecord } from "./focused-record-presentation";
import type { Kind, Row } from "./focused-record-shared";
import {
  FOCUSED_RECORD_MASTER_DATA_ENDPOINTS,
  nonNullRow,
  config,
  partiesByRole,
  text,
  items,
  money,
  human,
} from "./focused-record-shared";
import { RecordVoidControl } from "./focused-record-void-control";
import type { WorkflowCreateCapabilities } from "./solopreneur-create-policy";

function externalReference(record?: Row) {
  const single = record?.externalReference ?? record?.external_reference;
  if (single && typeof single === "object") return single as Row;
  const list = record?.externalReferences ?? record?.external_references;
  return Array.isArray(list) && list[0] && typeof list[0] === "object"
    ? (list[0] as Row)
    : undefined;
}

export function FocusedRecordDetailWorkspace({ kind, recordId }: { kind: Kind; recordId: string }) {
  const { client, hasToken, hydrated } = useAuthenticatedApiClient();
  const current = config[kind];
  const [record, setRecord] = useState<Row>();
  const [parties, setParties] = useState<readonly Row[]>([]);
  const [clients, setClients] = useState<readonly Row[]>([]);
  const [payees, setPayees] = useState<readonly Row[]>([]);
  const [employees, setEmployees] = useState<readonly Row[]>([]);
  const [freelancers, setFreelancers] = useState<readonly Row[]>([]);
  const [projects, setProjects] = useState<readonly Row[]>([]);
  const [workflowCapabilities, setWorkflowCapabilities] = useState<WorkflowCreateCapabilities>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [action, setAction] = useState<string>();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [axis, setAxis] = useState("management");
  const [reviewState, setReviewState] = useState("valid");

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setLoadError("");
    if (!hasToken) {
      setRecord(undefined);
      setLoadError(formatApiErrorMessage("AUTH_REQUIRED"));
      setLoading(false);
      return;
    }
    try {
      const [resRecord, partiesRes, rolesRes, projectsRes, workflowRes] = await Promise.all([
        client.data<Row>(`${current.endpoint}/${encodeURIComponent(recordId)}`),
        client.data<readonly Row[] | { items: readonly Row[] }>(
          FOCUSED_RECORD_MASTER_DATA_ENDPOINTS.parties,
        ),
        client.data<readonly Row[] | { items: readonly Row[] }>(
          FOCUSED_RECORD_MASTER_DATA_ENDPOINTS.partyRoles,
        ),
        client.data<readonly Row[] | { items: readonly Row[] }>(
          FOCUSED_RECORD_MASTER_DATA_ENDPOINTS.projects,
        ),
        client.data<WorkflowCreateCapabilities>("organization-workflow-policy").catch(() => ({})),
      ]);
      setRecord(resRecord);
      setWorkflowCapabilities(workflowRes);
      const listedParties = items(partiesRes);
      const listedRoles = items(rolesRes);
      setParties(listedParties);
      setClients(partiesByRole(listedParties, listedRoles, "client"));
      setPayees(partiesByRole(listedParties, listedRoles, "supplier"));
      setFreelancers(partiesByRole(listedParties, listedRoles, "freelancer"));
      setEmployees(partiesByRole(listedParties, listedRoles, "employee"));
      setProjects(items(projectsRes).filter((project) => text(project, "state") !== "closed"));
    } catch (cause) {
      setLoadError(formatApiErrorMessage(cause, `Không thể tải ${current.singular}.`));
    } finally {
      setLoading(false);
    }
  }, [client, current, hasToken, hydrated, recordId]);

  useEffect(() => void load(), [load]);

  const state = text(record, "state");
  const type = text(record, "type");
  const detailPresentation =
    kind === "documents" && record
      ? presentRevenueRecord(record, "documents", projects, parties)
      : undefined;
  const actionPlan = resolveDetailActionPlan(kind, record, workflowCapabilities);
  const source = externalReference(record);

  async function recordOneClick(recordReason: string) {
    setBusy(true);
    setActionError("");
    try {
      await client.data(`${current.endpoint}/${encodeURIComponent(recordId)}/record`, {
        method: "POST",
        idempotencyKey: `record-${kind}-${recordId}-${crypto.randomUUID()}`,
        body: { reason: recordReason },
      });
      toast.success("Đã ghi sổ thành công.");
      await load();
    } catch (cause) {
      const msg = formatRecordActionError(cause);
      setActionError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function transition() {
    if (!action || !reason.trim()) return;
    setBusy(true);
    setActionError("");
    try {
      await client.data(`${current.endpoint}/${encodeURIComponent(recordId)}/${action}`, {
        method: "POST",
        body: {
          reason,
          ...(action === "mark-evidence-pending" ? { missingEvidenceTypes: ["invoice"] } : {}),
        },
      });
      setAction(undefined);
      setReason("");
      await load();
    } catch (cause) {
      setActionError(formatApiErrorMessage(cause, "Không thể thực hiện thao tác."));
    } finally {
      setBusy(false);
    }
  }

  async function review() {
    if (!reason.trim()) return;
    setBusy(true);
    setActionError("");
    try {
      await client.data(`${current.endpoint}/${encodeURIComponent(recordId)}/review`, {
        method: "POST",
        body: { axis, lineNumber: 1, state: reviewState, reason },
      });
      setReviewOpen(false);
      setReason("");
      await load();
    } catch (cause) {
      setActionError(formatApiErrorMessage(cause, "Không thể lưu review."));
    } finally {
      setBusy(false);
    }
  }

  async function update(body: Row) {
    if (!record) return;
    setBusy(true);
    setActionError("");
    try {
      await client.data(`${current.endpoint}/${encodeURIComponent(recordId)}`, {
        method: "PATCH",
        expectedVersion: text(record, "resourceVersion", "version"),
        body,
      });
      setEditOpen(false);
      await load();
    } catch (cause) {
      setActionError(formatApiErrorMessage(cause, `Không thể sửa ${current.singular}.`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModulePage
      title={current.detailTitle}
      description={`URL ổn định cho ${current.singular} ${recordId}.`}
      section={current.title}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" asChild>
            <Link href={`/${kind}`}>
              <ArrowLeft data-icon="inline-start" />
              Danh sách {current.singular}
            </Link>
          </Button>
          <FocusedRecordDetailToolbar
            state={state}
            plan={actionPlan}
            busy={busy}
            onOpenEdit={() => {
              setActionError("");
              setEditOpen(true);
            }}
            onRecord={(recordReason) => void recordOneClick(recordReason)}
            onSelectLifecycleAction={(selected) => {
              setActionError("");
              setReason(defaultActionReason(selected, workflowCapabilities));
              setAction(selected);
            }}
            onOpenReview={() => {
              setActionError("");
              setReason(defaultActionReason("approve", workflowCapabilities));
              setReviewOpen(true);
            }}
          />
        </div>
        <FocusedRecordErrorAlert kind="load" message={loadError} />
        {!editOpen && !reviewOpen && !action ? (
          <FocusedRecordErrorAlert kind="action" message={actionError} />
        ) : null}
        {loading ? (
          <Skeleton className="h-96 w-full" />
        ) : record ? (
          <>
            <DraftReasonsAlert record={record} />
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardDescription>
                    {kind === "documents" ? "Số hóa đơn" : "Ngày chi phí"}
                  </CardDescription>
                  <CardTitle>
                    {text(record, kind === "documents" ? "documentNumber" : "expenseDate") ||
                      recordId}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline">{human(state)}</Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Tổng tiền</CardDescription>
                  <CardTitle>{money(text(record, "grossMinor"))}</CardTitle>
                </CardHeader>
                <CardContent>{text(record, "currency") || "VND"}</CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>
                    {kind === "documents" ? "Khách hàng" : "Đối tượng"}
                  </CardDescription>
                  <CardTitle>
                    {detailPresentation?.customerName ||
                      (() => {
                        const partyId = text(record, "payeePartyId");
                        const party = parties.find(
                          (candidate) => text(candidate, "id") === partyId,
                        );
                        return text(party, "displayName", "legalName") || "Chưa xác định đối tác";
                      })()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {kind === "documents" && detailPresentation?.projectNames.length
                    ? detailPresentation.projectNames.join(", ")
                    : human(text(record, kind === "documents" ? "type" : "expenseClass"))}
                </CardContent>
              </Card>
            </div>
            {kind === "expenses" || text(record, "type") === "purchase_invoice" ? (
              <Card>
                <CardHeader>
                  <CardDescription>Nguồn thanh toán</CardDescription>
                  <CardTitle>
                    {getFundingSourceLabel(
                      text(record, "counterAccountCode", "controlAccountCode"),
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Chi hộ qua TK 3388 không phải là dòng tiền ra từ tài khoản hay quỹ tiền mặt của
                  công ty.
                </CardContent>
              </Card>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle>Dòng hạch toán nguồn</CardTitle>
                <CardDescription>
                  Giá trị từ resource API; posting vẫn tuân theo lifecycle hiện có.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mô tả</TableHead>
                      <TableHead>Tài khoản</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(record.lines)
                      ? (record.lines as (Row | null | undefined)[]).filter(nonNullRow)
                      : []
                    ).map((line, index) => (
                      <TableRow key={text(line, "id") || index}>
                        <TableCell>{text(line, "description") || "—"}</TableCell>
                        <TableCell>
                          {text(
                            line,
                            kind === "documents" ? "primaryAccountCode" : "postingAccountCode",
                          ) || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {money(text(line, "netMinor"))}
                        </TableCell>
                        <TableCell className="text-right">
                          {money(text(line, kind === "documents" ? "taxMinor" : "vatMinor"))}
                        </TableCell>
                        <TableCell className="text-right">
                          {money(text(line, "grossMinor"))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <SourceCard source={source} record={record} />
            <RecordVoidControl source={kind} record={record} onDone={load} />
          </>
        ) : null}
      </div>
      <ActionDialog
        action={action}
        reason={reason}
        setReason={setReason}
        busy={busy}
        error={actionError}
        onClose={() => {
          setAction(undefined);
          setActionError("");
        }}
        onConfirm={() => void transition()}
      />
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setActionError("");
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Sửa draft {current.singular}</DialogTitle>
            <DialogDescription>
              Lưu bằng PATCH với phiên bản {text(record, "resourceVersion", "version") || "—"}. Nếu
              bản ghi đã thay đổi hoặc không còn draft, API sẽ từ chối cập nhật.
            </DialogDescription>
          </DialogHeader>
          <FocusedRecordErrorAlert kind="action" message={actionError} />
          {record ? (
            kind === "documents" ? (
              <DocumentForm
                key={`document-${recordId}-${text(record, "resourceVersion", "version")}`}
                busy={busy}
                initial={record}
                parties={type === "purchase_invoice" ? payees : clients}
                purchaseParties={payees}
                projects={projects}
                submitLabel="Lưu thay đổi hóa đơn"
                onSubmit={(body: Row) => void update(body)}
              />
            ) : (
              <ExpenseForm
                key={`expense-${recordId}-${text(record, "resourceVersion", "version")}`}
                busy={busy}
                initial={record}
                parties={parties}
                payees={payees}
                employees={employees}
                freelancers={freelancers}
                projects={projects}
                submitLabel="Lưu thay đổi chi phí"
                onSubmit={(body) => void update(body)}
              />
            )
          ) : null}
        </DialogContent>
      </Dialog>
      <ReviewExpenseDialog
        open={reviewOpen}
        onOpenChange={(open) => {
          setReviewOpen(open);
          if (!open) setActionError("");
        }}
        axis={axis}
        onAxisChange={(value) => {
          setAxis(value);
          setReviewState(value === "management" ? "valid" : "eligible");
        }}
        reviewState={reviewState}
        onReviewStateChange={setReviewState}
        reason={reason}
        onReasonChange={setReason}
        busy={busy}
        error={actionError}
        onConfirm={() => void review()}
      />
    </ModulePage>
  );
}
