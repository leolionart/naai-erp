"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import {
  createApiClient,
  DEFAULT_API_CONNECTION,
  loadApiToken,
  loadConnectionSettings,
  timeApi,
  type ApiConnectionSettingsV1,
  type CapacitySummary,
  type CreateTimeAdjustmentBody,
  type CreateTimesheetBody,
  type Timesheet,
  type TimeAdjustmentTransitionBody,
  type TimesheetTransitionBody,
} from "@/lib/api";

const isoToday = () => new Date().toISOString().slice(0, 10);
const weekStart = () => {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
};
function minutes(value: number) {
  return `${Math.floor(value / 60)}h ${value % 60}m`;
}

function useTimeClient() {
  const [connection, setConnection] = useState<ApiConnectionSettingsV1>(DEFAULT_API_CONNECTION);
  const [token, setToken] = useState("");
  useEffect(() => {
    setConnection(loadConnectionSettings(window.localStorage));
    setToken(loadApiToken(window.sessionStorage));
  }, []);
  return useMemo(
    () => createApiClient({ connection: () => connection, token: () => token }),
    [connection, token],
  );
}

export function TimesheetQueueWorkspace({ approvals = false }: Readonly<{ approvals?: boolean }>) {
  const client = useTimeClient(),
    router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const [rows, setRows] = useState<Timesheet[]>([]),
    [capacity, setCapacity] = useState<CapacitySummary[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [filters, setFilters] = useState(false);
  const from = params.get("from") || weekStart(),
    to = params.get("to") || isoToday(),
    workerId = params.get("workerId") || "",
    state = approvals ? "submitted" : params.get("state") || "";
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ from, to });
      if (workerId) query.set("workerId", workerId);
      if (state) query.set("state", state);
      const [list, summary] = await Promise.all([
        client.data<{ items: readonly Timesheet[] }>(`${timeApi.timesheets}?${query}`),
        client.data<{ items: readonly CapacitySummary[] }>(
          timeApi.capacitySummary({ from, to, ...(workerId ? { workerId } : {}) }),
        ),
      ]);
      setRows([...list.items]);
      setCapacity([...summary.items]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải timesheet.");
    } finally {
      setLoading(false);
    }
  }, [client, from, state, to, workerId]);
  useEffect(() => void load(), [load]);
  const totals = capacity[0];
  const columns: readonly FinancialColumn<Timesheet>[] = [
    {
      id: "worker",
      header: "Worker / tuần",
      cell: (row) => (
        <div className="flex min-w-44 flex-col">
          <Link
            className="font-medium underline-offset-4 hover:underline"
            href={`${approvals ? "/timesheets/approvals" : "/timesheets"}/${encodeURIComponent(row.id)}`}
          >
            {row.workerId}
          </Link>
          <span className="text-xs text-muted-foreground">Tuần {row.weekStartsOn}</span>
        </div>
      ),
    },
    { id: "entries", header: "Entries", align: "right", cell: (row) => row.entries.length },
    {
      id: "minutes",
      header: "Logged",
      align: "right",
      cell: (row) => minutes(row.entries.reduce((sum, item) => sum + item.minutes, 0)),
    },
    {
      id: "billable",
      header: "Billable",
      align: "right",
      cell: (row) =>
        minutes(
          row.entries
            .filter((e) => e.billingClassification === "billable")
            .reduce((sum, item) => sum + item.minutes, 0),
        ),
    },
    { id: "state", header: "Trạng thái", cell: (row) => <StatusBadge status={row.state} /> },
  ];
  function apply(form: FormData) {
    const next = new URLSearchParams();
    for (const key of ["from", "to", "workerId", "state"] as const) {
      const value = String(form.get(key) ?? "").trim();
      if (value) next.set(key, value);
    }
    router.replace(`${pathname}?${next}`);
    setFilters(false);
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button variant={approvals ? "outline" : "default"} asChild>
            <Link href="/timesheets">Timesheets</Link>
          </Button>
          <Button variant={approvals ? "default" : "outline"} asChild>
            <Link href="/timesheets/approvals">Chờ duyệt</Link>
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setFilters(true)}>
            <FilterIcon data-icon="inline-start" />
            Bộ lọc
          </Button>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            Tải lại
          </Button>
          {!approvals ? (
            <Button asChild>
              <Link href="/timesheets/entries/new">
                <PlusIcon data-icon="inline-start" />
                Tạo timesheet
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Không thể tải dữ liệu</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Available"
          period={`${from} → ${to}`}
          value={minutes(totals?.availableMinutes ?? 0)}
          loading={loading}
        />
        <KpiCard
          title="Approved"
          period="Server summary"
          value={minutes(totals?.approvedMinutes ?? 0)}
          loading={loading}
        />
        <KpiCard
          title="Billable"
          period="Approved time"
          value={minutes(totals?.billableMinutes ?? 0)}
          loading={loading}
        />
        <KpiCard
          title="Unallocated"
          period="Availability gap"
          value={minutes(totals?.unallocatedMinutes ?? 0)}
          loading={loading}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{approvals ? "Approval queue" : "Timesheet queue"}</CardTitle>
          <CardDescription>
            List/week identity nằm trên URL; lifecycle và cost được server xác định.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={loading}
            emptyTitle={approvals ? "Không có timesheet chờ duyệt" : "Chưa có timesheet"}
          />
        </CardContent>
      </Card>
      <Sheet open={filters} onOpenChange={setFilters}>
        <SheetContent className="w-[min(96vw,30rem)]">
          <form action={apply} className="flex h-full flex-col">
            <SheetHeader>
              <SheetTitle>Bộ lọc timesheet</SheetTitle>
              <SheetDescription>Filter được lưu trên URL.</SheetDescription>
            </SheetHeader>
            <div className="flex-1 px-4 py-2">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="time-from">Từ ngày</FieldLabel>
                  <Input id="time-from" name="from" type="date" defaultValue={from} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="time-to">Đến ngày</FieldLabel>
                  <Input id="time-to" name="to" type="date" defaultValue={to} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="time-worker">Worker ID</FieldLabel>
                  <Input id="time-worker" name="workerId" defaultValue={workerId} />
                </Field>
                {!approvals ? (
                  <Field>
                    <FieldLabel htmlFor="time-state">Trạng thái</FieldLabel>
                    <Input id="time-state" name="state" defaultValue={state} />
                  </Field>
                ) : null}
              </FieldGroup>
            </div>
            <SheetFooter>
              <Button type="submit">Áp dụng</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function TimesheetEntryWorkspace() {
  const client = useTimeClient();
  const [notice, setNotice] = useState("Tạo entry tuần mới."),
    [loading, setLoading] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      mode = String(form.get("mode")) as "timed" | "allocation",
      workClassification = String(form.get("workClassification")) as "project" | "internal",
      billingClassification = String(form.get("billingClassification")) as
        "billable" | "non_billable";
    const body: CreateTimesheetBody = {
      schemaVersion: 1,
      workerId: String(form.get("workerId")),
      weekStartsOn: String(form.get("weekStartsOn")),
      reason: String(form.get("reason")),
      entries: [
        {
          id: crypto.randomUUID(),
          workDate: String(form.get("workDate")),
          mode,
          ...(mode === "timed"
            ? { startsAt: String(form.get("startsAt")), endsAt: String(form.get("endsAt")) }
            : {}),
          minutes: Number(form.get("minutes")),
          workClassification,
          billingClassification,
          ...(workClassification === "project" ? { projectId: String(form.get("projectId")) } : {}),
          description: String(form.get("description")),
        },
      ],
    };
    setLoading(true);
    try {
      const result = await client.data<{ resource: Timesheet }>(timeApi.timesheets, {
        method: "POST",
        body,
      });
      window.location.assign(`/timesheets/${encodeURIComponent(result.resource.id)}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Không thể tạo timesheet.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entry tuần</CardTitle>
        <CardDescription>
          Timed hoặc allocation; project/internal và billable/non-billable luôn explicit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
        <form onSubmit={create} className="mt-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="entry-worker">Worker ID</FieldLabel>
              <Input id="entry-worker" name="workerId" required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="entry-week">Tuần bắt đầu</FieldLabel>
                <Input
                  id="entry-week"
                  name="weekStartsOn"
                  type="date"
                  defaultValue={weekStart()}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="entry-date">Ngày làm việc</FieldLabel>
                <Input
                  id="entry-date"
                  name="workDate"
                  type="date"
                  defaultValue={isoToday()}
                  required
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>Mode</FieldLabel>
              <Select name="mode" defaultValue="allocation">
                <SelectTrigger aria-label="Mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="allocation">Allocation</SelectItem>
                    <SelectItem value="timed">Timed</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="entry-minutes">Số phút</FieldLabel>
              <Input
                id="entry-minutes"
                name="minutes"
                type="number"
                min="1"
                defaultValue="480"
                required
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel>Work classification</FieldLabel>
                <Select name="workClassification" defaultValue="project">
                  <SelectTrigger aria-label="Work classification">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="project">Project</SelectItem>
                      <SelectItem value="internal">Internal</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Billing classification</FieldLabel>
                <Select name="billingClassification" defaultValue="billable">
                  <SelectTrigger aria-label="Billing classification">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="billable">Billable</SelectItem>
                      <SelectItem value="non_billable">Non-billable</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="entry-project">Project ID</FieldLabel>
              <Input id="entry-project" name="projectId" />
            </Field>
            <Field>
              <FieldLabel htmlFor="entry-description">Mô tả</FieldLabel>
              <Input id="entry-description" name="description" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="entry-reason">Lý do tạo</FieldLabel>
              <Input id="entry-reason" name="reason" required />
            </Field>
            <Button type="submit" disabled={loading}>
              {loading ? <Spinner data-icon="inline-start" /> : null}Lưu draft
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

export function TimesheetDetailWorkspace({
  timesheetId,
  approval = false,
}: Readonly<{ timesheetId: string; approval?: boolean }>) {
  const client = useTimeClient();
  const [sheet, setSheet] = useState<Timesheet>(),
    [loading, setLoading] = useState(false),
    [action, setAction] = useState<string>(),
    [reason, setReason] = useState(""),
    [billingReference, setBillingReference] = useState(""),
    [adjustmentDialog, setAdjustmentDialog] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSheet(await client.data<Timesheet>(timeApi.timesheet(timesheetId)));
    } finally {
      setLoading(false);
    }
  }, [client, timesheetId]);
  useEffect(() => void load(), [load]);
  async function transition() {
    if (!sheet || !action || !reason.trim()) return;
    const body: TimesheetTransitionBody & { billingReference?: string } = {
      schemaVersion: 1,
      expectedResourceVersion: sheet.resourceVersion,
      reason: reason.trim(),
      ...(action === "mark-billed" ? { billingReference } : {}),
    };
    await client.data(
      timeApi.timesheetAction(sheet.id, action === "mark-billed" ? "bill" : action),
      { method: "POST", body },
    );
    setAction(undefined);
    setReason("");
    await load();
  }
  async function createAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sheet) return;
    const form = new FormData(event.currentTarget);
    const body: CreateTimeAdjustmentBody = {
      schemaVersion: 1,
      originalEntryId: String(form.get("originalEntryId")),
      workDate: String(form.get("workDate")),
      minutesDelta: Number(form.get("minutesDelta")),
      reason: String(form.get("reason")),
      expectedResourceVersion: sheet.resourceVersion,
    };
    await client.data(timeApi.adjustments(sheet.id), { method: "POST", body });
    setAdjustmentDialog(false);
    await load();
  }
  async function changeAdjustment(id: string, next: "submit" | "approve" | "reject") {
    if (!sheet) return;
    const body: TimeAdjustmentTransitionBody = {
      schemaVersion: 1,
      expectedResourceVersion: sheet.resourceVersion,
      reason: `${next} adjustment ${id}`,
    };
    await client.data(timeApi.adjustmentAction(sheet.id, id, next), { method: "POST", body });
    await load();
  }
  const dangerous = action === "reject";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" asChild>
          <Link href={approval ? "/timesheets/approvals" : "/timesheets"}>Về queue</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {sheet?.nextActions.map((next) => (
            <Button
              key={next}
              variant={next === "reject" ? "destructive" : "outline"}
              onClick={() => {
                setReason("");
                setAction(next);
              }}
            >
              {next}
            </Button>
          ))}
          {sheet && ["approved", "locked", "billed"].includes(sheet.state) ? (
            <Button variant="outline" onClick={() => setAdjustmentDialog(true)}>
              Tạo adjustment
            </Button>
          ) : null}
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{sheet?.workerId ?? timesheetId}</CardTitle>
          <CardDescription>
            Tuần {sheet?.weekStartsOn} · <StatusBadge status={sheet?.state ?? "draft"} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={sheet?.entries ?? []}
            rowKey={(row) => row.id}
            loading={loading}
            columns={[
              { id: "date", header: "Ngày", cell: (row) => row.workDate },
              {
                id: "description",
                header: "Công việc",
                cell: (row) => (
                  <div className="flex min-w-48 flex-col">
                    <strong>{row.description}</strong>
                    <span className="text-xs text-muted-foreground">
                      {row.projectId ?? row.workClassification}
                    </span>
                  </div>
                ),
              },
              {
                id: "minutes",
                header: "Thời gian",
                align: "right",
                cell: (row) => minutes(row.minutes),
              },
              {
                id: "billing",
                header: "Billing",
                cell: (row) => <Badge variant="outline">{row.billingClassification}</Badge>,
              },
              {
                id: "cost",
                header: "Applied cost",
                align: "right",
                cell: (row) =>
                  row.appliedCost ? (
                    <MoneyCell minor={row.appliedCost.costMinor} />
                  ) : (
                    "Restricted / pending"
                  ),
              },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Adjustment lifecycle</CardTitle>
          <CardDescription>
            Approved time chỉ sửa qua adjustment draft → submitted → approved/rejected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={sheet?.adjustments ?? []}
            rowKey={(row) => row.id}
            emptyTitle="Chưa có adjustment"
            columns={[
              { id: "entry", header: "Original entry", cell: (row) => row.originalEntryId },
              {
                id: "delta",
                header: "Minutes delta",
                align: "right",
                cell: (row) => row.minutesDelta,
              },
              { id: "reason", header: "Reason", cell: (row) => row.reason },
              { id: "state", header: "State", cell: (row) => <StatusBadge status={row.state} /> },
              {
                id: "actions",
                header: "Actions",
                cell: (row) => (
                  <div className="flex gap-1">
                    {row.state === "draft" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void changeAdjustment(row.id, "submit")}
                      >
                        Submit
                      </Button>
                    ) : null}
                    {row.state === "submitted" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void changeAdjustment(row.id, "approve")}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void changeAdjustment(row.id, "reject")}
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(action && !dangerous)}
        onOpenChange={(open) => !open && setAction(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận {action}</DialogTitle>
            <DialogDescription>
              Lifecycle mutation cần reason và expected resource version.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="timesheet-reason">Lý do</FieldLabel>
              <Input
                id="timesheet-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            {action === "mark-billed" ? (
              <Field>
                <FieldLabel htmlFor="billing-reference">Billing reference</FieldLabel>
                <Input
                  id="billing-reference"
                  value={billingReference}
                  onChange={(e) => setBillingReference(e.target.value)}
                />
              </Field>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button
              onClick={() => void transition()}
              disabled={!reason.trim() || (action === "mark-billed" && !billingReference.trim())}
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={dangerous} onOpenChange={(open) => !open && setAction(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Từ chối timesheet?</AlertDialogTitle>
            <AlertDialogDescription>
              Timesheet trở lại workflow chỉnh sửa; reason được lưu audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="reject-timesheet-reason">Lý do từ chối</FieldLabel>
              <Input
                id="reject-timesheet-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ nguyên</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void transition()}
              disabled={!reason.trim()}
            >
              Xác nhận từ chối
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={adjustmentDialog} onOpenChange={setAdjustmentDialog}>
        <DialogContent>
          <form onSubmit={createAdjustment}>
            <DialogHeader>
              <DialogTitle>Tạo time adjustment</DialogTitle>
              <DialogDescription>Giữ entry approved bất biến và tạo delta riêng.</DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="adjust-entry">Original entry ID</FieldLabel>
                <Input id="adjust-entry" name="originalEntryId" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="adjust-date">Work date</FieldLabel>
                <Input id="adjust-date" name="workDate" type="date" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="adjust-minutes">Minutes delta</FieldLabel>
                <Input id="adjust-minutes" name="minutesDelta" type="number" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="adjust-reason">Reason</FieldLabel>
                <Input id="adjust-reason" name="reason" required />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit">Tạo draft adjustment</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
