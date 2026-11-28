"use client";

import { fetchAllPages } from "@/lib/api/paging";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CreateAccountDialog,
  CreateJournalDialog,
  DeactivateAccountDialog,
  JournalReasonDialog,
  type PendingJournalReasonAction,
} from "./ledger-master-dialogs";

type Section = "journals" | "reports" | "accounts" | "resources";
type ApiRow = Record<string, unknown>;
type ApiEnvelope = Readonly<{ data?: unknown; nextActions?: readonly string[] }> & ApiRow;

import {
  loadApiToken,
  loadConnectionSettings,
  saveApiToken,
  saveConnectionSettings,
} from "@/lib/api/connection";

const TODAY = new Date().toISOString().slice(0, 10);

function rowsFrom(payload: ApiEnvelope): ApiRow[] {
  const data = payload.data ?? payload;
  if (Array.isArray(data)) return data as ApiRow[];
  if (data && typeof data === "object") {
    const items = (data as ApiRow).items;
    if (Array.isArray(items)) return items as ApiRow[];
    const rows = (data as ApiRow).rows;
    if (Array.isArray(rows)) return rows as ApiRow[];
  }
  return [];
}

function display(value: unknown, amount = false): string {
  if (value === null || value === undefined || value === "") return "—";
  if (amount && /^-?\d+$/.test(String(value))) {
    try {
      return `${new Intl.NumberFormat("vi-VN").format(BigInt(String(value)))} ₫`;
    } catch {
      return String(value);
    }
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function field(row: ApiRow, ...names: string[]): unknown {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined) return value;
  }
  return undefined;
}

function encodedMasterDataKey(key: ApiRow): string {
  return btoa(JSON.stringify(key)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function LabeledField({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </Field>
  );
}

export function LedgerMasterWorkspace({
  initialSection = "journals",
  allowedSections = ["journals", "reports", "accounts", "resources"],
  title = "Sổ kế toán & dữ liệu nền",
  description = "Thao tác thân thiện qua REST v1; quyền, maker-checker, audit và idempotency do server thực thi.",
}: {
  initialSection?: Section;
  allowedSections?: readonly Section[];
  title?: string;
  description?: string;
}) {
  const [section, setSection] = useState<Section>(initialSection);
  const [baseUrl, setBaseUrl] = useState("http://localhost:3001");
  const [organizationId, setOrganizationId] = useState("naai");
  const [token, setToken] = useState("");

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Kết nối API rồi chọn Tải dữ liệu.");
  const [journals, setJournals] = useState<ApiRow[]>([]);
  const [accounts, setAccounts] = useState<ApiRow[]>([]);
  const [resources, setResources] = useState<ApiRow[]>([]);
  const [resourceName, setResourceName] = useState("parties");
  const [resourceRows, setResourceRows] = useState<ApiRow[]>([]);
  const [selectedJournal, setSelectedJournal] = useState<ApiRow>();
  const [selectedAccount, setSelectedAccount] = useState<ApiRow>();
  const [pendingJournalReason, setPendingJournalReason] = useState<PendingJournalReasonAction>();
  const [deactivatingAccountCode, setDeactivatingAccountCode] = useState<string>();
  const [trialBalance, setTrialBalance] = useState<ApiRow[]>([]);
  const [generalLedger, setGeneralLedger] = useState<ApiRow[]>([]);
  const [reportRange, setReportRange] = useState({
    from: `${TODAY.slice(0, 4)}-01-01`,
    to: TODAY,
    accountCode: "",
  });
  const idempotencyKeys = useRef(new Map<string, string>());

  useEffect(() => {
    const settings = loadConnectionSettings(window.localStorage);
    setBaseUrl(settings.baseUrl);
    setOrganizationId(settings.organizationId);
    setToken(loadApiToken(window.sessionStorage));
  }, []);

  const apiRoot = useMemo(
    () =>
      `${baseUrl.replace(/\/$/, "")}/api/v1/organizations/${encodeURIComponent(organizationId)}`,
    [baseUrl, organizationId],
  );

  function persistSettings() {
    saveConnectionSettings(window.localStorage, { version: 1, baseUrl, organizationId });
    saveApiToken(window.sessionStorage, token);
  }

  async function request(
    path: string,
    options: {
      method?: "GET" | "POST" | "PATCH";
      body?: unknown;
      mutationKey?: string;
      version?: string;
    } = {},
  ): Promise<ApiEnvelope> {
    persistSettings();
    const method = options.method ?? "GET";
    const operationKey =
      options.mutationKey ?? `${method}:${path}:${JSON.stringify(options.body ?? {})}`;
    const idempotencyKey =
      method === "GET"
        ? undefined
        : (idempotencyKeys.current.get(operationKey) ?? crypto.randomUUID());
    if (idempotencyKey) idempotencyKeys.current.set(operationKey, idempotencyKey);
    const response = await fetch(`${apiRoot}/${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
        "x-correlation-id": crypto.randomUUID(),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        ...(options.version ? { "if-match": options.version } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const payload = (await response.json()) as ApiEnvelope;
    if (!response.ok) {
      const error = payload.error as ApiRow | undefined;
      throw new Error(String(error?.message ?? `HTTP ${response.status}`));
    }
    if (idempotencyKey) idempotencyKeys.current.delete(operationKey);
    return payload;
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể hoàn tất yêu cầu.");
    } finally {
      setBusy(false);
    }
  }

  async function loadJournals() {
    const items = rowsFrom(await fetchAllPages((path) => request(path), "journals"));
    setJournals(items);
    setNotice(`Đã tải ${items.length} bút toán.`);
  }

  async function loadAccounts() {
    const payload = await request("master-data/accounts");
    const items = rowsFrom(payload);
    setAccounts(items);
    setNotice(`Đã tải ${items.length} tài khoản.`);
  }

  async function loadResources() {
    const [definitions, values] = await Promise.all([
      request("master-data/resources"),
      request(`master-data/${encodeURIComponent(resourceName)}`),
    ]);
    const definitionData = definitions.data;
    setResources(
      Array.isArray(definitionData)
        ? definitionData.map((name) => ({ name }))
        : definitionData && typeof definitionData === "object"
          ? Object.entries(definitionData as Record<string, unknown>).map(([name, definition]) => ({
              name,
              definition,
            }))
          : [],
    );
    const items = rowsFrom(values);
    setResourceRows(items);
    setNotice(`Đã tải ${items.length} bản ghi ${resourceName}.`);
  }

  async function loadReports() {
    const query = new URLSearchParams({ from: reportRange.from, to: reportRange.to });
    const ledgerQuery = new URLSearchParams(query);
    if (reportRange.accountCode.trim())
      ledgerQuery.set("accountCode", reportRange.accountCode.trim());
    const [trial, ledger] = await Promise.all([
      request(`reports/trial-balance?${query}`),
      request(`reports/general-ledger?${ledgerQuery}`),
    ]);
    setTrialBalance(rowsFrom(trial));
    setGeneralLedger(rowsFrom(ledger));
    setNotice("Đã tải Trial Balance và General Ledger từ cùng khoảng kỳ.");
  }

  async function loadCurrent() {
    await run(async () => {
      if (section === "journals") return loadJournals();
      if (section === "reports") return loadReports();
      if (section === "accounts") return loadAccounts();
      return loadResources();
    });
  }

  useEffect(() => {
    if (token) void loadCurrent();
  }, [section, resourceName, token]);

  async function executeJournalAction(
    journalId: string,
    action: "approve" | "post" | "reverse",
    reason?: string,
  ) {
    await run(async () => {
      await request(`journals/${encodeURIComponent(journalId)}/${action}`, {
        method: "POST",
        body:
          action === "reverse"
            ? { reason, reversalDate: TODAY, reversalJournalId: `${journalId}-reversal` }
            : action === "approve"
              ? { reason }
              : {},
      });
      setSelectedJournal(undefined);
      await loadJournals();
    });
  }

  function journalAction(action: "approve" | "post" | "reverse") {
    const id = String(selectedJournal?.id ?? "");
    if (!id) return;
    if (action === "post") {
      void executeJournalAction(id, "post");
      return;
    }
    setPendingJournalReason({ action, journalId: id });
  }

  function requestDeactivateAccount() {
    const code = String(field(selectedAccount ?? {}, "code") ?? "");
    if (!code) return;
    setDeactivatingAccountCode(code);
  }

  async function confirmDeactivateAccount(code: string) {
    setDeactivatingAccountCode(undefined);
    await run(async () => {
      await request(
        `master-data/accounts/${encodeURIComponent(encodedMasterDataKey({ code }))}/deactivate`,
        { method: "POST", body: { data: {} } },
      );
      setSelectedAccount(undefined);
      await loadAccounts();
    });
  }

  return (
    <Card aria-label="Ledger and master data workspace" className="min-w-0">
      <CardHeader className="grid-cols-1 has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
        <CardTitle className="min-w-0">{title}</CardTitle>
        <CardDescription className="min-w-0">{description}</CardDescription>
        <CardAction className="col-start-1 row-start-3 row-span-1 flex w-full flex-wrap items-center justify-self-stretch gap-2 sm:col-start-2 sm:row-start-1 sm:row-span-2 sm:w-auto sm:flex-nowrap sm:justify-self-end [&>button]:min-w-0 [&>button]:flex-1 sm:[&>button]:flex-none">
          {section === "accounts" && (
            <CreateAccountDialog
              onCreate={(data) =>
                run(async () => {
                  await request("master-data/accounts", { method: "POST", body: { data } });
                  await loadAccounts();
                })
              }
              busy={busy}
            />
          )}
          {section === "journals" && (
            <CreateJournalDialog
              defaultDate={TODAY}
              onCreate={(body) =>
                run(async () => {
                  await request("journals", { method: "POST", body });
                  await loadJournals();
                })
              }
              busy={busy}
            />
          )}
          <Button variant="outline" type="button" onClick={loadCurrent} disabled={busy}>
            {busy ? "Đang tải…" : "Tải dữ liệu"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        <div
          className="flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="Phân hệ kế toán"
        >
          {allowedSections.map((item) => (
            <Button
              key={item}
              type="button"
              role="tab"
              aria-selected={section === item}
              variant={section === item ? "default" : "ghost"}
              onClick={() => setSection(item)}
            >
              {item === "journals"
                ? "Bút toán"
                : item === "reports"
                  ? "Sổ & báo cáo"
                  : item === "accounts"
                    ? "Tài khoản"
                    : "Danh mục khác"}
            </Button>
          ))}
        </div>
        <Alert
          variant={notice.includes("Không") || notice.includes("HTTP") ? "destructive" : "default"}
        >
          <AlertDescription>{notice}</AlertDescription>
        </Alert>

        {section === "journals" ? (
          <JournalSection
            journals={journals}
            selected={selectedJournal}
            busy={busy}
            onSelect={setSelectedJournal}
            onAction={journalAction}
          />
        ) : section === "reports" ? (
          <ReportSection
            range={reportRange}
            onRange={setReportRange}
            trialBalance={trialBalance}
            generalLedger={generalLedger}
            onLoad={() => run(loadReports)}
            busy={busy}
          />
        ) : section === "accounts" ? (
          <AccountSection
            accounts={accounts}
            selected={selectedAccount}
            busy={busy}
            onSelect={setSelectedAccount}
            onDeactivate={requestDeactivateAccount}
          />
        ) : (
          <ResourceSection
            resources={resources}
            resourceName={resourceName}
            onResourceName={setResourceName}
            rows={resourceRows}
            onLoad={() => run(loadResources)}
            busy={busy}
          />
        )}
        <JournalReasonDialog
          pending={pendingJournalReason}
          busy={busy}
          onClose={() => setPendingJournalReason(undefined)}
          onConfirm={(reason) => {
            if (!pendingJournalReason) return;
            const current = pendingJournalReason;
            setPendingJournalReason(undefined);
            void executeJournalAction(current.journalId, current.action, reason);
          }}
        />
        <DeactivateAccountDialog
          accountCode={deactivatingAccountCode}
          busy={busy}
          onClose={() => setDeactivatingAccountCode(undefined)}
          onConfirm={() => {
            if (deactivatingAccountCode) {
              void confirmDeactivateAccount(deactivatingAccountCode);
            }
          }}
        />
      </CardContent>
    </Card>
  );
}

function JournalSection({
  journals,
  selected,
  busy,
  onSelect,
  onAction,
}: {
  journals: ApiRow[];
  selected?: ApiRow;
  busy: boolean;
  onSelect: (row: ApiRow) => void;
  onAction: (action: "approve" | "post" | "reverse") => void;
}) {
  return (
    <div>
      <SimpleTable
        columns={["id", "journalDate", "description", "state"]}
        rows={journals}
        selected={selected}
        onSelect={onSelect}
      />
      {selected ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || field(selected, "state") !== "draft"}
            onClick={() => onAction("approve")}
          >
            Duyệt
          </Button>
          <Button
            type="button"
            disabled={busy || field(selected, "state") !== "approved"}
            onClick={() => onAction("post")}
          >
            Post sổ
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || field(selected, "state") !== "posted"}
            onClick={() => onAction("reverse")}
          >
            Đảo bút toán
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ReportSection({
  range,
  onRange,
  trialBalance,
  generalLedger,
  onLoad,
  busy,
}: {
  range: { from: string; to: string; accountCode: string };
  onRange: (range: { from: string; to: string; accountCode: string }) => void;
  trialBalance: ApiRow[];
  generalLedger: ApiRow[];
  onLoad: () => void;
  busy: boolean;
}) {
  return (
    <div>
      <FieldGroup className="grid gap-4 md:grid-cols-3">
        <LabeledField label="Từ ngày">
          <Input
            type="date"
            value={range.from}
            onChange={(e) => onRange({ ...range, from: e.target.value })}
          />
        </LabeledField>
        <LabeledField label="Đến ngày">
          <Input
            type="date"
            value={range.to}
            onChange={(e) => onRange({ ...range, to: e.target.value })}
          />
        </LabeledField>
        <LabeledField label="Tài khoản GL">
          <Input
            value={range.accountCode}
            onChange={(e) => onRange({ ...range, accountCode: e.target.value })}
            placeholder="Ví dụ 111"
          />
        </LabeledField>
      </FieldGroup>
      <Button type="button" disabled={busy} onClick={onLoad}>
        Chạy báo cáo
      </Button>
      <h3>Trial Balance</h3>
      <SimpleTable
        columns={[
          "accountCode",
          "openingDebitMinor",
          "openingCreditMinor",
          "periodDebitMinor",
          "periodCreditMinor",
          "closingNetMinor",
        ]}
        rows={trialBalance}
        amountColumns={
          new Set([
            "openingDebitMinor",
            "openingCreditMinor",
            "periodDebitMinor",
            "periodCreditMinor",
            "closingNetMinor",
          ])
        }
      />
      <h3>General Ledger</h3>
      <SimpleTable
        columns={[
          "journalDate",
          "accountCode",
          "lineDescription",
          "debitMinor",
          "creditMinor",
          "runningBalanceMinor",
        ]}
        rows={generalLedger}
        amountColumns={new Set(["debitMinor", "creditMinor", "runningBalanceMinor"])}
      />
    </div>
  );
}

function AccountSection({
  accounts,
  selected,
  busy,
  onSelect,
  onDeactivate,
}: {
  accounts: ApiRow[];
  selected?: ApiRow;
  busy: boolean;
  onSelect: (row: ApiRow) => void;
  onDeactivate: () => void;
}) {
  return (
    <div>
      <SimpleTable
        columns={["code", "name", "root_type", "is_active"]}
        rows={accounts}
        selected={selected}
        onSelect={onSelect}
      />
      {selected ? (
        <Button
          type="button"
          variant="destructive"
          disabled={busy || field(selected, "is_active", "isActive") === false}
          onClick={onDeactivate}
        >
          Ngừng sử dụng
        </Button>
      ) : null}
    </div>
  );
}

function ResourceSection({
  resources,
  resourceName,
  onResourceName,
  rows,
  onLoad,
  busy,
}: {
  resources: ApiRow[];
  resourceName: string;
  onResourceName: (name: string) => void;
  rows: ApiRow[];
  onLoad: () => void;
  busy: boolean;
}) {
  const known = resources.length
    ? resources.map((item) => String(item.name))
    : ["parties", "projects", "contracts", "milestones", "dimensions", "tax-code-versions"];
  return (
    <div>
      <div className="flex items-center gap-2">
        <Select value={resourceName} onValueChange={onResourceName}>
          <SelectTrigger aria-label="Danh mục" className="min-w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {known.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button type="button" disabled={busy} onClick={onLoad}>
          Tải danh mục
        </Button>
      </div>
      <SimpleTable
        columns={["id", "code", "name", "display_name", "state", "status"]}
        rows={rows}
      />
    </div>
  );
}

function SimpleTable({
  columns,
  rows,
  selected,
  onSelect,
  amountColumns = new Set<string>(),
}: {
  columns: readonly string[];
  rows: ApiRow[];
  selected?: ApiRow;
  onSelect?: (row: ApiRow) => void;
  amountColumns?: ReadonlySet<string>;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column} className={amountColumns.has(column) ? "text-right" : ""}>
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow
              key={String(field(row, "id", "code") ?? index)}
              data-state={row === selected ? "selected" : undefined}
              className={onSelect ? "cursor-pointer" : undefined}
              onClick={() => onSelect?.(row)}
              onKeyDown={(event) => {
                if (onSelect && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelect(row);
                }
              }}
              tabIndex={onSelect ? 0 : undefined}
              aria-selected={onSelect ? row === selected : undefined}
            >
              {columns.map((column) => (
                <TableCell
                  key={column}
                  className={amountColumns.has(column) ? "text-right tabular-nums" : ""}
                >
                  {display(
                    field(
                      row,
                      column,
                      column.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
                    ),
                    amountColumns.has(column),
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length ? null : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Chưa có dữ liệu</EmptyTitle>
            <EmptyDescription>Không có bản ghi cho bộ lọc hiện tại.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
