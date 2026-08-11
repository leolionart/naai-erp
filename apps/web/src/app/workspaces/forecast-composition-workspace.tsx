"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
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
  DialogClose,
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
  Popover,
  PopoverActiveAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverFooter,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import {
  planningApi,
  useAuthenticatedApiClient,
  type ForecastComponent,
  type ForecastComponentTransition,
  type ForecastComponentUpdate,
  type ForecastComposition,
  type ForecastVersion,
} from "@/lib/api";

const SECTION_LABELS = { revenue: "Doanh thu", expense: "Chi phí", cash: "Dòng tiền" } as const;
export function ForecastCompositionQueueWorkspace() {
  const { client, hydrated } = useAuthenticatedApiClient();
  const [rows, setRows] = useState<ForecastVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!hydrated) return;
    setError(undefined);
    client
      .data<{ items: readonly ForecastVersion[] }>(planningApi.forecasts)
      .then((result) => setRows([...result.items]))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Không thể tải forecast"))
      .finally(() => setLoading(false));
  }, [client, hydrated]);
  const columns: readonly FinancialColumn<ForecastVersion>[] = [
    {
      id: "forecast",
      header: "Forecast version",
      cell: (row) => (
        <div className="flex min-w-48 flex-col gap-0.5">
          <Link
            className="font-medium underline"
            href={`/forecast/scenarios/${encodeURIComponent(row.id)}/composition`}
          >
            {row.id}
          </Link>
          <span className="text-xs text-muted-foreground">
            {row.scenario} · {row.actualBasis}
          </span>
        </div>
      ),
    },
    {
      id: "period",
      header: "Period",
      cell: (row) => (
        <span>
          {row.startsOn} → {row.endsOn}
        </span>
      ),
    },
    {
      id: "snapshot",
      header: "Snapshot",
      cell: (row) => (
        <span>
          {row.snapshotKind} · {row.asOfDate}
        </span>
      ),
    },
    { id: "state", header: "State", cell: (row) => <StatusBadge status={row.state} /> },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dự báo doanh thu, chi phí và dòng tiền</CardTitle>
        <CardDescription>
          Chọn forecast version để quản lý cấu phần và kiểm tra công thức dự báo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FinancialDataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={loading}
          error={error}
          emptyTitle="Chưa có forecast version"
        />
      </CardContent>
    </Card>
  );
}

export function ForecastCompositionDetailWorkspace({
  forecastId,
}: Readonly<{ forecastId: string }>) {
  const { client, hydrated } = useAuthenticatedApiClient();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [composition, setComposition] = useState<ForecastComposition>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<ForecastComponent>();
  const [editing, setEditing] = useState<ForecastComponent>();
  const [deleting, setDeleting] = useState<ForecastComponent>();
  const [transition, setTransition] = useState<{
    component: ForecastComponent;
    action: "review" | "exclude";
  }>();
  const [reason, setReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setError(undefined);
    try {
      setComposition(await client.data<ForecastComposition>(planningApi.composition(forecastId)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải cấu phần dự báo");
    } finally {
      setLoading(false);
    }
  }, [client, forecastId, hydrated]);
  useEffect(() => void load(), [load]);

  const rows = useMemo(() => {
    const section = searchParams.get("section");
    const kind = searchParams.get("kind");
    const reviewState = searchParams.get("reviewState");
    return (composition?.components ?? []).filter(
      (row) =>
        (!section || row.section === section) &&
        (!kind || row.kind === kind) &&
        (!reviewState || row.reviewState === reviewState),
    );
  }, [composition, searchParams]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await client.data(planningApi.components(forecastId), {
      method: "POST",
      body: {
        schemaVersion: 1,
        section: form.get("section"),
        kind: form.get("kind"),
        direction: form.get("direction"),
        scheduledOn: form.get("scheduledOn"),
        amountMinor: form.get("amountMinor"),
        probabilityBps: Number(form.get("probabilityBps")),
        currency: composition?.currency ?? "VND",
        source: {
          type: form.get("sourceType"),
          id: form.get("sourceId"),
          commercialRootType: String(form.get("commercialRootType") || "") || undefined,
          commercialRootId: String(form.get("commercialRootId") || "") || undefined,
        },
        sourceSnapshot: {},
        note: String(form.get("note") || "") || undefined,
        reason: form.get("reason"),
      },
    });
    setCreateOpen(false);
    await load();
  }

  async function runTransition() {
    if (!transition) return;
    await client.data(
      planningApi.componentAction(forecastId, transition.component.id, transition.action),
      {
        method: "POST",
        body: {
          schemaVersion: 1,
          expectedResourceVersion: transition.component.resourceVersion,
          reason,
        },
      },
    );
    setTransition(undefined);
    setReason("");
    await load();
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const body: ForecastComponentUpdate = {
      schemaVersion: 1,
      expectedResourceVersion: editing.resourceVersion,
      scheduledOn: String(form.get("scheduledOn")),
      amountMinor: String(form.get("amountMinor")),
      probabilityBps: Number(form.get("probabilityBps")),
      note: String(form.get("note") || "") || undefined,
      reason: String(form.get("reason")),
    };
    await client.data(planningApi.component(forecastId, editing.id), {
      method: "PATCH",
      body,
    });
    setEditing(undefined);
    await load();
  }

  async function remove() {
    if (!deleting) return;
    const body: ForecastComponentTransition = {
      schemaVersion: 1,
      expectedResourceVersion: deleting.resourceVersion,
      reason: deleteReason,
    };
    await client.data(planningApi.component(forecastId, deleting.id), {
      method: "DELETE",
      body,
    });
    setDeleting(undefined);
    setDeleteReason("");
    await load();
  }

  function applyFilters(form: FormData) {
    const query = new URLSearchParams();
    for (const [key, value] of form.entries())
      if (value && value !== "__all") query.set(key, String(value));
    router.replace(query.size ? `${pathname}?${query}` : pathname);
    setFiltersOpen(false);
  }

  const columns: readonly FinancialColumn<ForecastComponent>[] = [
    {
      id: "source",
      header: "Cấu phần",
      cell: (row) => (
        <button
          className="flex min-w-48 flex-col gap-0.5 text-left underline"
          onClick={() => setSelected(row)}
        >
          <span className="font-medium">{row.kind}</span>
          <span className="text-xs text-muted-foreground">
            {row.source.type} · {row.source.id}
          </span>
        </button>
      ),
    },
    {
      id: "section",
      header: "Section",
      cell: (row) => <Badge variant="outline">{SECTION_LABELS[row.section]}</Badge>,
    },
    { id: "date", header: "Scheduled", cell: (row) => row.scheduledOn },
    {
      id: "amount",
      header: "Weighted amount",
      cell: (row) => <MoneyCell minor={row.weightedAmountMinor} />,
    },
    { id: "state", header: "Review", cell: (row) => <StatusBadge status={row.reviewState} /> },
    {
      id: "actions",
      header: "Actions",
      cell: (row) => (
        <div className="flex flex-wrap gap-2">
          {row.nextActions.includes("update") ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
              Edit
            </Button>
          ) : null}
          {row.nextActions.includes("review") ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTransition({ component: row, action: "review" })}
            >
              Review
            </Button>
          ) : null}
          {row.nextActions.includes("exclude") ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setTransition({ component: row, action: "exclude" })}
            >
              Exclude
            </Button>
          ) : null}
          {row.nextActions.includes("delete") ? (
            <Button size="sm" variant="destructive" onClick={() => setDeleting(row)}>
              Delete
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <Button asChild variant="outline">
          <Link href={`/forecast/scenarios/${encodeURIComponent(forecastId)}`}>
            Forecast detail
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            Bộ lọc
          </Button>
          <Button onClick={() => setCreateOpen(true)}>Thêm cấu phần</Button>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Không thể tải forecast</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          title="Projected revenue"
          value={composition?.projectedRevenueMinor}
          loading={loading}
        />
        <MetricCard
          title="Projected expense"
          value={composition?.projectedExpenseMinor}
          loading={loading}
        />
        <MetricCard
          title="Projected closing cash"
          value={composition?.projectedClosingCashMinor}
          loading={loading}
        />
      </div>
      {composition?.confidenceFlags.length ? (
        <Alert>
          <AlertTitle>Confidence flags</AlertTitle>
          <AlertDescription>
            {composition.confidenceFlags.map((flag) => flag.code).join(" · ")}
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Forecast components</CardTitle>
          <CardDescription>
            {composition
              ? `${composition.actualBasis} actual through ${composition.asOfDate} · formula ${composition.formulaVersion}`
              : "Đang tải công thức và nguồn dữ liệu."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={loading}
            error={undefined}
            emptyTitle="Chưa có cấu phần phù hợp"
          />
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <form onSubmit={create}>
            <DialogHeader>
              <DialogTitle>Thêm forecast component</DialogTitle>
              <DialogDescription>
                Nguồn thương mại phải có identity để ngăn ghi nhận trùng.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="grid py-4 sm:grid-cols-2">
              <SelectField name="section" label="Section" values={Object.keys(SECTION_LABELS)} />
              <Field>
                <FieldLabel htmlFor="component-kind">Kind</FieldLabel>
                <Input id="component-kind" name="kind" placeholder="committed_milestone" required />
              </Field>
              <SelectField name="direction" label="Direction" values={["increase", "decrease"]} />
              <Field>
                <FieldLabel htmlFor="component-date">Scheduled on</FieldLabel>
                <Input id="component-date" name="scheduledOn" type="date" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="component-amount">Amount (minor)</FieldLabel>
                <Input id="component-amount" name="amountMinor" inputMode="numeric" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="component-probability">Probability (bps)</FieldLabel>
                <Input
                  id="component-probability"
                  name="probabilityBps"
                  type="number"
                  min="0"
                  max="10000"
                  defaultValue="10000"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="component-source-type">Source type</FieldLabel>
                <Input id="component-source-type" name="sourceType" />
              </Field>
              <Field>
                <FieldLabel htmlFor="component-source-id">Source ID</FieldLabel>
                <Input id="component-source-id" name="sourceId" />
              </Field>
              <Field>
                <FieldLabel htmlFor="component-root-type">Commercial root type</FieldLabel>
                <Input id="component-root-type" name="commercialRootType" />
              </Field>
              <Field>
                <FieldLabel htmlFor="component-root-id">Commercial root ID</FieldLabel>
                <Input id="component-root-id" name="commercialRootId" />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="component-note">Note</FieldLabel>
                <Input id="component-note" name="note" />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="component-reason">Reason</FieldLabel>
                <Input id="component-reason" name="reason" required />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit">Lưu component</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(undefined)}>
        <DialogContent className="sm:max-w-md">
          {editing ? (
            <form key={editing.id} onSubmit={update}>
              <DialogHeader>
                <DialogTitle>Edit forecast component</DialogTitle>
                <DialogDescription>
                  Cập nhật lịch, giá trị và xác suất; source identity được giữ nguyên.
                </DialogDescription>
              </DialogHeader>
              <FieldGroup className="py-4">
                <Field>
                  <FieldLabel htmlFor="edit-component-date">Scheduled on</FieldLabel>
                  <Input
                    id="edit-component-date"
                    name="scheduledOn"
                    type="date"
                    defaultValue={editing.scheduledOn}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-component-amount">Amount (minor)</FieldLabel>
                  <Input
                    id="edit-component-amount"
                    name="amountMinor"
                    inputMode="numeric"
                    defaultValue={editing.amountMinor}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-component-probability">Probability (bps)</FieldLabel>
                  <Input
                    id="edit-component-probability"
                    name="probabilityBps"
                    type="number"
                    min="0"
                    max="10000"
                    defaultValue={editing.probabilityBps}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-component-note">Note</FieldLabel>
                  <Input id="edit-component-note" name="note" defaultValue={editing.note ?? ""} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-component-reason">Reason</FieldLabel>
                  <Input id="edit-component-reason" name="reason" required />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button type="submit">Lưu thay đổi</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
        <PopoverActiveAnchor open={Boolean(filtersOpen)} />
        <PopoverContent
          align="end"
          sideOffset={8}
          className="max-h-[min(80vh,40rem)] w-[min(92vw,30rem)] overflow-y-auto"
        >
          <form action={applyFilters} className="flex h-full min-h-0 flex-col">
            <PopoverHeader>
              <PopoverTitle>Bộ lọc forecast components</PopoverTitle>
              <PopoverDescription>
                Filter được lưu trên URL để chia sẻ đúng view.
              </PopoverDescription>
            </PopoverHeader>
            <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
              <SelectField
                name="section"
                label="Section"
                values={Object.keys(SECTION_LABELS)}
                allowAll
              />
              <Field>
                <FieldLabel htmlFor="filter-kind">Kind</FieldLabel>
                <Input id="filter-kind" name="kind" defaultValue={searchParams.get("kind") ?? ""} />
              </Field>
              <SelectField
                name="reviewState"
                label="Review state"
                values={["not_required", "pending", "reviewed"]}
                allowAll
              />
            </FieldGroup>
            <PopoverFooter>
              <Button type="submit">Áp dụng</Button>
              <Button type="button" variant="outline" onClick={() => router.replace(pathname)}>
                Xóa lọc
              </Button>
            </PopoverFooter>
          </form>
        </PopoverContent>
      </Popover>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(undefined)}>
        <DialogContent className="flex max-h-[min(90vh,48rem)] flex-col sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Source drill-down</DialogTitle>
            <DialogDescription>{selected?.id}</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
            <Detail
              label="Section / kind"
              value={selected ? `${selected.section} · ${selected.kind}` : ""}
            />
            <Detail label="Original amount" value={selected?.amountMinor ?? ""} />
            <Detail label="Probability" value={selected ? `${selected.probabilityBps} bps` : ""} />
            <Detail
              label="Commercial root"
              value={
                selected?.source.commercialRootId
                  ? `${selected.source.commercialRootType} · ${selected.source.commercialRootId}`
                  : selected
                    ? `${selected.source.type} · ${selected.source.id}`
                    : ""
              }
            />
            <Detail
              label="Source snapshot"
              value={JSON.stringify(selected?.sourceSnapshot ?? {}, null, 2)}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Đóng</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(transition)}
        onOpenChange={(open) => !open && setTransition(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {transition?.action === "review" ? "Review component?" : "Exclude component?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Hành động được audit và cần lý do quản trị.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="transition-reason">Reason</FieldLabel>
            <Input
              id="transition-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction disabled={!reason.trim()} onClick={runTransition}>
              {transition?.action === "review" ? "Review" : "Exclude"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(undefined);
            setDeleteReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete component?</AlertDialogTitle>
            <AlertDialogDescription>
              Xóa component khỏi draft forecast. Hành động được audit và không thể hoàn tác từ UI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="delete-component-reason">Reason</FieldLabel>
            <Input
              id="delete-component-reason"
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction disabled={!deleteReason.trim()} onClick={remove}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MetricCard({
  title,
  value,
  loading,
}: Readonly<{ title: string; value?: string; loading: boolean }>) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle>
          {loading || value === undefined ? (
            "—"
          ) : (
            <MoneyCell minor={value} className="text-left text-2xl" />
          )}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function SelectField({
  name,
  label,
  values,
  allowAll = false,
}: Readonly<{ name: string; label: string; values: readonly string[]; allowAll?: boolean }>) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select name={name} defaultValue={allowAll ? "__all" : values[0]}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {allowAll ? <SelectItem value="__all">Tất cả</SelectItem> : null}
            {values.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function Detail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm">{value || "—"}</pre>
    </div>
  );
}
