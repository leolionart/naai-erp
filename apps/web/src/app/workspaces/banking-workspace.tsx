"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { FileUpIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { MoneyCell } from "@/components/financial/money-cell";
import { StatusBadge } from "@/components/financial/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import {
  createApiClient,
  DEFAULT_API_CONNECTION,
  loadApiToken,
  loadConnectionSettings,
  saveApiToken,
  saveConnectionSettings,
  type ApiConnectionSettingsV1,
} from "@/lib/api";
import { formatIsoDate } from "@/lib/format";

export type BankingRow = Record<string, unknown>;

export function bankingItems(payload: unknown): BankingRow[] {
  if (Array.isArray(payload)) return payload as BankingRow[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as BankingRow;
  if (Array.isArray(record.items)) return record.items as BankingRow[];
  if (Array.isArray(record.rows)) return record.rows as BankingRow[];
  return [];
}

export function filterBankTransactions(
  rows: readonly BankingRow[],
  input: { query: string; accountId: string; state: string },
) {
  const query = input.query.trim().toLowerCase();
  return rows.filter((row) => {
    const accountId = textField(row, "financialAccountId", "bankAccountId", "accountId");
    const state = textField(row, "state");
    return (
      (!input.accountId || accountId === input.accountId) &&
      (!input.state || state === input.state) &&
      (!query || JSON.stringify(row).toLowerCase().includes(query))
    );
  });
}

export type CashMovementDirection = "" | "deposit" | "withdrawal";

export function cashMovementDirection(row: BankingRow): Exclude<CashMovementDirection, ""> | "" {
  try {
    const amount = BigInt(signedAmount(row));
    if (amount > 0n) return "deposit";
    if (amount < 0n) return "withdrawal";
  } catch {
    // Keep malformed/unknown amounts visible in the unfiltered history.
  }
  return "";
}

export function filterCashFundTransactions(
  rows: readonly BankingRow[],
  accounts: readonly BankingRow[],
  input: { accountId: string; direction: CashMovementDirection },
) {
  const cashAccountIds = new Set(
    accounts
      .filter((account) => textField(account, "kind", "accountType", "type") === "cash")
      .map((account) => textField(account, "id"))
      .filter(Boolean),
  );
  return rows.filter((row) => {
    const accountId = textField(row, "financialAccountId", "bankAccountId", "accountId");
    return (
      cashAccountIds.has(accountId) &&
      (!input.accountId || accountId === input.accountId) &&
      (!input.direction || cashMovementDirection(row) === input.direction)
    );
  });
}

function textField(row: BankingRow, ...names: string[]): string {
  for (const name of names) {
    const snake = name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const value = row[name] ?? row[snake];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

function signedAmount(row: BankingRow): string {
  const direct = textField(row, "amountMinor", "signedAmountMinor");
  if (direct) return direct;
  const inflow = textField(row, "inflowMinor", "debitMinor");
  if (inflow) return inflow;
  const outflow = textField(row, "outflowMinor", "creditMinor");
  return outflow ? `-${outflow.replace(/^-/, "")}` : "0";
}

function maskedIdentifier(value: string) {
  const normalized = value.trim();
  return normalized ? `•••• ${normalized.slice(-4)}` : undefined;
}

async function readCsv(file: File) {
  if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Chỉ chấp nhận file CSV.");
  return file.text();
}

export function BankingWorkspace() {
  const [connection, setConnection] = useState<ApiConnectionSettingsV1>(DEFAULT_API_CONNECTION);
  const [token, setToken] = useState("");
  const [accounts, setAccounts] = useState<BankingRow[]>([]);
  const [transactions, setTransactions] = useState<BankingRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Sẵn sàng tải tài khoản và giao dịch tiền.");
  const [accountDialog, setAccountDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [queueFilters, setQueueFilters] = useState({ query: "", accountId: "", state: "" });
  const [cashHistoryFilters, setCashHistoryFilters] = useState<{
    accountId: string;
    direction: CashMovementDirection;
  }>({ accountId: "", direction: "" });

  useEffect(() => {
    setConnection(loadConnectionSettings(window.localStorage));
    setToken(loadApiToken(window.sessionStorage));
  }, []);

  const client = useMemo(
    () =>
      createApiClient({
        connection: () => connection,
        token: () => token,
      }),
    [connection, token],
  );

  const visibleTransactions = useMemo(
    () =>
      filterBankTransactions(
        transactions.filter((row) => !["reconciled", "ignored"].includes(textField(row, "state"))),
        queueFilters,
      ),
    [queueFilters, transactions],
  );

  const cashAccounts = useMemo(
    () =>
      accounts.filter((account) => textField(account, "kind", "accountType", "type") === "cash"),
    [accounts],
  );

  const cashFundHistory = useMemo(
    () => filterCashFundTransactions(transactions, accounts, cashHistoryFilters),
    [accounts, cashHistoryFilters, transactions],
  );

  function persistConnection(nextConnection = connection, nextToken = token) {
    setConnection(saveConnectionSettings(window.localStorage, nextConnection));
    setToken(saveApiToken(window.sessionStorage, nextToken));
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      persistConnection();
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể hoàn tất yêu cầu.");
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    await run(async () => {
      const [accountPayload, transactionPayload] = await Promise.all([
        client.data<unknown>("banking/accounts"),
        client.data<unknown>("banking/transactions"),
      ]);
      const nextAccounts = bankingItems(accountPayload);
      const nextTransactions = bankingItems(transactionPayload);
      setAccounts(nextAccounts);
      setTransactions(nextTransactions);
      setNotice(`Đã tải ${nextAccounts.length} tài khoản và ${nextTransactions.length} giao dịch.`);
    });
  }

  useEffect(() => {
    if (token) void load();
  }, [token]);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await client.data("banking/accounts", {
        method: "POST",
        body: {
          schemaVersion: 1,
          code: form.get("code"),
          displayName: form.get("displayName"),
          kind: form.get("kind"),
          currency: form.get("currency"),
          ledgerAccountCode: form.get("ledgerAccountCode"),
          ...(form.get("kind") === "bank"
            ? {
                bankCode: form.get("bankCode") || undefined,
                accountIdentity: form.get("accountIdentity") || undefined,
                maskedIdentifier: maskedIdentifier(String(form.get("accountIdentity") ?? "")),
              }
            : {}),
        },
      });
      setAccountDialog(false);
      setNotice("Đã tạo tài khoản tiền.");
      await load();
    });
  }

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) {
      setError("Vui lòng chọn file CSV sao kê.");
      return;
    }
    await run(async () => {
      const csvText = await readCsv(file);
      const result = await client.data<BankingRow>("banking/imports", {
        method: "POST",
        body: {
          schemaVersion: 1,
          financialAccountId: form.get("financialAccountId"),
          adapterId: "generic-csv",
          adapterVersion: 1,
          filename: file.name,
          csvText,
        },
      });
      const imported = textField(result, "importedCount", "createdCount") || "0";
      const duplicates = textField(result, "duplicateCount", "duplicates") || "0";
      setImportDialog(false);
      setNotice(`Import hoàn tất: ${imported} giao dịch mới, ${duplicates} giao dịch trùng.`);
      await load();
    });
  }

  const accountColumns: readonly FinancialColumn<BankingRow>[] = [
    {
      id: "name",
      header: "Tài khoản",
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <strong>{textField(row, "displayName", "name") || "—"}</strong>
          <span className="text-xs text-muted-foreground">
            {textField(row, "bankCode") || "Tiền mặt"} ·{" "}
            {textField(row, "maskedIdentifier", "accountIdentifier") || "—"}
          </span>
        </div>
      ),
    },
    {
      id: "type",
      header: "Loại",
      cell: (row) => (
        <Badge variant="outline">{textField(row, "kind", "accountType", "type") || "—"}</Badge>
      ),
    },
    { id: "currency", header: "Tiền tệ", cell: (row) => textField(row, "currency") || "—" },
    {
      id: "ledger",
      header: "TK sổ cái",
      cell: (row) => textField(row, "ledgerAccountCode", "ledgerAccountId") || "—",
    },
    {
      id: "state",
      header: "Trạng thái",
      cell: (row) => <StatusBadge status={textField(row, "state", "status") || "active"} />,
    },
  ];

  const transactionColumns: readonly FinancialColumn<BankingRow>[] = [
    {
      id: "date",
      header: "Ngày",
      cell: (row) => formatIsoDate(textField(row, "bookedDate", "transactionDate", "valueDate")),
    },
    {
      id: "reference",
      header: "Nội dung / đối tác",
      cell: (row) => (
        <div className="flex min-w-52 flex-col gap-1">
          <Link
            className="font-medium underline-offset-4 hover:underline"
            href={`/banking/reconciliation/${encodeURIComponent(textField(row, "id"))}`}
          >
            {textField(row, "reference", "description") || textField(row, "id") || "—"}
          </Link>
          <span className="text-xs text-muted-foreground">
            {textField(row, "counterpartyName", "counterparty") || "Không rõ đối tác"}
          </span>
        </div>
      ),
    },
    {
      id: "account",
      header: "Tài khoản tiền",
      cell: (row) => textField(row, "financialAccountId", "bankAccountId", "accountId") || "—",
    },
    {
      id: "amount",
      header: "Số tiền",
      align: "right",
      cell: (row) => <MoneyCell minor={signedAmount(row)} />,
    },
    {
      id: "state",
      header: "Trạng thái",
      cell: (row) => <StatusBadge status={textField(row, "state") || "imported"} />,
    },
  ];

  const cashHistoryColumns: readonly FinancialColumn<BankingRow>[] = [
    transactionColumns[0]!,
    transactionColumns[1]!,
    {
      id: "direction",
      header: "Loại biến động",
      cell: (row) => (
        <Badge variant="outline">
          {cashMovementDirection(row) === "deposit"
            ? "Nộp tiền"
            : cashMovementDirection(row) === "withdrawal"
              ? "Rút tiền"
              : "Chưa xác định"}
        </Badge>
      ),
    },
    transactionColumns[2]!,
    transactionColumns[3]!,
    transactionColumns[4]!,
  ];

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Không thể hoàn tất thao tác</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2" aria-label="Điều hướng nghiệp vụ ngân hàng">
        <Button variant="secondary" asChild>
          <Link href="/banking">Tài khoản & Giao dịch</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/banking/internal-transfers">Chuyển tiền nội bộ</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/banking/statements">Kiểm soát sao kê</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>Tài khoản ngân hàng và tiền mặt</CardTitle>
            <CardDescription>
              Tài khoản tiền của doanh nghiệp, tách biệt với thông tin ngân hàng của khách hàng và
              nhà cung cấp.
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            <Button variant="outline" onClick={load} disabled={busy}>
              {busy ? <Spinner /> : <RefreshCwIcon data-icon="inline-start" />}
              Tải dữ liệu
            </Button>
            <Button
              variant="outline"
              onClick={() => setImportDialog(true)}
              disabled={!accounts.length}
            >
              <FileUpIcon data-icon="inline-start" />
              Import CSV
            </Button>
            <Button onClick={() => setAccountDialog(true)}>
              <PlusIcon data-icon="inline-start" />
              Thêm tài khoản
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={accounts}
            columns={accountColumns}
            rowKey={(row) => textField(row, "id") || JSON.stringify(row)}
            loading={busy && !accounts.length}
            emptyTitle="Chưa có tài khoản tiền"
            emptyDescription="Tạo tài khoản ngân hàng hoặc quỹ tiền mặt trước khi import sao kê."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử nộp/rút quỹ tiền mặt</CardTitle>
          <CardDescription>
            Toàn bộ biến động của quỹ tiền mặt doanh nghiệp, bao gồm cả giao dịch đang xử lý, đã đối
            soát hoặc đã bỏ qua.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="cash-history-account-filter">Quỹ tiền mặt</FieldLabel>
              <Select
                value={cashHistoryFilters.accountId || "all"}
                onValueChange={(value) =>
                  setCashHistoryFilters((current) => ({
                    ...current,
                    accountId: value === "all" ? "" : value,
                  }))
                }
              >
                <SelectTrigger id="cash-history-account-filter">
                  <SelectValue placeholder="Tất cả quỹ tiền mặt" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Tất cả quỹ tiền mặt</SelectItem>
                    {cashAccounts.map((account) => (
                      <SelectItem key={textField(account, "id")} value={textField(account, "id")}>
                        {textField(account, "displayName", "name") || textField(account, "id")}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="cash-history-direction-filter">Loại biến động</FieldLabel>
              <Select
                value={cashHistoryFilters.direction || "all"}
                onValueChange={(value) =>
                  setCashHistoryFilters((current) => ({
                    ...current,
                    direction: value === "deposit" || value === "withdrawal" ? value : "",
                  }))
                }
              >
                <SelectTrigger id="cash-history-direction-filter">
                  <SelectValue placeholder="Tất cả nộp/rút" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Tất cả nộp/rút</SelectItem>
                    <SelectItem value="deposit">Nộp tiền</SelectItem>
                    <SelectItem value="withdrawal">Rút tiền</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <FinancialDataTable
            rows={cashFundHistory}
            columns={cashHistoryColumns}
            rowKey={(row) => textField(row, "id", "providerTransactionId") || JSON.stringify(row)}
            loading={busy && !transactions.length}
            emptyTitle="Chưa có biến động quỹ tiền mặt"
            emptyDescription="Không có giao dịch nộp/rút phù hợp với bộ lọc hiện tại."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hàng chờ đối soát</CardTitle>
          <CardDescription>
            Mở từng giao dịch để xem candidate, phân bổ một phần, phí ngân hàng và chênh lệch tỷ giá
            trước khi ghi nhận đối soát.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldGroup className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="banking-query">Tìm giao dịch</FieldLabel>
              <Input
                id="banking-query"
                placeholder="Nội dung, tham chiếu, đối tác"
                value={queueFilters.query}
                onChange={(event) =>
                  setQueueFilters((current) => ({ ...current, query: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="banking-account-filter">Tài khoản</FieldLabel>
              <Select
                value={queueFilters.accountId || "all"}
                onValueChange={(value) =>
                  setQueueFilters((current) => ({
                    ...current,
                    accountId: value === "all" ? "" : value,
                  }))
                }
              >
                <SelectTrigger id="banking-account-filter">
                  <SelectValue placeholder="Tất cả tài khoản" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Tất cả tài khoản</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={textField(account, "id")} value={textField(account, "id")}>
                        {textField(account, "displayName", "name") || textField(account, "id")}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="banking-state-filter">Trạng thái</FieldLabel>
              <Select
                value={queueFilters.state || "all"}
                onValueChange={(value) =>
                  setQueueFilters((current) => ({
                    ...current,
                    state: value === "all" ? "" : value,
                  }))
                }
              >
                <SelectTrigger id="banking-state-filter">
                  <SelectValue placeholder="Tất cả trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Tất cả trạng thái</SelectItem>
                    {[
                      "imported",
                      "suggested",
                      "matched",
                      "reconciled",
                      "ignored",
                      "needs_review",
                    ].map((state) => (
                      <SelectItem key={state} value={state}>
                        {state.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <FinancialDataTable
            rows={visibleTransactions}
            columns={transactionColumns}
            rowKey={(row) => textField(row, "id", "providerTransactionId") || JSON.stringify(row)}
            loading={busy && !transactions.length}
            emptyTitle="Chưa có giao dịch"
            emptyDescription="Không còn giao dịch đang chờ đối soát trong bộ lọc hiện tại."
          />
        </CardContent>
      </Card>

      <Dialog open={accountDialog} onOpenChange={setAccountDialog}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={createAccount}>
            <DialogHeader>
              <DialogTitle>Thêm tài khoản tiền</DialogTitle>
              <DialogDescription>
                Khai báo tài khoản ngân hàng hoặc quỹ tiền mặt thuộc organization hiện tại.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="bank-account-code">Mã tài khoản tiền</FieldLabel>
                <Input id="bank-account-code" name="code" placeholder="VCB-VND" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="bank-account-name">Tên tài khoản</FieldLabel>
                <Input id="bank-account-name" name="displayName" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="bank-account-type">Loại tài khoản</FieldLabel>
                <Select name="kind" defaultValue="bank">
                  <SelectTrigger id="bank-account-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="bank">Ngân hàng</SelectItem>
                      <SelectItem value="cash">Tiền mặt</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="bank-code">Mã ngân hàng</FieldLabel>
                  <Input id="bank-code" name="bankCode" placeholder="VCB" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bank-account-number">Số tài khoản</FieldLabel>
                  <Input id="bank-account-number" name="accountIdentity" autoComplete="off" />
                </Field>
              </FieldGroup>
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="bank-currency">Tiền tệ</FieldLabel>
                  <Input id="bank-currency" name="currency" defaultValue="VND" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bank-ledger-account">ID tài khoản sổ cái</FieldLabel>
                  <Input id="bank-ledger-account" name="ledgerAccountCode" required />
                </Field>
              </FieldGroup>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAccountDialog(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner /> : null}Tạo tài khoản
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importDialog} onOpenChange={setImportDialog}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={importCsv}>
            <DialogHeader>
              <DialogTitle>Import sao kê CSV</DialogTitle>
              <DialogDescription>
                File gốc được fingerprint để re-import không tạo giao dịch trùng.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field>
                <FieldLabel htmlFor="import-bank-account">Tài khoản nhận sao kê</FieldLabel>
                <Select name="financialAccountId" required>
                  <SelectTrigger id="import-bank-account">
                    <SelectValue placeholder="Chọn tài khoản" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {accounts.map((account) => (
                        <SelectItem key={textField(account, "id")} value={textField(account, "id")}>
                          {textField(account, "displayName", "name") || textField(account, "id")}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="import-adapter">Định dạng CSV</FieldLabel>
                <Input id="import-adapter" value="generic-csv v1" readOnly />
              </Field>
              <Field>
                <FieldLabel htmlFor="import-csv-file">File sao kê CSV</FieldLabel>
                <Input
                  id="import-csv-file"
                  name="file"
                  type="file"
                  accept=".csv,text/csv"
                  required
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setImportDialog(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Spinner /> : null}Import giao dịch
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
