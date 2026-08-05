"use client";

import { type ComponentProps, type FormEvent, useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
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

function TextField({
  label: fieldLabel,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "onChange"> & {
  label: string;
  onChange?: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{fieldLabel}</FieldLabel>
      <Input {...props} onChange={onChange ? (event) => onChange(event.target.value) : undefined} />
    </Field>
  );
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
          <Button variant="outline" type="button" onClick={load} disabled={busy}>
            {busy ? "Đang xử lý…" : "Tải dữ liệu"}
          </Button>
          <Button type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Đóng form" : "+ Tạo mới"}
          </Button>
        </div>
      </div>

      {showCreate ? (
        kind === "documents" ? (
          <DocumentForm busy={busy} onSubmit={create} />
        ) : (
          <ExpenseForm busy={busy} onSubmit={create} />
        )
      ) : null}

      <Alert
        className={`inline-notice ${notice.includes("Không") ? "error" : ""}`}
        variant={notice.includes("Không") ? "destructive" : "default"}
      >
        <AlertDescription>{notice}</AlertDescription>
      </Alert>
      <div className="table-toolbar">
        <Input
          aria-label="Tìm kiếm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm theo số, đối tác, nội dung, trạng thái…"
        />
        <span>{visible.length} bản ghi</span>
      </div>
      <div className="data-table-wrap">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead>{kind === "documents" ? "Số hóa đơn" : "Ngày"}</TableHead>
              <TableHead>{kind === "documents" ? "Loại" : "Mục đích"}</TableHead>
              <TableHead>Đối tượng</TableHead>
              <TableHead>Tổng tiền</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row, index) => {
              const id = String(field(row, "id") ?? index);
              return (
                <TableRow
                  key={id}
                  className={String(field(selected, "id") ?? "") === id ? "selected" : ""}
                  onClick={() => choose(row)}
                >
                  <TableCell>
                    {label(field(row, kind === "documents" ? "documentNumber" : "expenseDate"))}
                  </TableCell>
                  <TableCell>
                    {label(field(row, kind === "documents" ? "type" : "businessPurpose"))}
                  </TableCell>
                  <TableCell>
                    {label(field(row, kind === "documents" ? "partyId" : "payeePartyId"))}
                  </TableCell>
                  <TableCell>{money(field(row, "grossMinor"))}</TableCell>
                  <TableCell>
                    <span className="status-pill ready">{label(field(row, "state"))}</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!visible.length ? (
          <Empty className="empty-state">
            <EmptyHeader>
              <EmptyTitle>Chưa có dữ liệu</EmptyTitle>
              <EmptyDescription>Không có bản ghi phù hợp với bộ lọc hiện tại.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
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
      <FieldGroup className="contents">
        <Field>
          <FieldLabel>Loại chứng từ</FieldLabel>
          <Select value={form.type} onValueChange={changeType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="sales_invoice">Hóa đơn bán ra</SelectItem>
                <SelectItem value="purchase_invoice">Hóa đơn mua vào</SelectItem>
                <SelectItem value="credit_note">Credit note</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <TextField
          label="Số hóa đơn"
          required
          value={form.number}
          onChange={(v) => set("number", v)}
        />
        <TextField
          label="Mã khách hàng / nhà cung cấp"
          required
          value={form.party}
          onChange={(v) => set("party", v)}
        />
        <TextField
          label="Ngày hóa đơn"
          required
          type="date"
          value={form.date}
          onChange={(v) => set("date", v)}
        />
        <TextField
          label="Hạn thanh toán"
          required
          type="date"
          value={form.dueDate}
          onChange={(v) => set("dueDate", v)}
        />
        <TextField
          label="Nội dung"
          required
          value={form.description}
          onChange={(v) => set("description", v)}
        />
        <TextField
          label="Tiền trước thuế"
          required
          inputMode="numeric"
          value={form.net}
          onChange={(v) => set("net", v)}
        />
        <TextField
          label="VAT"
          inputMode="numeric"
          value={form.tax}
          onChange={(v) => set("tax", v)}
        />
        <TextField label="Tổng thanh toán" readOnly value={gross} />
        <TextField
          label="Tài khoản công nợ"
          required
          value={form.controlAccount}
          onChange={(v) => set("controlAccount", v)}
        />
        <TextField
          label="Tài khoản doanh thu / chi phí"
          required
          value={form.primaryAccount}
          onChange={(v) => set("primaryAccount", v)}
        />
        {form.tax !== "0" ? (
          <TextField
            label="Tài khoản VAT"
            required
            value={form.taxAccount}
            onChange={(v) => set("taxAccount", v)}
          />
        ) : null}
        <TextField
          label="Dự án"
          value={form.project}
          onChange={(v) => set("project", v)}
          placeholder="Không bắt buộc"
        />
        <TextField
          label="Cost center"
          required
          value={form.costCenter}
          onChange={(v) => set("costCenter", v)}
        />
        {form.type === "purchase_invoice" && form.tax !== "0" ? (
          <Field>
            <FieldLabel>Đánh giá VAT</FieldLabel>
            <Select value={form.taxState} onValueChange={(value) => set("taxState", value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="eligible">Đủ điều kiện</SelectItem>
                  <SelectItem value="partially_eligible">Một phần</SelectItem>
                  <SelectItem value="ineligible">Không đủ điều kiện</SelectItem>
                  <SelectItem value="accountant_override">Kế toán override</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        {form.type === "credit_note" ? (
          <>
            <TextField
              label="ID hóa đơn gốc"
              required
              value={form.originalDocumentId}
              onChange={(v) => set("originalDocumentId", v)}
            />
            <TextField
              label="Lý do điều chỉnh"
              required
              value={form.reason}
              onChange={(v) => set("reason", v)}
            />
          </>
        ) : null}
      </FieldGroup>
      <Button type="submit" disabled={busy}>
        Lưu hóa đơn nháp
      </Button>
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
      <FieldGroup className="contents">
        <Field>
          <FieldLabel>Nhóm chi phí</FieldLabel>
          <Select
            value={form.expenseClass}
            onValueChange={(value) =>
              setForm((current) => ({
                ...current,
                expenseClass: value,
                ...(value === "non_documented" ? { vat: "0" } : {}),
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="invoice_backed">Có hóa đơn</SelectItem>
                <SelectItem value="receipt_backed">Có biên nhận</SelectItem>
                <SelectItem value="contract_backed">Theo hợp đồng</SelectItem>
                <SelectItem value="employee_reimbursement">Hoàn ứng nhân viên</SelectItem>
                <SelectItem value="bank_fee">Phí ngân hàng</SelectItem>
                <SelectItem value="non_documented">Không có hóa đơn</SelectItem>
                <SelectItem value="prepaid">Chi phí trả trước</SelectItem>
                <SelectItem value="fixed_asset">Tài sản cố định</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <TextField
          label="Ngày chi phí"
          required
          type="date"
          value={form.date}
          onChange={(v) => set("date", v)}
        />
        <TextField
          label="Mục đích kinh doanh"
          required
          value={form.purpose}
          onChange={(v) => set("purpose", v)}
        />
        <TextField
          label="Nhà cung cấp / người nhận"
          value={form.payee}
          onChange={(v) => set("payee", v)}
        />
        {form.expenseClass === "employee_reimbursement" ? (
          <TextField
            label="Nhân viên hoàn ứng"
            required
            value={form.employee}
            onChange={(v) => set("employee", v)}
          />
        ) : null}
        <TextField
          label="Tiền trước thuế"
          required
          inputMode="numeric"
          value={form.net}
          onChange={(v) => set("net", v)}
        />
        <TextField
          label="VAT"
          inputMode="numeric"
          value={form.vat}
          onChange={(v) => set("vat", v)}
          disabled={form.expenseClass === "non_documented"}
        />
        <TextField label="Tổng tiền" readOnly value={gross} />
        <TextField
          label="Tài khoản chi phí / tài sản"
          required
          value={form.postingAccount}
          onChange={(v) => set("postingAccount", v)}
        />
        {form.vat !== "0" ? (
          <TextField
            label="Tài khoản VAT"
            required
            value={form.vatAccount}
            onChange={(v) => set("vatAccount", v)}
          />
        ) : null}
        <TextField
          label="Tài khoản đối ứng"
          required
          value={form.counterAccount}
          onChange={(v) => set("counterAccount", v)}
        />
        <TextField
          label="Dự án"
          value={form.project}
          onChange={(v) => set("project", v)}
          placeholder="Không bắt buộc"
        />
        <TextField
          label="Cost center"
          required
          value={form.costCenter}
          onChange={(v) => set("costCenter", v)}
        />
        <FieldSet>
          <FieldLegend>Chứng từ hiện có</FieldLegend>
          <FieldGroup data-slot="checkbox-group">
            {(["invoice", "receipt", "contract", "payment"] as const).map((key) => (
              <Field key={key} orientation="horizontal">
                <Input
                  id={`evidence-${key}`}
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) => set(key, e.target.checked)}
                />
                <FieldLabel htmlFor={`evidence-${key}`}>{label(key)}</FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        </FieldSet>
      </FieldGroup>
      <Button type="submit" disabled={busy}>
        Lưu chi phí nháp
      </Button>
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
      <Field>
        <FieldLabel className="sr-only">Lý do thao tác</FieldLabel>
        <Input
          aria-label="Lý do thao tác"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {actions.map((name) => (
        <Button
          variant="outline"
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
        </Button>
      ))}
      {kind === "expenses" ? (
        <>
          <Field>
            <FieldLabel className="sr-only">Trục đánh giá</FieldLabel>
            <Select
              value={axis}
              onValueChange={(value) => {
                setAxis(value);
                setReviewState(value === "management" ? "valid" : "eligible");
              }}
            >
              <SelectTrigger aria-label="Trục đánh giá">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="management">Quản trị</SelectItem>
                  <SelectItem value="cit">CIT</SelectItem>
                  <SelectItem value="vat">VAT</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel className="sr-only">Kết quả đánh giá</FieldLabel>
            <Select value={reviewState} onValueChange={setReviewState}>
              <SelectTrigger aria-label="Kết quả đánh giá">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {axis === "management" ? (
                    <>
                      <SelectItem value="valid">Hợp lệ</SelectItem>
                      <SelectItem value="invalid">Không hợp lệ</SelectItem>
                      <SelectItem value="accountant_override">Kế toán override</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="eligible">Đủ điều kiện</SelectItem>
                      <SelectItem value="partially_eligible">Một phần</SelectItem>
                      <SelectItem value="ineligible">Không đủ điều kiện</SelectItem>
                      <SelectItem value="accountant_override">Kế toán override</SelectItem>
                    </>
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {reviewState === "partially_eligible" ? (
            <Input
              aria-label="Số tiền đủ điều kiện"
              inputMode="numeric"
              value={eligible}
              onChange={(e) => setEligible(e.target.value)}
              placeholder="Số tiền đủ điều kiện"
            />
          ) : null}
          <Button
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
          </Button>
        </>
      ) : null}
    </div>
  );
}
