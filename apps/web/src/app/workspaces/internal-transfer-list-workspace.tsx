"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import type {
  CreateInternalTransferRequest,
  InternalTransferContract,
  InternalTransferMutationResult,
} from "@naai-erp/contracts";
import Link from "next/link";
import { FilterIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { MoneyCell } from "@/components/financial/money-cell";
import { StatusBadge } from "@/components/financial/status-badge";
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
  Popover,
  PopoverActiveAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  createApiClient,
  currentInternalTransferAttempt,
  DEFAULT_API_CONNECTION,
  internalTransferApi,
  loadApiToken,
  loadConnectionSettings,
  type ApiConnectionSettingsV1,
} from "@/lib/api";

export type InternalTransferRow = InternalTransferContract;

export function internalTransferItems(payload: { items: readonly InternalTransferContract[] }) {
  return [...payload.items];
}

function transferAccounts(row: InternalTransferContract) {
  const attempt = currentInternalTransferAttempt(row);
  return {
    source: attempt?.source,
    destination: attempt?.destination,
  };
}

export function filterInternalTransfers(
  rows: readonly InternalTransferRow[],
  filters: { query: string; state: string; accountId: string },
) {
  const query = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    const accounts = transferAccounts(row);
    const accountIds = [
      accounts.source?.financialAccountId ?? "",
      accounts.destination?.financialAccountId ?? "",
    ];
    return (
      (!filters.state || row.state === filters.state) &&
      (!filters.accountId || accountIds.includes(filters.accountId)) &&
      (!query || JSON.stringify(row).toLowerCase().includes(query))
    );
  });
}

export function InternalTransferListWorkspace() {
  const [connection, setConnection] = useState<ApiConnectionSettingsV1>(DEFAULT_API_CONNECTION);
  const [token, setToken] = useState("");
  const [rows, setRows] = useState<InternalTransferRow[]>([]);
  const [filters, setFilters] = useState({ query: "", state: "", accountId: "" });
  const [filterSheet, setFilterSheet] = useState(false);
  const [createDialog, setCreateDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Tải queue để xem transfer đã ghép và đang chờ đối ứng.");

  useEffect(() => {
    setConnection(loadConnectionSettings(window.localStorage));
    setToken(loadApiToken(window.sessionStorage));
  }, []);
  const client = useMemo(
    () => createApiClient({ connection: () => connection, token: () => token }),
    [connection, token],
  );
  const visible = useMemo(() => filterInternalTransfers(rows, filters), [filters, rows]);

  async function load() {
    setBusy(true);
    try {
      const payload = await client.data<{ items: readonly InternalTransferContract[] }>(
        internalTransferApi.list,
      );
      const items = internalTransferItems(payload);
      setRows(items);
      setNotice(`Đã tải ${items.length} transfer từ API.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể tải transfer queue.");
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const feeAmount = String(form.get("feeAmountMinor") ?? "").trim();
      const feeMode = String(form.get("feeMode") ?? "embedded") as
        "embedded" | "separate_transaction";
      const body: CreateInternalTransferRequest = {
        schemaVersion: 1,
        ...(form.get("sourceTransactionId")
          ? { sourceTransactionId: String(form.get("sourceTransactionId")) }
          : {}),
        ...(form.get("destinationTransactionId")
          ? { destinationTransactionId: String(form.get("destinationTransactionId")) }
          : {}),
        principalAmountMinor: String(form.get("principalAmountMinor")),
        basePrincipalAmountMinor: String(form.get("basePrincipalAmountMinor")),
        currency: String(form.get("currency")),
        transitAccountId: String(form.get("transitAccountId")),
        postingMode: "transit",
        ...(feeAmount
          ? {
              fee: {
                mode: feeMode,
                amountMinor: feeAmount,
                baseAmountMinor: String(form.get("feeBaseAmountMinor")),
                expenseAccountId: String(form.get("feeExpenseAccountId")),
                reason: String(form.get("feeReason")),
                ...(feeMode === "separate_transaction" && form.get("feeTransactionId")
                  ? { transactionId: String(form.get("feeTransactionId")) }
                  : {}),
              },
            }
          : {}),
        reason: String(form.get("reason")),
      };
      await client.data<InternalTransferMutationResult>(internalTransferApi.list, {
        method: "POST",
        body,
      });
      setCreateDialog(false);
      await load();
      setNotice("Đã tạo transfer pending; principal đi qua transit và fee được lưu riêng.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể tạo transfer.");
    } finally {
      setBusy(false);
    }
  }

  const columns: readonly FinancialColumn<InternalTransferRow>[] = [
    {
      id: "transfer",
      header: "Transfer",
      cell: (row) => (
        <div className="flex min-w-48 flex-col gap-1">
          <Link
            className="font-medium underline-offset-4 hover:underline"
            href={`/banking/internal-transfers/${encodeURIComponent(row.id)}`}
          >
            {row.id}
          </Link>
          <span className="text-xs text-muted-foreground">attempt {row.currentAttemptNumber}</span>
        </div>
      ),
    },
    {
      id: "accounts",
      header: "Tài khoản sở hữu",
      cell: (row) => {
        const accounts = transferAccounts(row);
        return (
          <span>
            {accounts.source?.financialAccountId ?? "Chưa có chiều ra"} →{" "}
            {accounts.destination?.financialAccountId ?? "Chờ chiều vào"}
          </span>
        );
      },
    },
    {
      id: "principal",
      header: "Principal",
      align: "right",
      cell: (row) => <MoneyCell minor={row.principalAmountMinor} />,
    },
    {
      id: "fee",
      header: "Phí riêng",
      align: "right",
      cell: (row) => {
        const fee = currentInternalTransferAttempt(row)?.fee;
        return fee ? <MoneyCell minor={fee.amountMinor} /> : "—";
      },
    },
    {
      id: "transit",
      header: "Transit",
      cell: (row) => currentInternalTransferAttempt(row)?.transitAccountId ?? "—",
    },
    {
      id: "state",
      header: "Trạng thái",
      cell: (row) => <StatusBadge status={row.state} />,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertDescription>{notice}</AlertDescription>
      </Alert>
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>Transfer queue</CardTitle>
            <CardDescription>
              Principal giữa tài khoản sở hữu không đi qua Revenue/Expense; phí luôn là dòng riêng.
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <Button variant="outline" onClick={() => setFilterSheet(true)}>
              <FilterIcon data-icon="inline-start" />
              Bộ lọc
            </Button>
            <Button variant="outline" onClick={() => setCreateDialog(true)}>
              <PlusIcon data-icon="inline-start" />
              Tạo transfer
            </Button>
            <Button onClick={load} disabled={busy}>
              {busy ? <Spinner /> : <RefreshCwIcon data-icon="inline-start" />}Tải queue
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={visible}
            columns={columns}
            rowKey={(row) => row.id}
            loading={busy && !rows.length}
            emptyTitle="Chưa có transfer"
            emptyDescription="Transfer pending hoặc đã ghép sẽ xuất hiện từ API."
          />
        </CardContent>
      </Card>

      <Popover open={filterSheet} onOpenChange={setFilterSheet}>
        <PopoverActiveAnchor open={Boolean(filterSheet)} />
        <PopoverContent
          align="end"
          sideOffset={8}
          className="max-h-[min(80vh,40rem)] w-[min(92vw,28rem)] overflow-y-auto"
        >
          <PopoverHeader>
            <PopoverTitle>Lọc transfer queue</PopoverTitle>
            <PopoverDescription>
              Lọc theo trạng thái, tài khoản sở hữu hoặc tham chiếu.
            </PopoverDescription>
          </PopoverHeader>
          <FieldGroup className="px-4">
            <Field>
              <FieldLabel htmlFor="transfer-query">Tìm kiếm</FieldLabel>
              <Input
                id="transfer-query"
                value={filters.query}
                onChange={(event) => setFilters({ ...filters, query: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="transfer-state">Trạng thái</FieldLabel>
              <Select
                value={filters.state || "all"}
                onValueChange={(value) =>
                  setFilters({ ...filters, state: value === "all" ? "" : value })
                }
              >
                <SelectTrigger id="transfer-state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Tất cả</SelectItem>
                    {[
                      "pending_counterpart",
                      "matched",
                      "reconciled",
                      "unmatched",
                      "needs_review",
                    ].map((state) => (
                      <SelectItem value={state} key={state}>
                        {state.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="transfer-account">Tài khoản</FieldLabel>
              <Input
                id="transfer-account"
                value={filters.accountId}
                onChange={(event) => setFilters({ ...filters, accountId: event.target.value })}
              />
            </Field>
          </FieldGroup>
        </PopoverContent>
      </Popover>

      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={create}>
            <DialogHeader>
              <DialogTitle>Tạo transfer pending</DialogTitle>
              <DialogDescription>
                Nhập số tiền chuyển. Hệ thống sẽ xử lý tài khoản trung gian và đối ứng.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="create-principal">Số tiền chuyển</FieldLabel>
                  <Input id="create-principal" name="principalAmountMinor" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="create-base-principal">Số tiền quy đổi</FieldLabel>
                  <Input id="create-base-principal" name="basePrincipalAmountMinor" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="create-currency">Tiền tệ</FieldLabel>
                  <Input id="create-currency" name="currency" defaultValue="VND" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="create-transit">Tài khoản trung gian</FieldLabel>
                  <Input id="create-transit" name="transitAccountId" required />
                </Field>
              </FieldGroup>
              <Field>
                <FieldLabel htmlFor="create-reason">Ghi chú</FieldLabel>
                <Input id="create-reason" name="reason" required />
              </Field>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Tuỳ chọn nâng cao</summary>
                <FieldGroup className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="create-source-leg">Giao dịch chiều chuyển</FieldLabel>
                    <Input id="create-source-leg" name="sourceTransactionId" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="create-destination-leg">Giao dịch chiều nhận</FieldLabel>
                    <Input id="create-destination-leg" name="destinationTransactionId" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="create-fee-mode">Cách ghi nhận phí</FieldLabel>
                    <Select name="feeMode" defaultValue="embedded">
                      <SelectTrigger id="create-fee-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="embedded">Gộp trong giao dịch ngân hàng</SelectItem>
                          <SelectItem value="separate_transaction">Giao dịch phí riêng</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="create-fee-transaction">Giao dịch phí</FieldLabel>
                    <Input id="create-fee-transaction" name="feeTransactionId" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="create-fee">Phí ngân hàng</FieldLabel>
                    <Input id="create-fee" name="feeAmountMinor" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="create-fee-base">Phí quy đổi</FieldLabel>
                    <Input id="create-fee-base" name="feeBaseAmountMinor" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="create-fee-account">Tài khoản chi phí phí</FieldLabel>
                    <Input id="create-fee-account" name="feeExpenseAccountId" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="create-fee-reason">Diễn giải phí</FieldLabel>
                    <Input id="create-fee-reason" name="feeReason" />
                  </Field>
                </FieldGroup>
              </details>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialog(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                Tạo pending transfer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
