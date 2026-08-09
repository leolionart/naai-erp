"use client";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { MoneyCell } from "@/components/financial/money-cell";
import { StatusBadge } from "@/components/financial/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  createApiClient,
  DEFAULT_API_CONNECTION,
  loadApiToken,
  loadConnectionSettings,
  timeApi,
  type ApiConnectionSettingsV1,
  type CostRate,
  type CostRateTransitionBody,
  type CreateCostRateBody,
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
export function CostRateListWorkspace() {
  const client = useClient();
  const [rows, setRows] = useState<CostRate[]>([]),
    [dialog, setDialog] = useState(false),
    [notice, setNotice] = useState("Rate values chỉ hiển thị khi API cho phép."),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = await client.data<{ items: readonly CostRate[] }>(timeApi.costRates);
      setRows([...data.items]);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Không thể tải rates.");
    } finally {
      setBusy(false);
    }
  }, [client]);
  useEffect(() => void load(), [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const body: CreateCostRateBody = {
      schemaVersion: 1,
      workerId: String(f.get("workerId")),
      basis: String(f.get("basis")) as CostRate["basis"],
      currency: String(f.get("currency")),
      rateMinorPerHour: String(f.get("rateMinorPerHour")),
      effectiveFrom: String(f.get("effectiveFrom")),
      ...(f.get("effectiveTo") ? { effectiveTo: String(f.get("effectiveTo")) } : {}),
      reason: String(f.get("reason")),
    };
    await client.data(timeApi.costRates, { method: "POST", body });
    setDialog(false);
    await load();
  }
  const columns: readonly FinancialColumn<CostRate>[] = [
    {
      id: "worker",
      header: "Worker",
      cell: (r) => (
        <Link
          className="font-medium underline-offset-4 hover:underline"
          href={`/settings/cost-rates/${encodeURIComponent(r.id)}`}
        >
          {r.workerId}
        </Link>
      ),
    },
    { id: "basis", header: "Basis", cell: (r) => r.basis },
    {
      id: "rate",
      header: "Rate/hour",
      align: "right",
      cell: (r) => <MoneyCell minor={r.rateMinorPerHour} />,
    },
    {
      id: "effective",
      header: "Hiệu lực",
      cell: (r) => `${r.effectiveFrom} → ${r.effectiveTo ?? "open"}`,
    },
    { id: "state", header: "Trạng thái", cell: (r) => <StatusBadge status={r.state} /> },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>{notice}</AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>Labor cost-rate versions</CardTitle>
          <CardDescription>
            Rate mới tạo version mới; không rewrite historical applied cost.
          </CardDescription>
          <CardAction>
            <Button onClick={() => setDialog(true)}>Tạo phiên bản rate</Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <FinancialDataTable rows={rows} columns={columns} rowKey={(r) => r.id} loading={busy} />
        </CardContent>
      </Card>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <form onSubmit={create}>
            <DialogHeader>
              <DialogTitle>Tạo cost rate</DialogTitle>
              <DialogDescription>
                Form ngắn cho một effective version; approval tách riêng.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="rate-worker">Worker ID</FieldLabel>
                <Input id="rate-worker" name="workerId" required />
              </Field>
              <Field>
                <FieldLabel>Basis</FieldLabel>
                <Select name="basis" defaultValue="fully_loaded">
                  <SelectTrigger aria-label="Basis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="gross_salary">Gross salary</SelectItem>
                      <SelectItem value="fully_loaded">Fully loaded</SelectItem>
                      <SelectItem value="blended">Blended</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="rate-amount">Rate minor/hour</FieldLabel>
                <Input
                  id="rate-amount"
                  name="rateMinorPerHour"
                  type="password"
                  inputMode="numeric"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="rate-currency">Currency</FieldLabel>
                <Input id="rate-currency" name="currency" defaultValue="VND" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="rate-from">Effective from</FieldLabel>
                <Input id="rate-from" name="effectiveFrom" type="date" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="rate-to">Effective to</FieldLabel>
                <Input id="rate-to" name="effectiveTo" type="date" />
              </Field>
              <Field>
                <FieldLabel htmlFor="rate-reason">Reason</FieldLabel>
                <Input id="rate-reason" name="reason" required />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit">Tạo draft rate</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function CostRateDetailWorkspace({ rateId }: Readonly<{ rateId: string }>) {
  const client = useClient();
  const [rate, setRate] = useState<CostRate>(),
    [action, setAction] = useState<"approve" | "retire">(),
    [reason, setReason] = useState("");
  const load = useCallback(async () => {
    const data = await client.data<{ items: readonly CostRate[] }>(timeApi.costRates);
    setRate(data.items.find((r) => r.id === rateId));
  }, [client, rateId]);
  useEffect(() => void load(), [load]);
  async function transition() {
    if (!rate || !action) return;
    const body: CostRateTransitionBody = {
      schemaVersion: 1,
      expectedResourceVersion: rate.resourceVersion,
      reason,
    };
    await client.data(timeApi.costRateAction(rate.id, action), { method: "POST", body });
    setAction(undefined);
    setReason("");
    await load();
  }
  return (
    <div className="flex flex-col gap-4">
      <Button variant="outline" asChild>
        <Link href="/settings/cost-rates">Về cost rates</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{rate?.workerId ?? rateId}</CardTitle>
          <CardDescription>Historical effective version</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>Basis: {rate?.basis ?? "—"}</div>
          <div>
            State: <StatusBadge status={rate?.state ?? "draft"} />
          </div>
          <div>
            Effective: {rate?.effectiveFrom} → {rate?.effectiveTo ?? "open"}
          </div>
          <div>
            Rate:{" "}
            {rate ? (
              <MoneyCell minor={rate.rateMinorPerHour} className="text-left" />
            ) : (
              "Restricted"
            )}
          </div>
        </CardContent>
      </Card>
      <div className="flex gap-2">
        {rate?.nextActions.includes("approve") ? (
          <Button onClick={() => setAction("approve")}>Approve</Button>
        ) : null}
        {rate?.nextActions.includes("retire") ? (
          <Button variant="destructive" onClick={() => setAction("retire")}>
            Retire
          </Button>
        ) : null}
      </div>
      <Dialog open={Boolean(action)} onOpenChange={(open) => !open && setAction(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action} cost rate</DialogTitle>
            <DialogDescription>Effective history không bị rewrite.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="rate-action-reason">Reason</FieldLabel>
              <Input
                id="rate-action-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant={action === "retire" ? "destructive" : "default"}
              onClick={() => void transition()}
              disabled={!reason.trim()}
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
