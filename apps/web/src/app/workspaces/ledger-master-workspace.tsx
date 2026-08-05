"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Section = "journals" | "reports" | "accounts" | "resources";
type ApiRow = Record<string, unknown>;
type ApiEnvelope = Readonly<{ data?: unknown; nextActions?: readonly string[] }> & ApiRow;
type StoredSettings = { version: 1; baseUrl: string; organizationId: string };

const SETTINGS_KEY = "naai-erp-admin-settings-v1";
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

export function LedgerMasterWorkspace({
  initialSection = "journals",
}: {
  initialSection?: Section;
}) {
  const [section, setSection] = useState<Section>(initialSection);
  const [baseUrl, setBaseUrl] = useState("http://localhost:3001");
  const [organizationId, setOrganizationId] = useState("org-demo");
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
    <section className="panel operational-workspace" aria-label="Ledger and master data workspace">
      <div className="panel-head workspace-head">
        <div>
          <h2>Sổ kế toán & dữ liệu nền</h2>
          <p>
            Thao tác thân thiện qua REST v1; quyền, maker-checker, audit và idempotency do server
            thực thi.
          </p>
        </div>
        <button className="ghost" type="button" onClick={loadCurrent} disabled={busy}>
          {busy ? "Đang tải…" : "Tải dữ liệu"}
        </button>
      </div>

      <details className="connection-settings">
        <summary>Kết nối API local</summary>
        <div className="connection-grid">
          <label>
            API URL
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </label>
          <label>
            Organization ID
            <input
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
            />
          </label>
          <label>
            Access token
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
        </div>
      </details>

      <div className="table-toolbar" role="tablist" aria-label="Phân hệ kế toán">
        {(["journals", "reports", "accounts", "resources"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={section === item ? "primary" : "ghost"}
            onClick={() => setSection(item)}
          >
            {item === "journals"
              ? "Bút toán"
              : item === "reports"
                ? "Sổ & báo cáo"
                : item === "accounts"
                  ? "Tài khoản"
                  : "Danh mục khác"}
          </button>
        ))}
      </div>
      <div
        className={`inline-notice ${notice.includes("Không") || notice.includes("HTTP") ? "error" : ""}`}
      >
        {notice}
      </div>

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
    </section>
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
      <div className="workspace-actions">
        <button className="primary" type="button" onClick={() => setShowForm((value) => !value)}>
          + Bút toán nháp
        </button>
      </div>
      {showForm ? (
        <form className="create-form" onSubmit={submit}>
          <div className="connection-grid">
            <label>
              ID tùy chọn
              <input
                value={form.id}
                onChange={(e) => setForm((v) => ({ ...v, id: e.target.value }))}
              />
            </label>
            <label>
              Ngày hạch toán
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm((v) => ({ ...v, date: e.target.value }))}
              />
            </label>
            <label>
              Diễn giải
              <input
                required
                value={form.description}
                onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))}
              />
            </label>
            <label>
              Tài khoản Nợ
              <input
                required
                value={form.debitAccount}
                onChange={(e) => setForm((v) => ({ ...v, debitAccount: e.target.value }))}
              />
            </label>
            <label>
              Tài khoản Có
              <input
                required
                value={form.creditAccount}
                onChange={(e) => setForm((v) => ({ ...v, creditAccount: e.target.value }))}
              />
            </label>
            <label>
              Số tiền minor units
              <input
                required
                inputMode="numeric"
                value={form.amount}
                onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))}
              />
            </label>
          </div>
          <button className="primary" disabled={busy}>
            Lưu bản nháp
          </button>
        </form>
      ) : null}
      <SimpleTable
        columns={["id", "journalDate", "description", "state"]}
        rows={journals}
        selected={selected}
        onSelect={onSelect}
      />
      {selected ? (
        <div className="workspace-actions">
          <button
            className="ghost"
            disabled={busy || field(selected, "state") !== "draft"}
            onClick={() => onAction("approve")}
          >
            Duyệt
          </button>
          <button
            className="primary"
            disabled={busy || field(selected, "state") !== "approved"}
            onClick={() => onAction("post")}
          >
            Post sổ
          </button>
          <button
            className="ghost"
            disabled={busy || field(selected, "state") !== "posted"}
            onClick={() => onAction("reverse")}
          >
            Đảo bút toán
          </button>
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
      <div className="connection-grid">
        <label>
          Từ ngày
          <input
            type="date"
            value={range.from}
            onChange={(e) => onRange({ ...range, from: e.target.value })}
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            value={range.to}
            onChange={(e) => onRange({ ...range, to: e.target.value })}
          />
        </label>
        <label>
          Tài khoản GL
          <input
            value={range.accountCode}
            onChange={(e) => onRange({ ...range, accountCode: e.target.value })}
            placeholder="Ví dụ 111"
          />
        </label>
      </div>
      <button className="primary" type="button" disabled={busy} onClick={onLoad}>
        Chạy báo cáo
      </button>
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
      <form className="create-form" onSubmit={submit}>
        <div className="connection-grid">
          <label>
            Mã tài khoản
            <input
              required
              value={form.code}
              onChange={(e) => setForm((v) => ({ ...v, code: e.target.value }))}
            />
          </label>
          <label>
            Tên tài khoản
            <input
              required
              value={form.name}
              onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
            />
          </label>
          <label>
            Nhóm
            <select
              value={form.rootType}
              onChange={(e) => setForm((v) => ({ ...v, rootType: e.target.value }))}
            >
              <option value="asset">Tài sản</option>
              <option value="liability">Nợ phải trả</option>
              <option value="equity">Vốn chủ</option>
              <option value="revenue">Doanh thu</option>
              <option value="expense">Chi phí</option>
            </select>
          </label>
        </div>
        <button className="primary" disabled={busy}>
          Tạo tài khoản
        </button>
      </form>
      <SimpleTable
        columns={["code", "name", "root_type", "is_active"]}
        rows={accounts}
        selected={selected}
        onSelect={onSelect}
      />
      {selected ? (
        <button
          className="ghost"
          disabled={busy || field(selected, "is_active", "isActive") === false}
          onClick={onDeactivate}
        >
          Ngừng sử dụng
        </button>
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
      <div className="request-row">
        <select value={resourceName} onChange={(e) => onResourceName(e.target.value)}>
          {known.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <button className="primary" disabled={busy} onClick={onLoad}>
          Tải danh mục
        </button>
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
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={String(field(row, "id", "code") ?? index)}
              className={row === selected ? "selected" : ""}
              onClick={() => onSelect?.(row)}
            >
              {columns.map((column) => (
                <td key={column}>
                  {display(
                    field(
                      row,
                      column,
                      column.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
                    ),
                    amountColumns.has(column),
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length ? null : <div className="empty-state">Chưa có dữ liệu cho bộ lọc hiện tại.</div>}
    </div>
  );
}
