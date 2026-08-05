"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { InvoiceExpenseWorkspace } from "./workspaces/invoice-expense-workspace";

type ModuleKey = "master-data" | "ledger" | "documents" | "expenses" | "evidence" | "integrations";
type Row = Record<string, unknown>;
type Settings = { version: 1; baseUrl: string; organizationId: string };

const moduleConfig: Record<
  ModuleKey,
  { endpoint: string; title: string; empty: string; columns: readonly string[] }
> = {
  "master-data": {
    endpoint: "master-data/accounts",
    title: "Danh mục tài khoản",
    empty: "Chưa có tài khoản trong organization này.",
    columns: ["code", "name", "rootType", "status"],
  },
  ledger: {
    endpoint: "journals",
    title: "Bút toán gần đây",
    empty: "Chưa có bút toán.",
    columns: ["id", "journalDate", "description", "state"],
  },
  documents: {
    endpoint: "commercial-documents",
    title: "Hóa đơn đầu ra / đầu vào",
    empty: "Chưa có hóa đơn.",
    columns: ["documentNumber", "type", "partyId", "grossMinor", "state"],
  },
  expenses: {
    endpoint: "expenses",
    title: "Khoản chi phí",
    empty: "Chưa có khoản chi phí.",
    columns: ["id", "expenseDate", "businessPurpose", "grossMinor", "state"],
  },
  evidence: {
    endpoint: "evidence",
    title: "Chứng từ đã tải lên",
    empty: "Chưa có chứng từ.",
    columns: ["id", "subjectType", "subjectId", "originalFilename", "reviewState"],
  },
  integrations: {
    endpoint: "inbound-events",
    title: "Webhook inbox",
    empty: "Chưa nhận sự kiện webhook.",
    columns: ["id", "event_type", "external_id", "state", "attempt_count"],
  },
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function value(row: Row, key: string) {
  const camel = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  const snake = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  const raw = row[key] ?? row[camel] ?? row[snake];
  if (raw === null || raw === undefined || raw === "") return "—";
  if (key.toLowerCase().includes("minor")) {
    const amount = Number(raw);
    if (Number.isFinite(amount)) return new Intl.NumberFormat("vi-VN").format(amount) + " ₫";
  }
  return typeof raw === "object" ? JSON.stringify(raw) : String(raw);
}

export function ModuleWorkspace({ moduleKey }: { moduleKey: string }) {
  const config = moduleConfig[moduleKey as ModuleKey];
  const [baseUrl, setBaseUrl] = useState("http://localhost:3001");
  const [organizationId, setOrganizationId] = useState("org-demo");
  const [token, setToken] = useState("");
  const [items, setItems] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Nhập access token rồi bấm Tải dữ liệu.");
  const [filter, setFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem("naai-erp-admin-settings-v1");
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Settings;
        if (saved.version === 1) {
          setBaseUrl(saved.baseUrl);
          setOrganizationId(saved.organizationId);
        }
      } catch {
        window.localStorage.removeItem("naai-erp-admin-settings-v1");
      }
    }
    setToken(window.sessionStorage.getItem("naai-erp-admin-token") ?? "");
  }, []);

  useEffect(() => {
    setItems([]);
    setSelected(undefined);
    setShowCreate(false);
  }, [moduleKey]);

  const apiRoot = useMemo(
    () =>
      `${baseUrl.replace(/\/$/, "")}/api/v1/organizations/${encodeURIComponent(organizationId)}`,
    [baseUrl, organizationId],
  );

  if (!config) return null;

  function persist() {
    window.localStorage.setItem(
      "naai-erp-admin-settings-v1",
      JSON.stringify({ version: 1, baseUrl, organizationId } satisfies Settings),
    );
    window.sessionStorage.setItem("naai-erp-admin-token", token);
  }

  async function request(path: string, method: "GET" | "POST" = "GET", body?: unknown) {
    persist();
    const response = await fetch(`${apiRoot}/${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
        "x-correlation-id": crypto.randomUUID(),
        ...(method === "POST" ? { "idempotency-key": crypto.randomUUID() } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = (await response.json()) as Row;
    if (!response.ok) {
      const error = payload.error as Row | undefined;
      throw new Error(String(error?.message ?? `HTTP ${response.status}`));
    }
    return payload;
  }

  async function load() {
    setBusy(true);
    setNotice("Đang tải dữ liệu…");
    try {
      const payload = await request(config.endpoint);
      const data = (payload.data ?? payload) as Row;
      const rows = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
      setItems(rows as Row[]);
      setNotice(`Đã tải ${rows.length} bản ghi.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể tải dữ liệu.");
    } finally {
      setBusy(false);
    }
  }

  async function create(payload: Row) {
    setBusy(true);
    try {
      await request(config.endpoint, "POST", payload);
      setShowCreate(false);
      setNotice("Đã tạo bản ghi. Đang làm mới danh sách…");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể tạo bản ghi.");
      setBusy(false);
    }
  }

  async function action(name: string, body: Row = {}) {
    const id = String(selected?.id ?? "");
    if (!id) return;
    setBusy(true);
    try {
      await request(`${config.endpoint}/${encodeURIComponent(id)}/${name}`, "POST", body);
      setNotice(`Đã thực hiện ${name}.`);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `Không thể ${name}.`);
      setBusy(false);
    }
  }

  const visible = filter
    ? items.filter((item) => JSON.stringify(item).toLowerCase().includes(filter.toLowerCase()))
    : items;

  return (
    <section className="panel operational-workspace">
      <div className="panel-head workspace-head">
        <div>
          <h2>{config.title}</h2>
          <p>Thao tác trực tiếp qua REST API, không cần nhập JSON cho luồng chính.</p>
        </div>
        <div className="workspace-actions">
          {moduleKey !== "documents" && moduleKey !== "expenses" ? (
            <button className="ghost" onClick={load} disabled={busy}>
              Tải dữ liệu
            </button>
          ) : null}
          {moduleKey !== "integrations" && moduleKey !== "documents" && moduleKey !== "expenses" ? (
            <button className="primary" onClick={() => setShowCreate((open) => !open)}>
              {showCreate ? "Đóng form" : "+ Tạo mới"}
            </button>
          ) : null}
        </div>
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
              placeholder="Bearer token"
            />
          </label>
        </div>
      </details>

      {moduleKey === "documents" || moduleKey === "expenses" ? (
        <InvoiceExpenseWorkspace
          kind={moduleKey}
          apiRoot={apiRoot}
          token={token}
          onNotice={(message) => setNotice(message)}
        />
      ) : null}

      {moduleKey !== "documents" && moduleKey !== "expenses" && showCreate ? (
        <CreateForm moduleKey={moduleKey as ModuleKey} busy={busy} onCreate={create} />
      ) : null}

      {moduleKey !== "documents" && moduleKey !== "expenses" ? (
        <div
          className={`inline-notice ${notice.includes("Không") || notice.includes("AUTH") ? "error" : ""}`}
        >
          {notice}
        </div>
      ) : null}
      {moduleKey !== "documents" && moduleKey !== "expenses" ? (
        <div className="table-toolbar">
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Tìm trong danh sách…"
          />
          <span>{visible.length} bản ghi</span>
        </div>
      ) : null}
      {moduleKey !== "documents" && moduleKey !== "expenses" ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {config.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, index) => (
                <tr
                  key={String(row.id ?? row.code ?? index)}
                  onClick={() => setSelected(row)}
                  className={selected === row ? "selected" : ""}
                >
                  {config.columns.map((column) => (
                    <td key={column}>{value(row, column)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length ? <div className="empty-state">{config.empty}</div> : null}
        </div>
      ) : null}
      {moduleKey !== "documents" && moduleKey !== "expenses" && selected ? (
        <LifecycleActions moduleKey={moduleKey as ModuleKey} onAction={action} />
      ) : null}
    </section>
  );
}

function CreateForm({
  moduleKey,
  busy,
  onCreate,
}: {
  moduleKey: ModuleKey;
  busy: boolean;
  onCreate: (payload: Row) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    date: today(),
    currency: "VND",
    amount: "0",
  });
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const field = (key: string, label: string, type = "text", required = true) => (
    <label>
      {label}
      <input
        type={type}
        value={form[key] ?? ""}
        onChange={(event) => set(key, event.target.value)}
        required={required}
      />
    </label>
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = form.amount || "0";
    if (moduleKey === "master-data")
      return onCreate({ code: form.code, name: form.name, rootType: form.rootType || "expense" });
    if (moduleKey === "ledger")
      return onCreate({
        journalDate: form.date,
        description: form.description,
        currency: form.currency,
        lines: [
          { accountCode: form.debitAccount, debitMinor: amount },
          { accountCode: form.creditAccount, creditMinor: amount },
        ],
      });
    if (moduleKey === "documents")
      return onCreate({
        type: form.type || "sales_invoice",
        documentNumber: form.number,
        fiscalYear: Number(form.date.slice(0, 4)),
        partyId: form.partyId,
        documentDate: form.date,
        dueDate: form.dueDate || form.date,
        currency: form.currency,
        netMinor: amount,
        taxMinor: form.tax || "0",
        grossMinor: String(Number(amount) + Number(form.tax || 0)),
        controlAccountCode: form.controlAccount || "131",
        lines: [
          {
            description: form.description || form.number,
            quantity: "1",
            unitPriceMinor: amount,
            netMinor: amount,
            taxMinor: form.tax || "0",
            grossMinor: String(Number(amount) + Number(form.tax || 0)),
            primaryAccountCode: form.primaryAccount || "511",
            allocations: [{ id: crypto.randomUUID(), amountMinor: amount, dimensions: {} }],
          },
        ],
      });
    if (moduleKey === "expenses")
      return onCreate({
        expenseClass: form.expenseClass || "non_documented",
        expenseDate: form.date,
        businessPurpose: form.description,
        currency: form.currency,
        netMinor: amount,
        vatMinor: form.tax || "0",
        grossMinor: String(Number(amount) + Number(form.tax || 0)),
        counterAccountCode: form.creditAccount || "111",
        lines: [
          {
            description: form.description,
            netMinor: amount,
            vatMinor: form.tax || "0",
            grossMinor: String(Number(amount) + Number(form.tax || 0)),
            postingAccountCode: form.debitAccount || "642",
            allocations: [{ id: crypto.randomUUID(), amountMinor: amount, dimensions: {} }],
          },
        ],
      });
  }
  return (
    <form className="business-form" onSubmit={submit}>
      {moduleKey === "master-data" ? (
        <>
          {field("code", "Mã tài khoản")}
          {field("name", "Tên tài khoản")}
          {field("rootType", "Nhóm (asset/liability/equity/revenue/expense)")}
        </>
      ) : null}
      {moduleKey === "ledger" ? (
        <>
          {field("date", "Ngày", "date")}
          {field("description", "Diễn giải")}
          {field("amount", "Số tiền", "number")}
          {field("debitAccount", "Tài khoản Nợ")}
          {field("creditAccount", "Tài khoản Có")}
        </>
      ) : null}
      {moduleKey === "documents" ? (
        <>
          {field("type", "Loại: sales_invoice / purchase_invoice")}
          {field("number", "Số hóa đơn")}
          {field("partyId", "Khách hàng / nhà cung cấp")}
          {field("date", "Ngày hóa đơn", "date")}
          {field("dueDate", "Hạn thanh toán", "date", false)}
          {field("description", "Nội dung")}
          {field("amount", "Tiền trước thuế", "number")}
          {field("tax", "VAT", "number", false)}
          {field("primaryAccount", "Tài khoản doanh thu / chi phí")}
          {field("controlAccount", "Tài khoản công nợ")}
        </>
      ) : null}
      {moduleKey === "expenses" ? (
        <>
          {field("expenseClass", "Loại chi phí")}
          {field("date", "Ngày chi", "date")}
          {field("description", "Mục đích kinh doanh")}
          {field("amount", "Tiền trước thuế", "number")}
          {field("tax", "VAT", "number", false)}
          {field("debitAccount", "Tài khoản chi phí")}
          {field("creditAccount", "Tài khoản thanh toán")}
        </>
      ) : null}
      {moduleKey === "evidence" ? <EvidenceFields form={form} set={set} /> : null}
      <button className="primary" type="submit" disabled={busy}>
        Lưu bản nháp
      </button>
    </form>
  );
}

function EvidenceFields({
  form,
  set,
}: {
  form: Record<string, string>;
  set: (key: string, value: string) => void;
}) {
  async function choose(file?: File) {
    if (!file) return;
    const content = await file.arrayBuffer();
    const bytes = new Uint8Array(content);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    set("originalFilename", file.name);
    set("declaredMediaType", file.type);
    set("contentBase64", btoa(binary));
  }
  return (
    <>
      <label>
        Loại đối tượng
        <input
          value={form.subjectType ?? "expense"}
          onChange={(event) => set("subjectType", event.target.value)}
        />
      </label>
      <label>
        ID đối tượng
        <input
          value={form.subjectId ?? ""}
          onChange={(event) => set("subjectId", event.target.value)}
          required
        />
      </label>
      <label>
        Loại chứng từ
        <input
          value={form.evidenceType ?? "receipt"}
          onChange={(event) => set("evidenceType", event.target.value)}
        />
      </label>
      <label className="file-field">
        Chọn PDF/XML/ảnh
        <input
          type="file"
          accept=".pdf,.xml,image/jpeg,image/png"
          onChange={(event) => choose(event.target.files?.[0])}
          required
        />
      </label>
    </>
  );
}

function LifecycleActions({
  moduleKey,
  onAction,
}: {
  moduleKey: ModuleKey;
  onAction: (name: string, body?: Row) => void;
}) {
  const actions =
    moduleKey === "ledger"
      ? ["approve", "post"]
      : moduleKey === "documents"
        ? ["capture", "validate", "verify", "approve", "issue", "post"]
        : moduleKey === "expenses"
          ? ["submit", "approve", "post"]
          : moduleKey === "evidence"
            ? ["review"]
            : moduleKey === "integrations"
              ? ["replay"]
              : [];
  if (!actions.length) return null;
  return (
    <div className="lifecycle-actions">
      <strong>Thao tác bản ghi đã chọn</strong>
      {actions.map((name) => (
        <button
          className="ghost"
          key={name}
          onClick={() =>
            onAction(name, {
              reason: `Thực hiện ${name} từ admin UI`,
              ...(moduleKey === "evidence" ? { state: "accepted" } : {}),
            })
          }
        >
          {name}
        </button>
      ))}
    </div>
  );
}
