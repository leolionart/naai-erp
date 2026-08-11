"use client";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { KpiCard } from "@/components/financial/kpi-card";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  createApiClient,
  DEFAULT_API_CONNECTION,
  loadApiToken,
  loadConnectionSettings,
  projectRevenueApi,
  type ApiConnectionSettingsV1,
  type BudgetVersion,
  type MilestoneAcceptance,
  type RecognitionEvent,
  type RevenueAxes,
  type ScopeChange,
} from "@/lib/api";
const today = () => new Date().toISOString().slice(0, 10);
function useClient() {
  const [c, setC] = useState<ApiConnectionSettingsV1>(DEFAULT_API_CONNECTION),
    [t, setT] = useState("");
  useEffect(() => {
    setC(loadConnectionSettings(localStorage));
    setT(loadApiToken(sessionStorage));
  }, []);
  return useMemo(() => createApiClient({ connection: () => c, token: () => t }), [c, t]);
}
function LifecycleActions({
  resource,
  path,
  reload,
}: Readonly<{
  resource: { resourceVersion: string; nextActions: readonly string[] };
  path: string;
  reload: () => Promise<void>;
}>) {
  const client = useClient();
  const [action, setAction] = useState<string>(),
    [reason, setReason] = useState("");
  const dangerous = ["reject", "reverse", "supersede"].includes(action ?? "");
  async function run() {
    if (!action) return;
    await client.data(projectRevenueApi.action(path, action), {
      method: "POST",
      body: { schemaVersion: 1, expectedResourceVersion: resource.resourceVersion, reason },
    });
    setAction(undefined);
    setReason("");
    await reload();
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {resource.nextActions.map((a) => (
          <Button
            key={a}
            variant={["reject", "reverse", "supersede"].includes(a) ? "destructive" : "outline"}
            onClick={() => setAction(a)}
          >
            {a}
          </Button>
        ))}
      </div>
      <Dialog open={Boolean(action && !dangerous)} onOpenChange={(o) => !o && setAction(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action} resource</DialogTitle>
            <DialogDescription>
              Lifecycle action có expected version và audit reason.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="revenue-action-reason">Reason</FieldLabel>
              <Input
                id="revenue-action-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button onClick={() => void run()} disabled={!reason.trim()}>
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={dangerous} onOpenChange={(o) => !o && setAction(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{action} resource?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động giữ lịch sử và có thể tạo reversal/superseding version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="danger-reason">Reason</FieldLabel>
              <Input
                id="danger-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ nguyên</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void run()}
              disabled={!reason.trim()}
            >
              Xác nhận
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ProjectBudgetWorkspace({ projectId }: Readonly<{ projectId: string }>) {
  const client = useClient(),
    params = useSearchParams();
  const [rows, setRows] = useState<BudgetVersion[]>([]),
    [axes, setAxes] = useState<RevenueAxes>(),
    [dialog, setDialog] = useState(false);
  const asOf = params.get("asOf") || today();
  const load = useCallback(async () => {
    try {
      const [b, a] = await Promise.all([
        client
          .data<{ items: readonly BudgetVersion[] }>(projectRevenueApi.budgets(projectId))
          .catch(() => ({ items: [] })),
        client
          .data<Record<string, string | boolean>>(projectRevenueApi.axes(projectId, asOf))
          .then((wire) => {
            const recognized = BigInt(String(wire.recognizedRevenueMinor ?? "0"));
            const invoiced = BigInt(String(wire.invoicedRevenueMinor ?? "0"));
            const collected = String(wire.collectedCashMinor ?? "0").split(".")[0] || "0";
            return {
              startsOn: "—",
              endsOn: String(wire.asOf ?? asOf),
              recognizedNetMinor: recognized.toString(),
              invoicedNetMinor: invoiced.toString(),
              collectedGrossMinor: collected,
              collectedNetMinor: collected,
              deferredRevenueMinor: (invoiced > recognized ? invoiced - recognized : 0n).toString(),
              contractAssetMinor: (recognized > invoiced ? recognized - invoiced : 0n).toString(),
            } as RevenueAxes;
          })
          .catch(() => undefined),
      ]);
      setRows([...(b?.items ?? [])]);
      if (a) setAxes(a);
    } catch {
      setRows([]);
    }
  }, [asOf, client, projectId]);
  useEffect(() => void load(), [load]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await client.data(projectRevenueApi.budgets(projectId), {
      method: "POST",
      body: {
        schemaVersion: 1,
        projectId,
        versionNumber: rows.length + 1,
        kind: rows.length ? "revision" : "baseline",
        currency: f.get("currency"),
        effectiveOn: f.get("effectiveFrom"),
        lines: [
          { id: `revenue-${Date.now()}`, category: "revenue", amountMinor: f.get("revenue") },
          { id: `direct-${Date.now()}`, category: "vendor", amountMinor: f.get("directCost") },
        ],
        reason: f.get("reason"),
      },
    });
    setDialog(false);
    await load();
  }
  const columns: readonly FinancialColumn<BudgetVersion>[] = [
    {
      id: "version",
      header: "Version",
      cell: (r) => (
        <Link
          className="font-medium underline"
          href={`/projects/${projectId}/budget/versions/${r.id}`}
        >
          v{r.versionNumber} · {r.kind}
        </Link>
      ),
    },
    {
      id: "revenue",
      header: "Revenue",
      align: "right",
      cell: (r) => <MoneyCell minor={r.revenueTotalMinor} />,
    },
    {
      id: "cost",
      header: "Costs",
      align: "right",
      cell: (r) => <MoneyCell minor={r.directCostTotalMinor} />,
    },
    { id: "state", header: "State", cell: (r) => <StatusBadge status={r.state} /> },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between">
        <Button variant="outline" asChild>
          <Link href="/scope-changes">Scope changes</Link>
        </Button>
      </div>
      <RevenueAxesCards axes={axes} />
      <Card>
        <CardHeader>
          <CardTitle>Project budget versions</CardTitle>
          <CardDescription>
            Approved version không bị rewrite; scope change tạo delta riêng.
          </CardDescription>
          <CardAction>
            <Button onClick={() => setDialog(true)}>Tạo budget version</Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <FinancialDataTable rows={rows} columns={columns} rowKey={(r) => r.id} />
        </CardContent>
      </Card>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <form onSubmit={create}>
            <DialogHeader>
              <DialogTitle>Tạo budget version</DialogTitle>
              <DialogDescription>Short form cho một version mới.</DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              {[
                ["name", "Tên version"],
                ["revenue", "Revenue budget"],
                ["directCost", "Direct cost"],
                ["reason", "Reason"],
              ].map(([n, l]) => (
                <Field key={n}>
                  <FieldLabel htmlFor={`budget-${n}`}>{l}</FieldLabel>
                  <Input id={`budget-${n}`} name={n} required />
                </Field>
              ))}
              <Field>
                <FieldLabel htmlFor="budget-currency">Currency</FieldLabel>
                <Input id="budget-currency" name="currency" defaultValue="VND" />
              </Field>
              <Field>
                <FieldLabel htmlFor="budget-effective">Effective from</FieldLabel>
                <Input id="budget-effective" name="effectiveFrom" type="date" required />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit">Tạo draft version</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function RevenueAxesCards({ axes }: Readonly<{ axes?: RevenueAxes }>) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          title="Doanh thu đã ghi nhận"
          period={axes ? `${axes.startsOn} → ${axes.endsOn}` : "Period"}
          value={<MoneyCell minor={axes?.recognizedNetMinor ?? "0"} />}
          comparison="Theo chính sách và mốc đã post"
        />
        <KpiCard
          title="Giá trị đã xuất hóa đơn"
          period="Trục hóa đơn"
          value={<MoneyCell minor={axes?.invoicedNetMinor ?? "0"} />}
          comparison="Không đồng nghĩa đã thu tiền"
        />
        <KpiCard
          title="Đã thu từ khách hàng"
          period="Trục dòng tiền"
          value={<MoneyCell minor={axes?.collectedGrossMinor ?? "0"} />}
          comparison={`Net ${axes?.collectedNetMinor ?? "0"}`}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          title="Doanh thu chưa thực hiện"
          period="Đã xuất hóa đơn nhưng chưa ghi nhận"
          value={<MoneyCell minor={axes?.deferredRevenueMinor ?? "0"} />}
        />
        <KpiCard
          title="Doanh thu đã ghi nhận chưa xuất hóa đơn"
          period="Tài sản hợp đồng"
          value={<MoneyCell minor={axes?.contractAssetMinor ?? "0"} />}
        />
      </div>
    </>
  );
}

function Queue<Row extends { id: string; state: string }>({
  title,
  description,
  rows,
  columns,
  action,
}: Readonly<{
  title: string;
  description: string;
  rows: readonly Row[];
  columns: readonly FinancialColumn<Row>[];
  action?: ReactNode;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>
        <FinancialDataTable rows={rows} columns={columns} rowKey={(r) => r.id} />
      </CardContent>
    </Card>
  );
}
export function ScopeChangeQueueWorkspace() {
  const client = useClient();
  const [rows, setRows] = useState<ScopeChange[]>([]);
  const load = useCallback(
    async () =>
      setRows([
        ...(await client.data<{ items: readonly ScopeChange[] }>(projectRevenueApi.scopeChanges))
          .items,
      ]),
    [client],
  );
  useEffect(() => void load(), [load]);
  return (
    <Queue
      title="Scope-change queue"
      description="Delta revenue/cost không rewrite approved budget."
      rows={rows}
      columns={[
        {
          id: "title",
          header: "Scope change",
          cell: (r) => (
            <Link className="font-medium underline" href={`/scope-changes/${r.id}`}>
              {r.reason}
            </Link>
          ),
        },
        {
          id: "revenue",
          header: "Revenue delta",
          align: "right",
          cell: (r) => <MoneyCell minor={r.expectedRevenueImpactMinor} />,
        },
        {
          id: "cost",
          header: "Cost delta",
          align: "right",
          cell: (r) => <MoneyCell minor={r.expectedCostImpactMinor} />,
        },
        { id: "state", header: "State", cell: (r) => <StatusBadge status={r.state} /> },
      ]}
    />
  );
}
export function RevenueRecognitionQueueWorkspace() {
  const client = useClient();
  const [events, setEvents] = useState<RecognitionEvent[]>([]),
    [acceptances, setAcceptances] = useState<MilestoneAcceptance[]>([]);
  const load = useCallback(async () => {
    const [e, a] = await Promise.all([
      client.data<{ items: readonly RecognitionEvent[] }>(projectRevenueApi.events),
      client.data<{ items: readonly MilestoneAcceptance[] }>(projectRevenueApi.acceptances),
    ]);
    setEvents([...e.items]);
    setAcceptances([...a.items]);
  }, [client]);
  useEffect(() => void load(), [load]);
  return (
    <div className="flex flex-col gap-4">
      <Button variant="outline" asChild>
        <Link href="/milestone-acceptances">Milestone acceptances</Link>
      </Button>
      <Queue
        title="Recognition events"
        description="Recognition requires policy and accepted evidence."
        rows={events}
        columns={[
          {
            id: "event",
            header: "Event",
            cell: (r) => (
              <Link className="font-medium underline" href={`/revenue-recognition/${r.id}`}>
                {r.accountingRoute} · {r.milestoneId ?? r.contractId}
              </Link>
            ),
          },
          {
            id: "recognized",
            header: "Recognized gross",
            align: "right",
            cell: (r) => <MoneyCell minor={r.amountMinor} />,
          },
          { id: "date", header: "Date", cell: (r) => r.recognitionDate },
          { id: "state", header: "State", cell: (r) => <StatusBadge status={r.state} /> },
        ]}
      />
      <Queue
        title="Recent milestone acceptance"
        description="Acceptance is evidence, not recognition by itself."
        rows={acceptances}
        columns={[
          { id: "milestone", header: "Milestone", cell: (r) => r.milestoneId },
          {
            id: "amount",
            header: "Amount",
            align: "right",
            cell: (r) => <MoneyCell minor={r.acceptedAmountMinor ?? r.milestoneAmountMinor} />,
          },
          { id: "state", header: "State", cell: (r) => <StatusBadge status={r.state} /> },
        ]}
      />
    </div>
  );
}
export function MilestoneAcceptanceWorkspace() {
  const client = useClient();
  const [rows, setRows] = useState<MilestoneAcceptance[]>([]),
    [dialog, setDialog] = useState(false);
  const load = useCallback(
    async () =>
      setRows([
        ...(
          await client.data<{ items: readonly MilestoneAcceptance[] }>(
            projectRevenueApi.acceptances,
          )
        ).items,
      ]),
    [client],
  );
  useEffect(() => void load(), [load]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await client.data(projectRevenueApi.acceptances, {
      method: "POST",
      body: {
        schemaVersion: 1,
        milestoneId: f.get("milestoneId"),
        reason: f.get("reason"),
      },
    });
    setDialog(false);
    await load();
  }
  return (
    <div className="flex flex-col gap-4">
      <Queue
        title="Milestone acceptance"
        description="Evidence bắt buộc trước recognition."
        rows={rows}
        action={<Button onClick={() => setDialog(true)}>Ghi nhận acceptance</Button>}
        columns={[
          { id: "milestone", header: "Milestone", cell: (r) => r.milestoneId },
          { id: "accepted", header: "Accepted on", cell: (r) => r.acceptedOn ?? "—" },
          {
            id: "amount",
            header: "Amount",
            align: "right",
            cell: (r) => <MoneyCell minor={r.acceptedAmountMinor ?? r.milestoneAmountMinor} />,
          },
          { id: "state", header: "State", cell: (r) => <StatusBadge status={r.state} /> },
        ]}
      />
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <form onSubmit={create}>
            <DialogHeader>
              <DialogTitle>Ghi nhận milestone acceptance</DialogTitle>
              <DialogDescription>
                Short form; detail review nằm trên dedicated route.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              {[
                ["milestoneId", "Milestone ID"],
                ["reason", "Reason"],
              ].map(([n, l]) => (
                <Field key={n}>
                  <FieldLabel htmlFor={`accept-${n}`}>{l}</FieldLabel>
                  <Input id={`accept-${n}`} name={n} required />
                </Field>
              ))}
            </FieldGroup>
            <DialogFooter>
              <Button type="submit">Tạo draft acceptance</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function ResourceDetailWorkspace({
  kind,
  id,
}: Readonly<{ kind: "budget" | "scope" | "recognition"; id: string }>) {
  const client = useClient();
  const [resource, setResource] = useState<{
    id: string;
    state: string;
    resourceVersion: string;
    nextActions: readonly string[];
    title?: string;
    name?: string;
    [key: string]: unknown;
  }>();
  const path =
    kind === "scope"
      ? projectRevenueApi.scopeChange(id)
      : kind === "recognition"
        ? projectRevenueApi.event(id)
        : id;
  const load = useCallback(
    async () =>
      setResource(
        await client.data<{
          id: string;
          state: string;
          resourceVersion: string;
          nextActions: readonly string[];
          title?: string;
          name?: string;
          [key: string]: unknown;
        }>(path),
      ),
    [client, path],
  );
  useEffect(() => void load(), [load]);
  if (!resource)
    return (
      <Card>
        <CardContent>Đang tải…</CardContent>
      </Card>
    );
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{resource.title ?? resource.name ?? resource.id}</CardTitle>
          <CardDescription>
            <StatusBadge status={resource.state} />
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {Object.entries(resource)
            .filter(([k]) =>
              [
                "projectId",
                "currency",
                "recognitionDate",
                "revenueDeltaMinor",
                "costDeltaMinor",
                "journalId",
              ].includes(k),
            )
            .map(([k, v]) => (
              <div key={k}>
                <span className="text-xs text-muted-foreground">{k}</span>
                <div>{String(v)}</div>
              </div>
            ))}
        </CardContent>
      </Card>
      <LifecycleActions resource={resource} path={path} reload={load} />
    </div>
  );
}
