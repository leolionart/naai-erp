"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

type Tone = "info" | "success" | "error";
type Row = Record<string, unknown>;

export type InvoiceExpenseWorkspaceProps = {
  kind: "documents" | "expenses";
  apiRoot: string;
  token: string;
  onNotice?: (message: string, tone: Tone) => void;
};

const documentActions: Record<string, Record<string, readonly string[]>> = {
  sales_invoice: { draft: ["validate", "cancel"], validated: ["issue", "cancel"] },
  purchase_invoice: {
    draft: ["capture", "cancel"],
    captured: ["verify", "cancel"],
    verified: ["approve", "cancel"],
    approved: ["post"],
  },
  credit_note: { draft: ["validate", "cancel"], validated: ["issue", "cancel"] },
};

const expenseActions: Record<string, readonly string[]> = {
  draft: ["submit"],
  submitted: ["mark-evidence-pending", "approve", "reject"],
  evidence_pending: ["submit", "reject"],
  approved: ["post"],
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function field(row: Row | undefined, camel: string) {
  if (!row) return undefined;
  const snake = camel.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return row[camel] ?? row[snake];
}

function money(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  try {
    return `${new Intl.NumberFormat("vi-VN").format(BigInt(String(value)))} ₫`;
  } catch {
    return String(value);
  }
}

function add(a: string, b: string) {
  try {
    return (BigInt(a || "0") + BigInt(b || "0")).toString();
  } catch {
    return "0";
  }
}

function label(value: unknown) {
  return String(value ?? "—").replaceAll("_", " ");
}

export function InvoiceExpenseWorkspace({
  kind,
  apiRoot,
  token,
  onNotice,
}: InvoiceExpenseWorkspaceProps) {
  const endpoint = kind === "documents" ? "commercial-documents" : "expenses";
  const [items, setItems] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row>();
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("Bấm “Tải dữ liệu” để bắt đầu.");

  useEffect(() => {
    setItems([]);
    setSelected(undefined);
    setShowCreate(false);
  }, [kind, apiRoot]);

  function announce(message: string, tone: Tone = "info") {
    setNotice(message);
    onNotice?.(message, tone);
  }

  async function request(path: string, method: "GET" | "POST" = "GET", body?: unknown) {
    const response = await fetch(`${apiRoot.replace(/\/$/, "")}/${path}`, {
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
      throw new Error(String(error?.message ?? error?.code ?? `HTTP ${response.status}`));
    }
    return payload;
  }

  async function load() {
    setBusy(true);
    try {
      const payload = await request(endpoint);
      const data = (payload.data ?? payload) as Row;
      const rows = Array.isArray(data.items) ? (data.items as Row[]) : [];
      setItems(rows);
      setSelected(undefined);
      announce(`Đã tải ${rows.length} bản ghi.`, "success");
    } catch (error) {
      announce(error instanceof Error ? error.message : "Không thể tải dữ liệu.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function choose(row: Row) {
    setSelected(row);
    const id = String(field(row, "id") ?? "");
    if (!id) return;
    try {
      const payload = await request(`${endpoint}/${encodeURIComponent(id)}`);
      setSelected((payload.data ?? payload) as Row);
    } catch (error) {
      announce(error instanceof Error ? error.message : "Không thể đọc chi tiết.", "error");
    }
  }

  async function create(body: Row) {
    setBusy(true);
    try {
      await request(endpoint, "POST", body);
      setShowCreate(false);
      announce("Đã lưu bản nháp.", "success");
      await load();
    } catch (error) {
      announce(error instanceof Error ? error.message : "Không thể tạo bản ghi.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function action(name: string, body: Row) {
    const id = String(field(selected, "id") ?? "");
    if (!id) return;
    setBusy(true);
    try {
      await request(`${endpoint}/${encodeURIComponent(id)}/${name}`, "POST", body);
      announce(`Đã thực hiện “${label(name)}”.`, "success");
      await load();
    } catch (error) {
      announce(error instanceof Error ? error.message : `Không thể ${name}.`, "error");
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? items.filter((item) => JSON.stringify(item).toLowerCase().includes(normalized))
      : items;
  }, [items, query]);

  return (
    <section className="panel operational-workspace">
      <div className="panel-head workspace-head">
        <div>
          <h2>{kind === "documents" ? "Hóa đơn bán / mua" : "Chi phí vận hành"}</h2>
          <p>Nhập liệu theo form nghiệp vụ; hệ thống tự tạo payload REST chính xác.</p>
        </div>
        <div className="workspace-actions">
          <button className="ghost" type="button" onClick={load} disabled={busy}>
            {busy ? "Đang xử lý…" : "Tải dữ liệu"}
          </button>
          <button className="primary" type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Đóng form" : "+ Tạo mới"}
          </button>
        </div>
      </div>

      {showCreate ? (
        kind === "documents" ? (
          <DocumentForm busy={busy} onSubmit={create} />
        ) : (
          <ExpenseForm busy={busy} onSubmit={create} />
        )
      ) : null}

      <div className={`inline-notice ${notice.includes("Không") ? "error" : ""}`}>{notice}</div>
      <div className="table-toolbar">
        <input
          aria-label="Tìm kiếm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm theo số, đối tác, nội dung, trạng thái…"
        />
        <span>{visible.length} bản ghi</span>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{kind === "documents" ? "Số hóa đơn" : "Ngày"}</th>
              <th>{kind === "documents" ? "Loại" : "Mục đích"}</th>
              <th>Đối tượng</th>
              <th>Tổng tiền</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => {
              const id = String(field(row, "id") ?? index);
              return (
                <tr
                  key={id}
                  className={String(field(selected, "id") ?? "") === id ? "selected" : ""}
                  onClick={() => choose(row)}
                >
                  <td>
                    {label(field(row, kind === "documents" ? "documentNumber" : "expenseDate"))}
                  </td>
                  <td>{label(field(row, kind === "documents" ? "type" : "businessPurpose"))}</td>
                  <td>{label(field(row, kind === "documents" ? "partyId" : "payeePartyId"))}</td>
                  <td>{money(field(row, "grossMinor"))}</td>
                  <td>
                    <span className="status-pill ready">{label(field(row, "state"))}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length ? <div className="empty-state">Chưa có dữ liệu phù hợp.</div> : null}
      </div>

      {selected ? (
        <RecordActions kind={kind} record={selected} busy={busy} onAction={action} />
      ) : null}
    </section>
  );
}

function DocumentForm({ busy, onSubmit }: { busy: boolean; onSubmit: (body: Row) => void }) {
  const [form, setForm] = useState({
    type: "sales_invoice",
    number: "",
    party: "",
    date: today(),
    dueDate: today(),
    description: "",
    net: "",
    tax: "0",
    controlAccount: "131",
    primaryAccount: "511",
    taxAccount: "3331",
    project: "",
    costCenter: "DELIVERY",
    taxState: "eligible",
    originalDocumentId: "",
    reason: "",
  });
  const set = (key: keyof typeof form, value: string) => setForm((v) => ({ ...v, [key]: value }));
  const gross = add(form.net, form.tax);

  function changeType(type: string) {
    setForm((current) => ({
      ...current,
      type,
      controlAccount: type === "purchase_invoice" ? "331" : "131",
      primaryAccount: type === "purchase_invoice" ? "642" : "511",
      taxAccount: type === "purchase_invoice" ? "1331" : "3331",
    }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const dimensions: Record<string, string> = {
      costCenter: form.costCenter || "GENERAL",
      ...(form.project ? { project: form.project } : {}),
      ...(form.type === "purchase_invoice" && form.tax !== "0" ? { taxState: form.taxState } : {}),
    };
    onSubmit({
      type: form.type,
      documentNumber: form.number,
      fiscalYear: Number(form.date.slice(0, 4)),
      partyId: form.party,
      documentDate: form.date,
      dueDate: form.dueDate,
      currency: "VND",
      netMinor: form.net,
      taxMinor: form.tax || "0",
      grossMinor: gross,
      controlAccountCode: form.controlAccount,
      ...(form.type === "credit_note"
        ? { originalDocumentId: form.originalDocumentId, reason: form.reason }
        : {}),
      lines: [
        {
          description: form.description,
          quantity: "1",
          unitPriceMinor: form.net,
          netMinor: form.net,
          taxMinor: form.tax || "0",
          grossMinor: gross,
          primaryAccountCode: form.primaryAccount,
          ...(form.tax !== "0" ? { taxAccountCode: form.taxAccount } : {}),
          allocations: [{ id: crypto.randomUUID(), amountMinor: form.net, dimensions }],
        },
      ],
    });
  }

  return (
    <form className="business-form" onSubmit={submit}>
      <label>
        Loại chứng từ
        <select value={form.type} onChange={(e) => changeType(e.target.value)}>
          <option value="sales_invoice">Hóa đơn bán ra</option>
          <option value="purchase_invoice">Hóa đơn mua vào</option>
          <option value="credit_note">Credit note</option>
        </select>
      </label>
      <label>
        Số hóa đơn
        <input required value={form.number} onChange={(e) => set("number", e.target.value)} />
      </label>
      <label>
        Mã khách hàng / nhà cung cấp
        <input required value={form.party} onChange={(e) => set("party", e.target.value)} />
      </label>
      <label>
        Ngày hóa đơn
        <input
          required
          type="date"
          value={form.date}
          onChange={(e) => set("date", e.target.value)}
        />
      </label>
      <label>
        Hạn thanh toán
        <input
          required
          type="date"
          value={form.dueDate}
          onChange={(e) => set("dueDate", e.target.value)}
        />
      </label>
      <label>
        Nội dung
        <input
          required
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </label>
      <label>
        Tiền trước thuế
        <input
          required
          inputMode="numeric"
          value={form.net}
          onChange={(e) => set("net", e.target.value)}
        />
      </label>
      <label>
        VAT
        <input inputMode="numeric" value={form.tax} onChange={(e) => set("tax", e.target.value)} />
      </label>
      <label>
        Tổng thanh toán
        <input readOnly value={gross} />
      </label>
      <label>
        Tài khoản công nợ
        <input
          required
          value={form.controlAccount}
          onChange={(e) => set("controlAccount", e.target.value)}
        />
      </label>
      <label>
        Tài khoản doanh thu / chi phí
        <input
          required
          value={form.primaryAccount}
          onChange={(e) => set("primaryAccount", e.target.value)}
        />
      </label>
      {form.tax !== "0" ? (
        <label>
          Tài khoản VAT
          <input
            required
            value={form.taxAccount}
            onChange={(e) => set("taxAccount", e.target.value)}
          />
        </label>
      ) : null}
      <label>
        Dự án
        <input
          value={form.project}
          onChange={(e) => set("project", e.target.value)}
          placeholder="Không bắt buộc"
        />
      </label>
      <label>
        Cost center
        <input
          required
          value={form.costCenter}
          onChange={(e) => set("costCenter", e.target.value)}
        />
      </label>
      {form.type === "purchase_invoice" && form.tax !== "0" ? (
        <label>
          Đánh giá VAT
          <select value={form.taxState} onChange={(e) => set("taxState", e.target.value)}>
            <option value="eligible">Đủ điều kiện</option>
            <option value="partially_eligible">Một phần</option>
            <option value="ineligible">Không đủ điều kiện</option>
            <option value="accountant_override">Kế toán override</option>
          </select>
        </label>
      ) : null}
      {form.type === "credit_note" ? (
        <>
          <label>
            ID hóa đơn gốc
            <input
              required
              value={form.originalDocumentId}
              onChange={(e) => set("originalDocumentId", e.target.value)}
            />
          </label>
          <label>
            Lý do điều chỉnh
            <input required value={form.reason} onChange={(e) => set("reason", e.target.value)} />
          </label>
        </>
      ) : null}
      <button className="primary" type="submit" disabled={busy}>
        Lưu hóa đơn nháp
      </button>
    </form>
  );
}

function ExpenseForm({ busy, onSubmit }: { busy: boolean; onSubmit: (body: Row) => void }) {
  const [form, setForm] = useState({
    expenseClass: "invoice_backed",
    date: today(),
    purpose: "",
    payee: "",
    employee: "",
    net: "",
    vat: "0",
    postingAccount: "642",
    vatAccount: "1331",
    counterAccount: "331",
    project: "",
    costCenter: "ADMIN",
    invoice: true,
    receipt: false,
    contract: false,
    payment: false,
  });
  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((v) => ({ ...v, [key]: value }));
  const gross = add(form.net, form.vat);

  function submit(event: FormEvent) {
    event.preventDefault();
    const dimensions = {
      costCenter: form.costCenter || "GENERAL",
      ...(form.project ? { project: form.project } : {}),
    };
    onSubmit({
      expenseClass: form.expenseClass,
      ...(form.payee ? { payeePartyId: form.payee } : {}),
      ...(form.expenseClass === "employee_reimbursement" ? { employeePartyId: form.employee } : {}),
      expenseDate: form.date,
      businessPurpose: form.purpose,
      currency: "VND",
      netMinor: form.net,
      vatMinor: form.vat || "0",
      grossMinor: gross,
      counterAccountCode: form.counterAccount,
      evidenceChecklist: {
        invoice: form.invoice,
        receipt: form.receipt,
        contract: form.contract,
        payment: form.payment,
        businessPurpose: true,
      },
      lines: [
        {
          description: form.purpose,
          netMinor: form.net,
          vatMinor: form.vat || "0",
          grossMinor: gross,
          postingAccountCode: form.postingAccount,
          ...(form.vat !== "0" ? { vatAccountCode: form.vatAccount } : {}),
          allocations: [{ id: crypto.randomUUID(), amountMinor: form.net, dimensions }],
        },
      ],
    });
  }

  return (
    <form className="business-form" onSubmit={submit}>
      <label>
        Nhóm chi phí
        <select
          value={form.expenseClass}
          onChange={(e) =>
            setForm((current) => ({
              ...current,
              expenseClass: e.target.value,
              ...(e.target.value === "non_documented" ? { vat: "0" } : {}),
            }))
          }
        >
          <option value="invoice_backed">Có hóa đơn</option>
          <option value="receipt_backed">Có biên nhận</option>
          <option value="contract_backed">Theo hợp đồng</option>
          <option value="employee_reimbursement">Hoàn ứng nhân viên</option>
          <option value="bank_fee">Phí ngân hàng</option>
          <option value="non_documented">Không có hóa đơn</option>
          <option value="prepaid">Chi phí trả trước</option>
          <option value="fixed_asset">Tài sản cố định</option>
        </select>
      </label>
      <label>
        Ngày chi phí
        <input
          required
          type="date"
          value={form.date}
          onChange={(e) => set("date", e.target.value)}
        />
      </label>
      <label>
        Mục đích kinh doanh
        <input required value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
      </label>
      <label>
        Nhà cung cấp / người nhận
        <input value={form.payee} onChange={(e) => set("payee", e.target.value)} />
      </label>
      {form.expenseClass === "employee_reimbursement" ? (
        <label>
          Nhân viên hoàn ứng
          <input required value={form.employee} onChange={(e) => set("employee", e.target.value)} />
        </label>
      ) : null}
      <label>
        Tiền trước thuế
        <input
          required
          inputMode="numeric"
          value={form.net}
          onChange={(e) => set("net", e.target.value)}
        />
      </label>
      <label>
        VAT
        <input
          inputMode="numeric"
          value={form.vat}
          onChange={(e) => set("vat", e.target.value)}
          disabled={form.expenseClass === "non_documented"}
        />
      </label>
      <label>
        Tổng tiền
        <input readOnly value={gross} />
      </label>
      <label>
        Tài khoản chi phí / tài sản
        <input
          required
          value={form.postingAccount}
          onChange={(e) => set("postingAccount", e.target.value)}
        />
      </label>
      {form.vat !== "0" ? (
        <label>
          Tài khoản VAT
          <input
            required
            value={form.vatAccount}
            onChange={(e) => set("vatAccount", e.target.value)}
          />
        </label>
      ) : null}
      <label>
        Tài khoản đối ứng
        <input
          required
          value={form.counterAccount}
          onChange={(e) => set("counterAccount", e.target.value)}
        />
      </label>
      <label>
        Dự án
        <input
          value={form.project}
          onChange={(e) => set("project", e.target.value)}
          placeholder="Không bắt buộc"
        />
      </label>
      <label>
        Cost center
        <input
          required
          value={form.costCenter}
          onChange={(e) => set("costCenter", e.target.value)}
        />
      </label>
      <fieldset>
        <legend>Chứng từ hiện có</legend>
        {(["invoice", "receipt", "contract", "payment"] as const).map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={form[key]}
              onChange={(e) => set(key, e.target.checked)}
            />{" "}
            {label(key)}
          </label>
        ))}
      </fieldset>
      <button className="primary" type="submit" disabled={busy}>
        Lưu chi phí nháp
      </button>
    </form>
  );
}

function RecordActions({
  kind,
  record,
  busy,
  onAction,
}: {
  kind: "documents" | "expenses";
  record: Row;
  busy: boolean;
  onAction: (name: string, body: Row) => void;
}) {
  const type = String(field(record, "type") ?? "");
  const state = String(field(record, "state") ?? "");
  const [reason, setReason] = useState("Đã kiểm tra trên giao diện quản trị");
  const [axis, setAxis] = useState("management");
  const [reviewState, setReviewState] = useState("valid");
  const [eligible, setEligible] = useState("");
  const actions =
    kind === "documents" ? (documentActions[type]?.[state] ?? []) : (expenseActions[state] ?? []);

  return (
    <div className="lifecycle-actions">
      <strong>
        Đang chọn: {label(field(record, kind === "documents" ? "documentNumber" : "id"))} ·{" "}
        {label(state)}
      </strong>
      <input
        aria-label="Lý do thao tác"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {actions.map((name) => (
        <button
          className="ghost"
          type="button"
          disabled={busy}
          key={name}
          onClick={() =>
            onAction(name, {
              reason,
              ...(name === "mark-evidence-pending" ? { missingEvidenceTypes: ["invoice"] } : {}),
            })
          }
        >
          {label(name)}
        </button>
      ))}
      {kind === "expenses" ? (
        <>
          <select
            aria-label="Trục đánh giá"
            value={axis}
            onChange={(e) => {
              setAxis(e.target.value);
              setReviewState(e.target.value === "management" ? "valid" : "eligible");
            }}
          >
            <option value="management">Quản trị</option>
            <option value="cit">CIT</option>
            <option value="vat">VAT</option>
          </select>
          <select
            aria-label="Kết quả đánh giá"
            value={reviewState}
            onChange={(e) => setReviewState(e.target.value)}
          >
            {axis === "management" ? (
              <>
                <option value="valid">Hợp lệ</option>
                <option value="invalid">Không hợp lệ</option>
                <option value="accountant_override">Kế toán override</option>
              </>
            ) : (
              <>
                <option value="eligible">Đủ điều kiện</option>
                <option value="partially_eligible">Một phần</option>
                <option value="ineligible">Không đủ điều kiện</option>
                <option value="accountant_override">Kế toán override</option>
              </>
            )}
          </select>
          {reviewState === "partially_eligible" ? (
            <input
              aria-label="Số tiền đủ điều kiện"
              inputMode="numeric"
              value={eligible}
              onChange={(e) => setEligible(e.target.value)}
              placeholder="Số tiền đủ điều kiện"
            />
          ) : null}
          <button
            className="primary"
            type="button"
            disabled={busy}
            onClick={() =>
              onAction("review", {
                axis,
                lineNumber: 1,
                state: reviewState,
                reason,
                ...(eligible ? { eligibleMinor: eligible } : {}),
                ...(reviewState === "accountant_override" ? { reference: "admin-ui-review" } : {}),
              })
            }
          >
            Lưu đánh giá dòng 1
          </button>
        </>
      ) : null}
    </div>
  );
}
