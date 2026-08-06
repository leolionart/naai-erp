"use client";

import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
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

type Section = "journals" | "reports" | "accounts" | "resources";
type ApiRow = Record<string, unknown>;
type ApiEnvelope = Readonly<{ data?: unknown; nextActions?: readonly string[] }> & ApiRow;
type StoredSettings = { version: 1; baseUrl: string; organizationId: string };

const SETTINGS_KEY = "naai-erp-admin-settings-v2";
const TOKEN_KEY = "naai-erp-admin-token";
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
}: {
  initialSection?: Section;
}) {
  const [section, setSection] = useState<Section>(initialSection);
  const [baseUrl, setBaseUrl] = useState("http://localhost:3001");
  const [organizationId, setOrganizationId] = useState("naai");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Kết nối API rồi chọn Tải dữ liệu.");
  const [journals, setJournals] = useState<ApiRow[]>([]);
  const [accounts, setAccounts] = useState<ApiRow[]>([]);
  const [resources, setResources] = useState<ApiRow[]>([]);
  const [resourceName, setResourceName] = useState("parties");
  const [resourceRows, setResourceRows] = useState<ApiRow[]>([]);
  const [selectedJournal, setSelectedJournal] = useState<ApiRow>();
  const [selectedAccount, setSelectedAccount] = useState<ApiRow>();
  const [trialBalance, setTrialBalance] = useState<ApiRow[]>([]);
  const [generalLedger, setGeneralLedger] = useState<ApiRow[]>([]);
  const [reportRange, setReportRange] = useState({
    from: `${TODAY.slice(0, 4)}-01-01`,
    to: TODAY,
    accountCode: "",
  });
  const idempotencyKeys = useRef(new Map<string, string>());

  useEffect(() => {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as StoredSettings;
        if (saved.version === 1) {
          setBaseUrl(saved.baseUrl);
          setOrganizationId(saved.organizationId);
        }
      } catch {
        window.localStorage.removeItem(SETTINGS_KEY);
      }
    }
    setToken(window.sessionStorage.getItem(TOKEN_KEY) ?? "");
  }, []);

  const apiRoot = useMemo(
    () =>
      `${baseUrl.replace(/\/$/, "")}/api/v1/organizations/${encodeURIComponent(organizationId)}`,
    [baseUrl, organizationId],
  );

  function persistSettings() {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ version: 1, baseUrl, organizationId } satisfies StoredSettings),
    );
    window.sessionStorage.setItem(TOKEN_KEY, token);
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
    const payload = await request("journals");
    const items = rowsFrom(payload);
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

  async function journalAction(action: "approve" | "post" | "reverse") {
    const id = String(selectedJournal?.id ?? "");
    if (!id) return;
    const reason =
      action === "post" ? undefined : window.prompt("Lý do nghiệp vụ (được lưu audit):")?.trim();
    if (action !== "post" && !reason) return;
    await run(async () => {
      await request(`journals/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
        body:
          action === "reverse"
            ? { reason, reversalDate: TODAY, reversalJournalId: `${id}-reversal` }
            : action === "approve"
              ? { reason }
              : {},
      });
      setSelectedJournal(undefined);
      await loadJournals();
    });
  }

  async function deactivateAccount() {
    const code = String(field(selectedAccount ?? {}, "code") ?? "");
    if (!code || !window.confirm(`Ngừng sử dụng tài khoản ${code}?`)) return;
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
    <Card aria-label="Ledger and master data workspace">
      <CardHeader>
        <CardTitle>Sổ kế toán & dữ liệu nền</CardTitle>
        <CardDescription>
          Thao tác thân thiện qua REST v1; quyền, maker-checker, audit và idempotency do server thực
          thi.
        </CardDescription>
        <CardAction>
          <Button variant="outline" type="button" onClick={loadCurrent} disabled={busy}>
            {busy ? "Đang tải…" : "Tải dữ liệu"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <details>
          <summary>Kết nối API local</summary>
          <FieldGroup className="grid gap-4 md:grid-cols-3">
            <LabeledField label="API URL">
              <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
            </LabeledField>
            <LabeledField label="Organization ID">
              <Input
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
              />
            </LabeledField>
            <LabeledField label="Access token">
              <Input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </LabeledField>
          </FieldGroup>
        </details>

        <div
          className="flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="Phân hệ kế toán"
        >
          {(["journals", "reports", "accounts", "resources"] as const).map((item) => (
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
            onCreate={(body) =>
              run(async () => {
                await request("journals", { method: "POST", body });
                await loadJournals();
              })
            }
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
            onCreate={(data) =>
              run(async () => {
                await request("master-data/accounts", { method: "POST", body: { data } });
                await loadAccounts();
              })
            }
            onDeactivate={deactivateAccount}
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
      </CardContent>
    </Card>
  );
}

function JournalSection({
  journals,
  selected,
  busy,
  onSelect,
  onCreate,
  onAction,
}: {
  journals: ApiRow[];
  selected?: ApiRow;
  busy: boolean;
  onSelect: (row: ApiRow) => void;
  onCreate: (body: ApiRow) => void;
  onAction: (action: "approve" | "post" | "reverse") => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    id: "",
    date: TODAY,
    description: "",
    currency: "VND",
    debitAccount: "",
    creditAccount: "",
    amount: "",
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d+$/.test(form.amount) || BigInt(form.amount) <= 0n) return;
    onCreate({
      ...(form.id.trim() ? { id: form.id.trim() } : {}),
      journalDate: form.date,
      description: form.description,
      currency: form.currency,
      lines: [
        { accountCode: form.debitAccount, debitMinor: form.amount },
        { accountCode: form.creditAccount, creditMinor: form.amount },
      ],
    });
  }
  return (
    <div>
      <div className="flex justify-end">
        <Button type="button" onClick={() => setShowForm((value) => !value)}>
          + Bút toán nháp
        </Button>
      </div>
      {showForm ? (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <FieldGroup className="grid gap-4 md:grid-cols-3">
            <LabeledField label="ID tùy chọn">
              <Input
                value={form.id}
                onChange={(e) => setForm((v) => ({ ...v, id: e.target.value }))}
              />
            </LabeledField>
            <LabeledField label="Ngày hạch toán">
              <Input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm((v) => ({ ...v, date: e.target.value }))}
              />
            </LabeledField>
            <LabeledField label="Diễn giải">
              <Input
                required
                value={form.description}
                onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))}
              />
            </LabeledField>
            <LabeledField label="Tài khoản Nợ">
              <Input
                required
                value={form.debitAccount}
                onChange={(e) => setForm((v) => ({ ...v, debitAccount: e.target.value }))}
              />
            </LabeledField>
            <LabeledField label="Tài khoản Có">
              <Input
                required
                value={form.creditAccount}
                onChange={(e) => setForm((v) => ({ ...v, creditAccount: e.target.value }))}
              />
            </LabeledField>
            <LabeledField label="Số tiền minor units">
              <Input
                required
                inputMode="numeric"
                value={form.amount}
                onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))}
              />
            </LabeledField>
          </FieldGroup>
          <Button disabled={busy}>Lưu bản nháp</Button>
        </form>
      ) : null}
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
  onCreate,
  onDeactivate,
}: {
  accounts: ApiRow[];
  selected?: ApiRow;
  busy: boolean;
  onSelect: (row: ApiRow) => void;
  onCreate: (data: ApiRow) => void;
  onDeactivate: () => void;
}) {
  const [form, setForm] = useState({ code: "", name: "", rootType: "expense" });
  function submit(event: FormEvent) {
    event.preventDefault();
    onCreate({
      code: form.code,
      name: form.name,
      root_type: form.rootType,
      is_control_account: false,
      allow_manual_posting: true,
      is_active: true,
    });
  }
  return (
    <div>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <FieldGroup className="grid gap-4 md:grid-cols-3">
          <LabeledField label="Mã tài khoản">
            <Input
              required
              value={form.code}
              onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))}
            />
          </LabeledField>
          <LabeledField label="Tên tài khoản">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
            />
          </LabeledField>
          <LabeledField label="Nhóm">
            <Select
              value={form.rootType}
              onValueChange={(value) => setForm((v) => ({ ...v, rootType: value }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="asset">Tài sản</SelectItem>
                  <SelectItem value="liability">Nợ phải trả</SelectItem>
                  <SelectItem value="equity">Vốn chủ</SelectItem>
                  <SelectItem value="revenue">Doanh thu</SelectItem>
                  <SelectItem value="expense">Chi phí</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </LabeledField>
        </FieldGroup>
        <Button disabled={busy}>Tạo tài khoản</Button>
      </form>
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
    <div className="overflow-x-auto rounded-lg border">
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
