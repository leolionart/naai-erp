"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
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
  Popover,
  PopoverActiveAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverFooter,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  createApiClient,
  DEFAULT_API_CONNECTION,
  loadApiToken,
  loadConnectionSettings,
  statementSessionApi,
  type ApiConnectionSettingsV1,
  type CreateStatementSessionRequest,
  type StatementSessionContract,
} from "@/lib/api";

export function StatementSessionListWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [connection, setConnection] = useState<ApiConnectionSettingsV1>(DEFAULT_API_CONNECTION);
  const [token, setToken] = useState("");
  const [rows, setRows] = useState<StatementSessionContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("Tải các kỳ sao kê để kiểm tra close readiness.");
  const [createDialog, setCreateDialog] = useState(false);
  const [filterSheet, setFilterSheet] = useState(false);
  const accountId = searchParams.get("accountId") || "";
  const state = searchParams.get("state") || "";
  const periodStart = searchParams.get("periodStart") || "";
  const periodEnd = searchParams.get("periodEnd") || "";

  useEffect(() => {
    setConnection(loadConnectionSettings(window.localStorage));
    setToken(loadApiToken(window.sessionStorage));
  }, []);
  const client = useMemo(
    () => createApiClient({ connection: () => connection, token: () => token }),
    [connection, token],
  );
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (accountId) params.set("financialAccountId", accountId);
      if (state) params.set("state", state);
      if (periodStart) params.set("periodStart", periodStart);
      if (periodEnd) params.set("periodEnd", periodEnd);
      const payload = await client.data<{ items: readonly StatementSessionContract[] }>(
        `${statementSessionApi.list}${params.size ? `?${params}` : ""}`,
      );
      setRows([...payload.items]);
      setNotice(`Đã tải ${payload.items.length} kỳ sao kê.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể tải kỳ sao kê.");
    } finally {
      setLoading(false);
    }
  }, [accountId, client, periodEnd, periodStart, state]);
  useEffect(() => void load(), [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: CreateStatementSessionRequest = {
      schemaVersion: 1,
      financialAccountId: String(form.get("financialAccountId")),
      periodStart: String(form.get("periodStart")),
      periodEnd: String(form.get("periodEnd")),
      openingBalanceMinor: String(form.get("openingBalanceMinor")),
      closingBalanceMinor: String(form.get("closingBalanceMinor")),
      currency: String(form.get("currency")),
      importIds: String(form.get("importIds") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      reason: String(form.get("reason")),
    };
    setLoading(true);
    try {
      await client.data(statementSessionApi.list, { method: "POST", body });
      setCreateDialog(false);
      await load();
      setNotice("Đã tạo kỳ kiểm soát sao kê.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể tạo kỳ sao kê.");
    } finally {
      setLoading(false);
    }
  }

  function applyFilters(form: FormData) {
    const params = new URLSearchParams();
    for (const key of ["accountId", "state", "periodStart", "periodEnd"] as const) {
      const value = String(form.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`);
    setFilterSheet(false);
  }

  const columns: readonly FinancialColumn<StatementSessionContract>[] = [
    {
      id: "session",
      header: "Kỳ sao kê",
      cell: (row) => (
        <div className="flex min-w-48 flex-col gap-1">
          <Link
            className="font-medium underline-offset-4 hover:underline"
            href={`/banking/statements/${encodeURIComponent(row.id)}`}
          >
            {row.periodStart} → {row.periodEnd}
          </Link>
          <span className="text-xs text-muted-foreground">{row.id}</span>
        </div>
      ),
    },
    { id: "account", header: "Tài khoản", cell: (row) => row.financialAccountId },
    {
      id: "opening",
      header: "Opening",
      align: "right",
      cell: (row) => <MoneyCell minor={row.openingBalanceMinor} />,
    },
    {
      id: "closing",
      header: "Closing",
      align: "right",
      cell: (row) => <MoneyCell minor={row.closingBalanceMinor} />,
    },
    { id: "currency", header: "Tiền tệ", cell: (row) => row.currency },
    { id: "state", header: "Trạng thái", cell: (row) => <StatusBadge status={row.state} /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/banking">Tài khoản & Giao dịch</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/banking/internal-transfers">Chuyển tiền nội bộ</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/banking/statements">Kiểm soát sao kê</Link>
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setFilterSheet(true)}>
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
        </div>
      </div>
      <Alert>
        <AlertDescription>{notice}</AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>Statement control sessions</CardTitle>
          <CardDescription>
            Mỗi kỳ có dedicated detail để review control totals, suspense và close blockers.
          </CardDescription>
          <CardAction>
            <Button onClick={() => setCreateDialog(true)}>
              <PlusIcon data-icon="inline-start" />
              Tạo kỳ sao kê
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={loading}
            emptyTitle="Chưa có kỳ sao kê"
            emptyDescription="Tạo session ngắn từ account, period và opening/closing balance."
          />
        </CardContent>
      </Card>

      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent>
          <form onSubmit={create}>
            <DialogHeader>
              <DialogTitle>Tạo kỳ kiểm soát sao kê</DialogTitle>
              <DialogDescription>
                Session chỉ khai báo control totals và import IDs; reconciliation xử lý ở route
                riêng.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="statement-account">Financial account ID</FieldLabel>
                <Input id="statement-account" name="financialAccountId" required />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="statement-start">Từ ngày</FieldLabel>
                  <Input id="statement-start" name="periodStart" type="date" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="statement-end">Đến ngày</FieldLabel>
                  <Input id="statement-end" name="periodEnd" type="date" required />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="statement-opening">Opening balance</FieldLabel>
                  <Input
                    id="statement-opening"
                    name="openingBalanceMinor"
                    inputMode="numeric"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="statement-closing">Closing balance</FieldLabel>
                  <Input
                    id="statement-closing"
                    name="closingBalanceMinor"
                    inputMode="numeric"
                    required
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="statement-currency">Tiền tệ</FieldLabel>
                <Input id="statement-currency" name="currency" defaultValue="VND" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="statement-imports">Import IDs</FieldLabel>
                <Input id="statement-imports" name="importIds" placeholder="import-1, import-2" />
              </Field>
              <Field>
                <FieldLabel htmlFor="statement-reason">Lý do</FieldLabel>
                <Input id="statement-reason" name="reason" required />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={loading}>
                Tạo session
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Popover open={filterSheet} onOpenChange={setFilterSheet}>
        <PopoverActiveAnchor open={Boolean(filterSheet)} />
        <PopoverContent
          align="end"
          sideOffset={8}
          className="max-h-[min(80vh,40rem)] w-[min(92vw,30rem)] overflow-y-auto"
        >
          <form action={applyFilters} className="flex h-full flex-col">
            <PopoverHeader>
              <PopoverTitle>Bộ lọc kỳ sao kê</PopoverTitle>
              <PopoverDescription>Bộ lọc được giữ trên URL.</PopoverDescription>
            </PopoverHeader>
            <div className="flex-1 px-4 py-2">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="session-filter-account">Account ID</FieldLabel>
                  <Input id="session-filter-account" name="accountId" defaultValue={accountId} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="session-filter-state">Trạng thái</FieldLabel>
                  <Input id="session-filter-state" name="state" defaultValue={state} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="session-filter-start">Từ kỳ</FieldLabel>
                  <Input
                    id="session-filter-start"
                    name="periodStart"
                    type="date"
                    defaultValue={periodStart}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="session-filter-end">Đến kỳ</FieldLabel>
                  <Input
                    id="session-filter-end"
                    name="periodEnd"
                    type="date"
                    defaultValue={periodEnd}
                  />
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
