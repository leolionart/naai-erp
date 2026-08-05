"use client";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterIcon, RefreshCwIcon } from "lucide-react";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { KpiCard } from "@/components/financial/kpi-card";
import { MoneyCell } from "@/components/financial/money-cell";
import { StatusBadge } from "@/components/financial/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  projectCostApi,
  type ApiConnectionSettingsV1,
  type DirectCostAllocation,
  type ProjectCostItem,
  type UnallocatedCostSource,
} from "@/lib/api";

function useClient() {
  const [c, setC] = useState<ApiConnectionSettingsV1>(DEFAULT_API_CONNECTION),
    [t, setT] = useState("");
  useEffect(() => {
    setC(loadConnectionSettings(localStorage));
    setT(loadApiToken(sessionStorage));
  }, []);
  return useMemo(() => createApiClient({ connection: () => c, token: () => t }), [c, t]);
}
const sumBase = (rows: readonly ProjectCostItem[]) =>
  rows.reduce((sum, row) => sum + BigInt(row.baseAmountMinor), 0n).toString();
function drilldown(item: ProjectCostItem) {
  return (
    <div className="flex min-w-52 flex-wrap gap-1">
      <Button size="sm" variant="outline" asChild>
        <Link href={item.drilldown.sourceHref}>Nguồn</Link>
      </Button>
      {item.drilldown.journalHref ? (
        <Button size="sm" variant="ghost" asChild>
          <Link href={item.drilldown.journalHref}>Journal</Link>
        </Button>
      ) : null}
      {item.drilldown.timesheetHref ? (
        <Button size="sm" variant="ghost" asChild>
          <Link href={item.drilldown.timesheetHref}>Timesheet</Link>
        </Button>
      ) : null}
      {item.drilldown.evidenceHrefs.map((href) => (
        <Button size="sm" variant="ghost" asChild key={href}>
          <Link href={href}>Evidence</Link>
        </Button>
      ))}
    </div>
  );
}
export function ProjectCostsWorkspace({ projectId }: Readonly<{ projectId: string }>) {
  const client = useClient(),
    router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const [rows, setRows] = useState<ProjectCostItem[]>([]),
    [loading, setLoading] = useState(false),
    [filters, setFilters] = useState(false);
  const costClass = params.get("costClass") || "",
    sourceType = params.get("sourceType") || "";
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (costClass) query.set("costClass", costClass);
      if (sourceType) query.set("sourceType", sourceType);
      const data = await client.data<{ items: readonly ProjectCostItem[] }>(
        projectCostApi.costs(projectId, query.toString()),
      );
      setRows([...data.items]);
    } finally {
      setLoading(false);
    }
  }, [client, costClass, projectId, sourceType]);
  useEffect(() => void load(), [load]);
  const ledger = rows.filter((r) => r.basis === "ledger"),
    management = rows.filter((r) => r.basis === "management");
  const columns: readonly FinancialColumn<ProjectCostItem>[] = [
    {
      id: "source",
      header: "Nguồn / class",
      cell: (r) => (
        <div className="flex min-w-44 flex-col">
          <strong>{r.drilldown.sourceType}</strong>
          <span className="text-xs text-muted-foreground">{r.costClass}</span>
        </div>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (r) => <MoneyCell minor={r.amountMinor} />,
    },
    {
      id: "base",
      header: "Base",
      align: "right",
      cell: (r) => <MoneyCell minor={r.baseAmountMinor} />,
    },
    { id: "drill", header: "Drill-down", cell: drilldown },
  ];
  function apply(form: FormData) {
    const q = new URLSearchParams();
    for (const key of ["costClass", "sourceType"] as const) {
      const v = String(form.get(key) ?? "").trim();
      if (v) q.set(key, v);
    }
    router.replace(`${pathname}?${q}`);
    setFilters(false);
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" asChild>
          <Link href="/project-costs/unallocated">Nguồn chưa phân bổ</Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setFilters(true)}>
            <FilterIcon data-icon="inline-start" />
            Bộ lọc
          </Button>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCwIcon data-icon="inline-start" />
            Tải lại
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          title="Ledger-backed cost"
          period="Posted financial sources"
          value={<MoneyCell minor={sumBase(ledger)} />}
          loading={loading}
        />
        <KpiCard
          title="Management labor cost"
          period="Approved timesheet applied cost"
          value={<MoneyCell minor={sumBase(management)} />}
          comparison="Không trộn vào ledger total"
          loading={loading}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Ledger-backed direct cost</CardTitle>
          <CardDescription>Invoice, expense, journal và posted allocation.</CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={ledger}
            columns={columns}
            rowKey={(r) => r.id}
            loading={loading}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Management labor cost</CardTitle>
          <CardDescription>
            Applied labor cost từ approved timesheet; hiển thị tách biệt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={management}
            columns={columns}
            rowKey={(r) => r.id}
            loading={loading}
          />
        </CardContent>
      </Card>
      <Sheet open={filters} onOpenChange={setFilters}>
        <SheetContent>
          <form action={apply} className="flex h-full flex-col">
            <SheetHeader>
              <SheetTitle>Bộ lọc project cost</SheetTitle>
              <SheetDescription>Context nằm trên URL.</SheetDescription>
            </SheetHeader>
            <div className="flex-1 px-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="cost-class">Cost class</FieldLabel>
                  <Input id="cost-class" name="costClass" defaultValue={costClass} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="source-type">Source type</FieldLabel>
                  <Input id="source-type" name="sourceType" defaultValue={sourceType} />
                </Field>
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

export function UnallocatedCostsWorkspace() {
  const client = useClient();
  const [rows, setRows] = useState<UnallocatedCostSource[]>([]),
    [selected, setSelected] = useState<UnallocatedCostSource>(),
    [notice, setNotice] = useState("Nguồn ledger chưa được phân bổ vào project.");
  const load = useCallback(async () => {
    const data = await client.data<{ items: readonly UnallocatedCostSource[] }>(
      projectCostApi.unallocated,
    );
    setRows([...data.items]);
  }, [client]);
  useEffect(() => void load(), [load]);
  async function allocate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const f = new FormData(event.currentTarget);
    await client.data(projectCostApi.allocations, {
      method: "POST",
      body: {
        schemaVersion: 1,
        sourceId: selected.id,
        splits: [
          {
            projectId: String(f.get("projectId")),
            amountMinor: String(f.get("amountMinor")),
            baseAmountMinor: String(f.get("baseAmountMinor")),
          },
        ],
        reason: f.get("reason"),
      },
    });
    setSelected(undefined);
    setNotice("Đã tạo draft allocation; cần submit/approve/post.");
    await load();
  }
  const columns: readonly FinancialColumn<UnallocatedCostSource>[] = [
    {
      id: "source",
      header: "Nguồn",
      cell: (r) => (
        <div className="flex min-w-48 flex-col">
          <strong>{r.sourceType}</strong>
          <span className="text-xs text-muted-foreground">
            {r.sourceType} · {r.sourceId}
          </span>
        </div>
      ),
    },
    {
      id: "amount",
      header: "Available",
      align: "right",
      cell: (r) => <MoneyCell minor={r.remainingAmountMinor} />,
    },
    {
      id: "action",
      header: "Allocation",
      cell: (r) => (
        <Button size="sm" variant="outline" onClick={() => setSelected(r)}>
          Phân bổ
        </Button>
      ),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>{notice}</AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>Unallocated cost sources</CardTitle>
          <CardDescription>Không cho phép double count direct cost và overhead.</CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable rows={rows} columns={columns} rowKey={(r) => r.id} />
        </CardContent>
      </Card>
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(undefined)}>
        <DialogContent>
          <form onSubmit={allocate}>
            <DialogHeader>
              <DialogTitle>Phân bổ direct cost</DialogTitle>
              <DialogDescription>
                {selected?.sourceType} · available {selected?.remainingAmountMinor}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="allocation-project">Project ID</FieldLabel>
                <Input id="allocation-project" name="projectId" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="allocation-amount">Amount</FieldLabel>
                <Input
                  id="allocation-amount"
                  name="amountMinor"
                  defaultValue={selected?.remainingAmountMinor}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="allocation-base">Base amount</FieldLabel>
                <Input
                  id="allocation-base"
                  name="baseAmountMinor"
                  defaultValue={selected?.remainingBaseAmountMinor}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="allocation-reason">Reason</FieldLabel>
                <Input id="allocation-reason" name="reason" required />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit">Tạo draft allocation</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function DirectCostAllocationWorkspace({
  allocationId,
}: Readonly<{ allocationId: string }>) {
  const client = useClient();
  const [item, setItem] = useState<DirectCostAllocation>(),
    [action, setAction] = useState<string>(),
    [reason, setReason] = useState("");
  const load = useCallback(
    async () =>
      setItem(await client.data<DirectCostAllocation>(projectCostApi.allocation(allocationId))),
    [allocationId, client],
  );
  useEffect(() => void load(), [load]);
  async function mutate() {
    if (!item || !action) return;
    await client.data(projectCostApi.allocationAction(item.id, action), {
      method: "POST",
      body: { schemaVersion: 1, expectedResourceVersion: item.resourceVersion, reason },
    });
    setAction(undefined);
    setReason("");
    await load();
  }
  const reverse = action === "reverse";
  return (
    <div className="flex flex-col gap-4">
      <Button variant="outline" asChild>
        <Link href="/project-costs/unallocated">Về queue</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{item?.splits[0]?.projectId ?? allocationId}</CardTitle>
          <CardDescription>
            <StatusBadge status={item?.state ?? "draft"} />
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>Source: {item?.source.sourceId}</div>
          <div>Class: {item?.source.costClass}</div>
          <div>
            Amount:{" "}
            {item?.splits[0] ? (
              <MoneyCell minor={item.splits[0].amountMinor} className="text-left" />
            ) : (
              "—"
            )}
          </div>
          <div>
            Journal:{" "}
            {item?.journalId ? (
              <Link className="underline" href={`/accounting/journals?journalId=${item.journalId}`}>
                {item.journalId}
              </Link>
            ) : (
              "—"
            )}
          </div>
        </CardContent>
      </Card>
      <div className="flex gap-2">
        {item?.nextActions.map((next) => (
          <Button
            key={next}
            variant={next === "reverse" ? "destructive" : "outline"}
            onClick={() => setAction(next)}
          >
            {next}
          </Button>
        ))}
      </div>
      <Dialog
        open={Boolean(action && !reverse)}
        onOpenChange={(open) => !open && setAction(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action} allocation</DialogTitle>
            <DialogDescription>Mutation có expected version và reason.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="allocation-action-reason">Reason</FieldLabel>
              <Input
                id="allocation-action-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button onClick={() => void mutate()} disabled={!reason.trim()}>
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={reverse} onOpenChange={(open) => !open && setAction(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse posted allocation?</AlertDialogTitle>
            <AlertDialogDescription>
              Tạo reversal journal; không xóa lịch sử.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="reverse-allocation-reason">Reason</FieldLabel>
              <Input
                id="reverse-allocation-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ nguyên</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void mutate()}
              disabled={!reason.trim()}
            >
              Xác nhận reverse
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
