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
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  createApiClient,
  DEFAULT_API_CONNECTION,
  loadApiToken,
  loadConnectionSettings,
  planningApi,
  type ApiConnectionSettingsV1,
  type ForecastVersion,
  type RevenueTarget,
} from "@/lib/api";

type PlanningKind = "targets" | "forecasts";
type PlanningRow = RevenueTarget | ForecastVersion;
const today = () => new Date().toISOString().slice(0, 10);

function useClient() {
  const [connection, setConnection] = useState<ApiConnectionSettingsV1>(DEFAULT_API_CONNECTION);
  const [token, setToken] = useState("");
  useEffect(() => {
    setConnection(loadConnectionSettings(localStorage));
    setToken(loadApiToken(sessionStorage));
  }, []);
  return useMemo(
    () => createApiClient({ connection: () => connection, token: () => token }),
    [connection, token],
  );
}

export function PlanningTabs() {
  return (
    <nav aria-label="Khu vực kế hoạch" className="flex flex-wrap gap-2">
      <Button asChild variant="outline">
        <Link href="/forecast/targets">Revenue targets</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/forecast/scenarios">Forecast scenarios</Link>
      </Button>
    </nav>
  );
}

function queryPath(kind: PlanningKind, params: URLSearchParams) {
  const base = kind === "targets" ? planningApi.targets : planningApi.forecasts;
  return params.size ? `${base}?${params}` : base;
}

export function PlanningQueueWorkspace({ kind }: Readonly<{ kind: PlanningKind }>) {
  const client = useClient();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<PlanningRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    const query = new URLSearchParams();
    const keys =
      kind === "targets"
        ? ["periodKind", "actualBasis", "state", "startsOn", "endsOn"]
        : ["scenario", "snapshotKind", "actualBasis", "state", "startsOn", "endsOn"];
    for (const key of keys) {
      const value = searchParams.get(key);
      if (value) query.set(key, value);
    }
    try {
      const result = await client.data<{ items: readonly PlanningRow[] }>(queryPath(kind, query));
      setRows([...result.items]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải kế hoạch");
    } finally {
      setLoading(false);
    }
  }, [client, kind, searchParams]);
  useEffect(() => void load(), [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const common = {
      schemaVersion: 1,
      versionNumber: Number(form.get("versionNumber")),
      previousVersionId: String(form.get("previousVersionId") || "") || undefined,
      startsOn: form.get("startsOn"),
      endsOn: form.get("endsOn"),
      actualBasis: form.get("actualBasis"),
      currency: form.get("currency"),
      dimensions: {
        teamId: String(form.get("teamId") || "") || undefined,
        serviceLineCode: String(form.get("serviceLineCode") || "") || undefined,
        ownerId: String(form.get("ownerId") || "") || undefined,
      },
      reason: form.get("reason"),
    };
    const body =
      kind === "targets"
        ? { ...common, periodKind: form.get("periodKind"), amountMinor: form.get("amountMinor") }
        : {
            ...common,
            scenario: form.get("scenario"),
            customScenarioName: String(form.get("customScenarioName") || "") || undefined,
            snapshotKind: form.get("snapshotKind"),
            asOfDate: form.get("asOfDate"),
          };
    await client.data(kind === "targets" ? planningApi.targets : planningApi.forecasts, {
      method: "POST",
      body,
    });
    setCreateOpen(false);
    await load();
  }

  function applyFilters(form: FormData) {
    const query = new URLSearchParams();
    for (const [key, value] of form.entries()) {
      if (String(value) && value !== "__all") query.set(key, String(value));
    }
    router.replace(query.size ? `${pathname}?${query}` : pathname);
    setFiltersOpen(false);
  }

  const columns: readonly FinancialColumn<PlanningRow>[] = [
    {
      id: "version",
      header: "Version",
      cell: (row) => (
        <div className="flex min-w-44 flex-col gap-0.5">
          <Link
            className="font-medium underline"
            href={`/forecast/${kind === "targets" ? "targets" : "scenarios"}/${encodeURIComponent(row.id)}`}
          >
            {row.id}
          </Link>
          <span className="text-xs text-muted-foreground">
            v{row.versionNumber} · {row.actualBasis}
          </span>
        </div>
      ),
    },
    {
      id: "period",
      header: "Period",
      cell: (row) => (
        <span className="whitespace-nowrap">
          {row.startsOn} → {row.endsOn}
        </span>
      ),
    },
    {
      id: "basis",
      header: kind === "targets" ? "Target" : "Scenario",
      cell: (row) =>
        "amountMinor" in row ? (
          <MoneyCell minor={row.amountMinor} />
        ) : (
          <span className="capitalize">
            {row.scenario}
            {row.customScenarioName ? ` · ${row.customScenarioName}` : ""}
          </span>
        ),
    },
    { id: "state", header: "State", cell: (row) => <StatusBadge status={row.state} /> },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <PlanningTabs />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            Bộ lọc
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            {kind === "targets" ? "Tạo target" : "Tạo scenario"}
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {kind === "targets" ? "Revenue target versions" : "Forecast scenario versions"}
          </CardTitle>
          <CardDescription>
            {kind === "targets"
              ? "Target theo kỳ và selected actual basis; revision không ghi đè version đã publish."
              : "Base, best, worst và custom scenario; snapshot cuối tháng được giữ để review accuracy."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={loading}
            error={error}
            emptyTitle={kind === "targets" ? "Chưa có revenue target" : "Chưa có forecast scenario"}
          />
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <form onSubmit={create}>
            <DialogHeader>
              <DialogTitle>
                {kind === "targets" ? "Tạo target version" : "Tạo forecast version"}
              </DialogTitle>
              <DialogDescription>
                Form ngắn tạo draft; publish được thực hiện tại trang chi tiết.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="grid py-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="plan-version">Version</FieldLabel>
                <Input
                  id="plan-version"
                  name="versionNumber"
                  type="number"
                  min="1"
                  defaultValue="1"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="plan-previous">Previous version ID</FieldLabel>
                <Input id="plan-previous" name="previousVersionId" />
              </Field>
              {kind === "targets" ? (
                <>
                  <SelectField
                    name="periodKind"
                    label="Period kind"
                    values={["month", "quarter", "year"]}
                  />
                  <Field>
                    <FieldLabel htmlFor="plan-amount">Target amount (minor)</FieldLabel>
                    <Input id="plan-amount" name="amountMinor" inputMode="numeric" required />
                  </Field>
                </>
              ) : (
                <>
                  <SelectField
                    name="scenario"
                    label="Scenario"
                    values={["base", "best", "worst", "custom"]}
                  />
                  <Field>
                    <FieldLabel htmlFor="plan-custom">Custom scenario name</FieldLabel>
                    <Input id="plan-custom" name="customScenarioName" />
                  </Field>
                  <SelectField
                    name="snapshotKind"
                    label="Snapshot kind"
                    values={["working", "month_end"]}
                  />
                  <Field>
                    <FieldLabel htmlFor="plan-asof">As-of date</FieldLabel>
                    <Input
                      id="plan-asof"
                      name="asOfDate"
                      type="date"
                      defaultValue={today()}
                      required
                    />
                  </Field>
                </>
              )}
              <Field>
                <FieldLabel htmlFor="plan-start">Starts on</FieldLabel>
                <Input id="plan-start" name="startsOn" type="date" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="plan-end">Ends on</FieldLabel>
                <Input id="plan-end" name="endsOn" type="date" required />
              </Field>
              <SelectField
                name="actualBasis"
                label="Actual basis"
                values={["recognized", "invoiced", "collected"]}
              />
              <Field>
                <FieldLabel htmlFor="plan-currency">Currency</FieldLabel>
                <Input id="plan-currency" name="currency" defaultValue="VND" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="plan-team">Team</FieldLabel>
                <Input id="plan-team" name="teamId" />
              </Field>
              <Field>
                <FieldLabel htmlFor="plan-service">Service line</FieldLabel>
                <Input id="plan-service" name="serviceLineCode" />
              </Field>
              <Field>
                <FieldLabel htmlFor="plan-owner">Owner</FieldLabel>
                <Input id="plan-owner" name="ownerId" />
              </Field>
              <Field>
                <FieldLabel htmlFor="plan-reason">Reason</FieldLabel>
                <Input id="plan-reason" name="reason" required />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit">Lưu draft</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent className="w-[min(96vw,30rem)]">
          <form action={applyFilters} className="flex h-full min-h-0 flex-col">
            <SheetHeader>
              <SheetTitle>Bộ lọc kế hoạch</SheetTitle>
              <SheetDescription>Bộ lọc được giữ trên URL để chia sẻ cùng team.</SheetDescription>
            </SheetHeader>
            <FieldGroup className="min-h-0 flex-1 overflow-y-auto py-4">
              {kind === "targets" ? (
                <SelectField
                  name="periodKind"
                  label="Period kind"
                  values={["month", "quarter", "year"]}
                  allowAll
                />
              ) : (
                <>
                  <SelectField
                    name="scenario"
                    label="Scenario"
                    values={["base", "best", "worst", "custom"]}
                    allowAll
                  />
                  <SelectField
                    name="snapshotKind"
                    label="Snapshot kind"
                    values={["working", "month_end"]}
                    allowAll
                  />
                </>
              )}
              <SelectField
                name="actualBasis"
                label="Actual basis"
                values={["recognized", "invoiced", "collected"]}
                allowAll
              />
              <SelectField
                name="state"
                label="State"
                values={["draft", "published", "superseded"]}
                allowAll
              />
              <Field>
                <FieldLabel htmlFor="filter-start">Starts on</FieldLabel>
                <Input
                  id="filter-start"
                  name="startsOn"
                  type="date"
                  defaultValue={searchParams.get("startsOn") ?? ""}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="filter-end">Ends on</FieldLabel>
                <Input
                  id="filter-end"
                  name="endsOn"
                  type="date"
                  defaultValue={searchParams.get("endsOn") ?? ""}
                />
              </Field>
            </FieldGroup>
            <SheetFooter>
              <Button type="submit">Áp dụng</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SelectField({
  name,
  label,
  values,
  allowAll = false,
}: Readonly<{ name: string; label: string; values: readonly string[]; allowAll?: boolean }>) {
  const searchParams = useSearchParams();
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select name={name} defaultValue={searchParams.get(name) ?? (allowAll ? "__all" : values[0])}>
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

export function PlanningDetailWorkspace({
  kind,
  id,
}: Readonly<{ kind: PlanningKind; id: string }>) {
  const client = useClient();
  const [resource, setResource] = useState<PlanningRow>();
  const [error, setError] = useState<string>();
  const [action, setAction] = useState<"publish" | "supersede">();
  const [reason, setReason] = useState("");
  const path = kind === "targets" ? planningApi.target(id) : planningApi.forecast(id);
  const load = useCallback(async () => {
    try {
      setResource(await client.data<PlanningRow>(path));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải version");
    }
  }, [client, path]);
  useEffect(() => void load(), [load]);
  async function run() {
    if (!resource || !action) return;
    const actionPath =
      kind === "targets"
        ? planningApi.targetAction(id, action)
        : planningApi.forecastAction(id, action);
    await client.data(actionPath, {
      method: "POST",
      expectedVersion: resource.resourceVersion,
      body: { schemaVersion: 1, expectedResourceVersion: resource.resourceVersion, reason },
    });
    setAction(undefined);
    setReason("");
    await load();
  }
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (!resource) return <div className="text-sm text-muted-foreground">Đang tải version…</div>;
  const dangerous = action === "supersede";
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PlanningTabs />
      <Card>
        <CardHeader>
          <CardTitle>{resource.id}</CardTitle>
          <CardDescription>
            Version {resource.versionNumber} · {resource.startsOn} → {resource.endsOn}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="State" value={resource.state} />
          <Fact label="Actual basis" value={resource.actualBasis} />
          <Fact label="Currency" value={resource.currency} />
          {"amountMinor" in resource ? (
            <Fact label="Target amount" value={<MoneyCell minor={resource.amountMinor} />} />
          ) : (
            <>
              <Fact label="Scenario" value={resource.scenario} />
              <Fact label="Snapshot" value={`${resource.snapshotKind} · ${resource.asOfDate}`} />
            </>
          )}
          <Fact
            label="Dimensions"
            value={
              [
                resource.dimensions.teamId,
                resource.dimensions.serviceLineCode,
                resource.dimensions.ownerId,
              ]
                .filter(Boolean)
                .join(" · ") || "Toàn công ty"
            }
          />
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        {resource.nextActions.includes("publish") && (
          <Button onClick={() => setAction("publish")}>Publish version</Button>
        )}
        {resource.nextActions.includes("supersede") && (
          <Button variant="destructive" onClick={() => setAction("supersede")}>
            Supersede version
          </Button>
        )}
      </div>
      <Dialog open={action === "publish"} onOpenChange={(open) => !open && setAction(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish version?</DialogTitle>
            <DialogDescription>
              Version sau publish là nguồn kế hoạch được chọn; actual data không bị thay đổi.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="publish-reason">Reason</FieldLabel>
            <Input
              id="publish-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button disabled={!reason.trim()} onClick={() => void run()}>
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={dangerous} onOpenChange={(open) => !open && setAction(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supersede version?</AlertDialogTitle>
            <AlertDialogDescription>
              Version cũ vẫn được giữ để audit. Hãy ghi lý do thay đổi trước khi tiếp tục.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="supersede-reason">Reason</FieldLabel>
            <Input
              id="supersede-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ nguyên</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!reason.trim()}
              onClick={() => void run()}
            >
              Supersede
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Fact({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-medium capitalize">{value}</div>
    </div>
  );
}
