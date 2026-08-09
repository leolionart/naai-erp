"use client";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
  createApiClient,
  DEFAULT_API_CONNECTION,
  loadApiToken,
  loadConnectionSettings,
  overheadApi,
  type ApiConnectionSettingsV1,
  type OverheadPolicy,
  type OverheadPool,
  type OverheadRun,
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
function Nav() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild>
        <Link href="/overhead/policies">Policies</Link>
      </Button>
      <Button variant="outline" asChild>
        <Link href="/overhead/pools">Source pools</Link>
      </Button>
      <Button variant="outline" asChild>
        <Link href="/overhead/runs">Allocation runs</Link>
      </Button>
    </div>
  );
}
type Kind = "policies" | "pools" | "runs";
type Row = OverheadPolicy | OverheadPool | OverheadRun;
export function OverheadQueueWorkspace({ kind }: Readonly<{ kind: Kind }>) {
  const client = useClient(),
    params = useSearchParams(),
    router = useRouter(),
    pathname = usePathname();
  const [rows, setRows] = useState<Row[]>([]),
    [dialog, setDialog] = useState(false),
    [filters, setFilters] = useState(false);
  const state = params.get("state") || "",
    periodStart = params.get("periodStart") || "",
    periodEnd = params.get("periodEnd") || "";
  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (state) q.set("state", state);
    if (periodStart) q.set("periodStart", periodStart);
    if (periodEnd) q.set("periodEnd", periodEnd);
    setRows([
      ...(
        await client.data<{ items: readonly Row[] }>(`${overheadApi[kind]}${q.size ? `?${q}` : ""}`)
      ).items,
    ]);
  }, [client, kind, periodEnd, periodStart, state]);
  useEffect(() => void load(), [load]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let body: Record<string, unknown> = { schemaVersion: 1, reason: f.get("reason") };
    if (kind === "policies")
      body = {
        ...body,
        policyCode: f.get("policyCode"),
        versionNumber: Number(f.get("versionNumber")),
        name: f.get("name"),
        method: f.get("method"),
        costClass: f.get("costClass"),
        effectiveFrom: f.get("effectiveFrom"),
        configuration: {},
      };
    else if (kind === "pools")
      body = {
        ...body,
        policyId: f.get("policyId"),
        periodStart: f.get("periodStart"),
        periodEnd: f.get("periodEnd"),
        sourceCostItemIds: String(f.get("sourceCostItemIds"))
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      };
    else body = { ...body, poolId: f.get("poolId") };
    await client.data(overheadApi[kind], { method: "POST", body });
    setDialog(false);
    await load();
  }
  const columns: readonly FinancialColumn<Row>[] = [
    {
      id: "resource",
      header: "Resource",
      cell: (r) => (
        <div className="flex min-w-48 flex-col">
          <Link
            className="font-medium underline"
            href={kind === "runs" ? `/overhead/runs/${r.id}` : `${pathname}?selected=${r.id}`}
          >
            {"name" in r ? r.name : r.id}
          </Link>
          <span className="text-xs text-muted-foreground">
            {"periodStart" in r
              ? `${r.periodStart} → ${r.periodEnd}`
              : "effectiveFrom" in r
                ? r.effectiveFrom
                : ""}
          </span>
        </div>
      ),
    },
    {
      id: "method",
      header: "Method / policy",
      cell: (r) => ("method" in r ? r.method : "policyId" in r ? r.policyId : "—"),
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (r) =>
        "allocatableAmountMinor" in r ? (
          <MoneyCell minor={r.allocatableAmountMinor} />
        ) : "sourceBaseAmountMinor" in r ? (
          <MoneyCell minor={r.sourceBaseAmountMinor} />
        ) : (
          "—"
        ),
    },
    { id: "state", header: "State", cell: (r) => <StatusBadge status={r.state} /> },
  ];
  function apply(f: FormData) {
    const q = new URLSearchParams();
    for (const k of ["state", "periodStart", "periodEnd"]) {
      const v = String(f.get(k) ?? "");
      if (v) q.set(k, v);
    }
    router.replace(`${pathname}?${q}`);
    setFilters(false);
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between gap-2">
        <Nav />
        <Button variant="outline" onClick={() => setFilters(true)}>
          Bộ lọc
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Overhead {kind}</CardTitle>
          <CardDescription>
            Queue riêng; complex run review nằm trên dedicated page.
          </CardDescription>
          <CardAction>
            <Button onClick={() => setDialog(true)}>Tạo {kind}</Button>
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
              <DialogTitle>Tạo overhead {kind}</DialogTitle>
              <DialogDescription>
                Short form; server kiểm tra effective policy, period và basis.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              {kind === "policies" ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="oh-code">Policy code</FieldLabel>
                    <Input id="oh-code" name="policyCode" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="oh-name">Name</FieldLabel>
                    <Input id="oh-name" name="name" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="oh-version">Version</FieldLabel>
                    <Input
                      id="oh-version"
                      name="versionNumber"
                      type="number"
                      defaultValue="1"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Method</FieldLabel>
                    <Select name="method" defaultValue="revenue">
                      <SelectTrigger aria-label="Method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {[
                            "revenue",
                            "labor_hours",
                            "headcount",
                            "fixed_percentage",
                            "manual",
                          ].map((x) => (
                            <SelectItem value={x} key={x}>
                              {x}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>Cost class</FieldLabel>
                    <Select name="costClass" defaultValue="fixed">
                      <SelectTrigger aria-label="Cost class">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="fixed">Fixed</SelectItem>
                          <SelectItem value="variable">Variable</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="oh-effective">Effective from</FieldLabel>
                    <Input id="oh-effective" name="effectiveFrom" type="date" required />
                  </Field>
                </>
              ) : kind === "pools" ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="oh-policy">Policy ID</FieldLabel>
                    <Input id="oh-policy" name="policyId" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="oh-start">Period start</FieldLabel>
                    <Input id="oh-start" name="periodStart" type="date" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="oh-end">Period end</FieldLabel>
                    <Input id="oh-end" name="periodEnd" type="date" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="oh-items">Source cost item IDs</FieldLabel>
                    <Input id="oh-items" name="sourceCostItemIds" required />
                  </Field>
                </>
              ) : (
                <Field>
                  <FieldLabel htmlFor="oh-pool">Pool ID</FieldLabel>
                  <Input id="oh-pool" name="poolId" required />
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="oh-reason">Reason</FieldLabel>
                <Input id="oh-reason" name="reason" required />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit">Tạo draft</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Popover open={filters} onOpenChange={setFilters}>
        <PopoverActiveAnchor open={Boolean(filters)} />
        <PopoverContent
          align="end"
          sideOffset={8}
          className="max-h-[min(80vh,40rem)] w-[min(92vw,30rem)] overflow-y-auto"
        >
          <form action={apply} className="flex h-full flex-col">
            <PopoverHeader>
              <PopoverTitle>Bộ lọc overhead</PopoverTitle>
              <PopoverDescription>Filter nằm trên URL.</PopoverDescription>
            </PopoverHeader>
            <div className="flex-1 px-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="oh-state">State</FieldLabel>
                  <Input id="oh-state" name="state" defaultValue={state} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="oh-filter-start">Period start</FieldLabel>
                  <Input
                    id="oh-filter-start"
                    name="periodStart"
                    type="date"
                    defaultValue={periodStart}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="oh-filter-end">Period end</FieldLabel>
                  <Input id="oh-filter-end" name="periodEnd" type="date" defaultValue={periodEnd} />
                </Field>
              </FieldGroup>
            </div>
            <PopoverFooter>
              <Button type="submit">Áp dụng</Button>
            </PopoverFooter>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
export function OverheadRunWorkspace({ runId }: Readonly<{ runId: string }>) {
  const client = useClient();
  const [run, setRun] = useState<OverheadRun>(),
    [action, setAction] = useState<string>(),
    [reason, setReason] = useState("");
  const load = useCallback(
    async () => setRun(await client.data<OverheadRun>(overheadApi.detail("runs", runId))),
    [client, runId],
  );
  useEffect(() => void load(), [load]);
  const actions =
    run?.state === "draft"
      ? ["submit"]
      : run?.state === "submitted"
        ? ["approve", "reject"]
        : run?.state === "approved"
          ? ["post"]
          : run?.state === "posted"
            ? ["reverse"]
            : [];
  async function mutate() {
    if (!run || !action) return;
    await client.data(overheadApi.action("runs", run.id, action), {
      method: "POST",
      body: { schemaVersion: 1, expectedResourceVersion: run.resourceVersion, reason },
    });
    setAction(undefined);
    setReason("");
    await load();
  }
  const dangerous = ["reject", "reverse"].includes(action ?? "");
  return (
    <div className="flex flex-col gap-4">
      <Nav />
      <Card>
        <CardHeader>
          <CardTitle>{run?.id ?? runId}</CardTitle>
          <CardDescription>
            <StatusBadge status={run?.state ?? "draft"} />
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>Pool: {run?.poolId}</div>
          <div>Method: {run?.method}</div>
          <div>
            Period: {run?.periodStart} → {run?.periodEnd}
          </div>
          <div>
            Allocatable:{" "}
            {run ? <MoneyCell minor={run.allocatableAmountMinor} className="text-left" /> : "—"}
          </div>
          <div>
            Journal:{" "}
            {run?.journalId ? (
              <Link
                className="underline underline-offset-4"
                href={`/accounting/journals?journalId=${encodeURIComponent(run.journalId)}`}
              >
                {run.journalId}
              </Link>
            ) : (
              "—"
            )}
          </div>
          <div>
            Reversal journal:{" "}
            {run?.reversalJournalId ? (
              <Link
                className="underline underline-offset-4"
                href={`/accounting/journals?journalId=${encodeURIComponent(run.reversalJournalId)}`}
              >
                {run.reversalJournalId}
              </Link>
            ) : (
              "—"
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Deterministic splits</CardTitle>
          <CardDescription>Basis snapshot và rounding rank được giữ để tái lập.</CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={run?.splits ?? []}
            rowKey={(r) => r.projectId}
            columns={[
              { id: "project", header: "Project", cell: (r) => r.projectId },
              { id: "basis", header: "Basis", align: "right", cell: (r) => r.basisValue },
              {
                id: "amount",
                header: "Amount",
                align: "right",
                cell: (r) => <MoneyCell minor={r.amountMinor} />,
              },
              { id: "rank", header: "Rounding rank", align: "right", cell: (r) => r.roundingRank },
            ]}
          />
        </CardContent>
      </Card>
      <div className="flex gap-2">
        {actions.map((a) => (
          <Button
            key={a}
            variant={["reject", "reverse"].includes(a) ? "destructive" : "outline"}
            onClick={() => setAction(a)}
          >
            {a}
          </Button>
        ))}
      </div>
      <Dialog open={Boolean(action && !dangerous)} onOpenChange={(o) => !o && setAction(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action} allocation run</DialogTitle>
            <DialogDescription>
              Maker-checker và open-period checks chạy ở server.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="run-reason">Reason</FieldLabel>
              <Input id="run-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button onClick={() => void mutate()} disabled={!reason.trim()}>
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={dangerous} onOpenChange={(o) => !o && setAction(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{action} overhead run?</AlertDialogTitle>
            <AlertDialogDescription>
              Reverse tạo accounting reversal và mở lại source pool; lịch sử không bị xóa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="danger-run-reason">Reason</FieldLabel>
              <Input
                id="danger-run-reason"
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
              Xác nhận
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
