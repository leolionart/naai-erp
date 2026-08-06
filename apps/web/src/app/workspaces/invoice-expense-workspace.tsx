"use client";

import { type ComponentProps, type FormEvent, useEffect, useId, useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileTextIcon, LayersIcon, CheckCircle2Icon, XIcon, SlidersIcon } from "lucide-react";

type Tone = "info" | "success" | "error";
type Row = Record<string, unknown>;

function translateDocumentType(type: unknown): string {
  if (!type) return "—";
  const t = String(type).toLowerCase().replace(/_/g, " ");
  if (t === "purchase invoice") return "Hóa đơn mua vào";
  if (t === "sales invoice") return "Hóa đơn bán ra";
  if (t === "credit note") return "Giảm trừ (Credit Note)";
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

function translateState(state: unknown): string {
  if (!state) return "—";
  const s = String(state).toLowerCase();
  if (s === "draft") return "Nháp";
  if (s === "captured") return "Đã ghi nhận";
  if (s === "verified") return "Đã xác thực";
  if (s === "approved") return "Đã phê duyệt";
  if (s === "posted") return "Đã vào sổ";
  if (s === "paid") return "Đã thanh toán";
  if (s === "partially_paid") return "Thanh toán một phần";
  if (s === "issued") return "Đã phát hành";
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  error,
  ...props
}: Omit<ComponentProps<typeof Input>, "onChange"> & {
  label: string;
  onChange?: (value: string) => void;
  error?: string;
}) {
  const generatedId = useId();
  const controlId = props.id ?? generatedId;
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={controlId}>{fieldLabel}</FieldLabel>
      <Input
        {...props}
        id={controlId}
        aria-invalid={Boolean(error)}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      />
      {error ? <FieldError>{error}</FieldError> : null}
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
  const [parties, setParties] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("Bấm “Tải dữ liệu” để bắt đầu.");

  function getPartyName(partyId: unknown) {
    if (!partyId) return "—";
    const idStr = String(partyId);
    const match = parties.find((p) => String(field(p, "id")) === idStr);
    if (match) {
      return String(field(match, "displayName") ?? field(match, "name") ?? idStr);
    }
    return idStr;
  }

  useEffect(() => {
    setItems([]);
    setSelected(undefined);
    setShowCreate(false);
    if (apiRoot) {
      request("master-data/parties?limit=100")
        .then((payload) => {
          const data = (payload.data ?? payload) as Row;
          setParties(Array.isArray(data.items) ? (data.items as Row[]) : []);
        })
        .catch(() => {});
      request("master-data/projects?limit=100")
        .then((payload) => {
          const data = (payload.data ?? payload) as Row;
          setProjects(Array.isArray(data.items) ? (data.items as Row[]) : []);
        })
        .catch(() => {});
    }
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
      const [payload, partiesPayload, projectsPayload] = await Promise.all([
        request(endpoint),
        request("master-data/parties?limit=100").catch(() => ({ items: [] })) as Promise<Row>,
        request("master-data/projects?limit=100").catch(() => ({ items: [] })) as Promise<Row>,
      ]);
      const data = (payload.data ?? payload) as Row;
      const rows = Array.isArray(data.items) ? (data.items as Row[]) : [];
      setItems(rows);

      const partiesData = (partiesPayload.data ?? partiesPayload) as Row;
      setParties(Array.isArray(partiesData.items) ? (partiesData.items as Row[]) : []);

      const projectsData = (projectsPayload.data ?? projectsPayload) as Row;
      setProjects(Array.isArray(projectsData.items) ? (projectsData.items as Row[]) : []);

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
    <Card>
      <CardHeader>
        <CardTitle>{kind === "documents" ? "Hóa đơn bán / mua" : "Chi phí vận hành"}</CardTitle>
        <CardDescription>
          Nhập liệu theo form nghiệp vụ; hệ thống tự tạo payload REST chính xác.
        </CardDescription>
        <CardAction className="flex gap-2">
          <Button variant="outline" type="button" onClick={load} disabled={busy}>
            {busy ? "Đang xử lý…" : "Tải dữ liệu"}
          </Button>
          <Button type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Đóng form" : "+ Tạo mới"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {showCreate ? (
          kind === "documents" ? (
            <DocumentForm busy={busy} onSubmit={create} />
          ) : (
            <ExpenseForm busy={busy} onSubmit={create} />
          )
        ) : null}

        <Alert variant={notice.includes("Không") ? "destructive" : "default"}>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
        <div className="flex items-center gap-3">
          <Input
            aria-label="Tìm kiếm"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo số, đối tác, nội dung, trạng thái…"
          />
          <Badge variant="secondary">{visible.length} bản ghi</Badge>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">
                  {kind === "documents" ? "Số hóa đơn" : "Mã chi phí"}
                </TableHead>
                <TableHead className="w-[120px]">Ngày</TableHead>
                <TableHead>{kind === "documents" ? "Loại" : "Mục đích"}</TableHead>
                <TableHead>Đối tượng</TableHead>
                <TableHead className="w-[150px]">Tổng tiền</TableHead>
                <TableHead className="w-[140px]">Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row, index) => {
                const id = String(field(row, "id") ?? index);
                return (
                  <TableRow
                    key={id}
                    data-state={String(field(selected, "id") ?? "") === id ? "selected" : undefined}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => choose(row)}
                  >
                    <TableCell className="font-semibold text-foreground">
                      {label(field(row, kind === "documents" ? "documentNumber" : "id"))}
                    </TableCell>
                    <TableCell className="font-medium text-foreground tabular-nums">
                      {label(field(row, kind === "documents" ? "documentDate" : "expenseDate"))}
                    </TableCell>
                    <TableCell>
                      {kind === "documents"
                        ? translateDocumentType(field(row, "type"))
                        : label(field(row, "businessPurpose"))}
                    </TableCell>
                    <TableCell>
                      {kind === "documents"
                        ? getPartyName(field(row, "partyId"))
                        : getPartyName(field(row, "payeePartyId"))}
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums text-foreground">
                      {money(field(row, "grossMinor"))}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          field(row, "state") === "posted" || field(row, "state") === "paid"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {translateState(field(row, "state"))}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {!visible.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Chưa có dữ liệu</EmptyTitle>
                <EmptyDescription>Không có bản ghi phù hợp với bộ lọc hiện tại.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </div>

        {selected ? (
          <RecordActionsDialog
            kind={kind}
            record={selected}
            busy={busy}
            onAction={action}
            open={Boolean(selected)}
            onOpenChange={(nextOpen) => !nextOpen && setSelected(undefined)}
            parties={parties}
            projects={projects}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DocumentForm({
  busy,
  onSubmit,
  initial,
  submitLabel = "Lưu hóa đơn nháp",
}: {
  busy: boolean;
  onSubmit: (body: Row) => void;
  initial?: Row;
  submitLabel?: string;
}) {
  const initialLine = Array.isArray(initial?.lines)
    ? (initial.lines[0] as Row | undefined)
    : undefined;
  const initialAllocation = Array.isArray(initialLine?.allocations)
    ? (initialLine.allocations[0] as Row | undefined)
    : undefined;
  const initialDimensions = (field(initialAllocation, "dimensions") as Row | undefined) ?? {};
  const [form, setForm] = useState(() => ({
    type: String(field(initial, "type") ?? "sales_invoice"),
    number: String(field(initial, "documentNumber") ?? ""),
    party: String(field(initial, "partyId") ?? ""),
    date: String(field(initial, "documentDate") ?? today()),
    dueDate: String(field(initial, "dueDate") ?? today()),
    description: String(field(initialLine, "description") ?? ""),
    net: String(field(initial, "netMinor") ?? ""),
    tax: String(field(initial, "taxMinor") ?? "0"),
    controlAccount: String(field(initial, "controlAccountCode") ?? "131"),
    primaryAccount: String(field(initialLine, "primaryAccountCode") ?? "511"),
    taxAccount: String(field(initialLine, "taxAccountCode") ?? "3331"),
    project: String(
      field(initialDimensions, "projectId") ?? field(initialDimensions, "project") ?? "",
    ),
    costCenter: String(field(initialDimensions, "costCenter") ?? "DELIVERY"),
    taxState: String(field(initialDimensions, "taxState") ?? "eligible"),
    originalDocumentId: String(field(initial, "originalDocumentId") ?? ""),
    reason: String(field(initial, "reason") ?? ""),
  }));
  const set = (key: keyof typeof form, value: string) => setForm((v) => ({ ...v, [key]: value }));
  const gross = add(form.net, form.tax);
  const dueDateInvalid = Boolean(form.date && form.dueDate && form.dueDate < form.date);

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
    if (dueDateInvalid) return;
    const dimensions: Record<string, string> = {
      costCenter: form.costCenter || "GENERAL",
      ...(form.project ? { projectId: form.project } : {}),
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
          allocations: [
            {
              id: String(field(initialAllocation, "id") ?? crypto.randomUUID()),
              amountMinor: form.net,
              dimensions,
            },
          ],
        },
      ],
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
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
          min={form.date}
          value={form.dueDate}
          onChange={(v) => set("dueDate", v)}
          error={dueDateInvalid ? "Hạn thanh toán không được trước ngày hóa đơn." : undefined}
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
      <Button type="submit" disabled={busy || dueDateInvalid}>
        {submitLabel}
      </Button>
    </form>
  );
}

export function ExpenseForm({
  busy,
  onSubmit,
  initial,
  submitLabel = "Lưu chi phí nháp",
}: {
  busy: boolean;
  onSubmit: (body: Row) => void;
  initial?: Row;
  submitLabel?: string;
}) {
  const initialLine = Array.isArray(initial?.lines)
    ? (initial.lines[0] as Row | undefined)
    : undefined;
  const initialAllocation = Array.isArray(initialLine?.allocations)
    ? (initialLine.allocations[0] as Row | undefined)
    : undefined;
  const initialDimensions = (field(initialAllocation, "dimensions") as Row | undefined) ?? {};
  const initialEvidence = (field(initial, "evidenceChecklist") as Row | undefined) ?? {};
  const [form, setForm] = useState(() => ({
    expenseClass: String(field(initial, "expenseClass") ?? "invoice_backed"),
    date: String(field(initial, "expenseDate") ?? today()),
    purpose: String(field(initial, "businessPurpose") ?? ""),
    payee: String(field(initial, "payeePartyId") ?? ""),
    employee: String(field(initial, "employeePartyId") ?? ""),
    net: String(field(initial, "netMinor") ?? ""),
    vat: String(field(initial, "vatMinor") ?? "0"),
    postingAccount: String(field(initialLine, "postingAccountCode") ?? "642"),
    vatAccount: String(field(initialLine, "vatAccountCode") ?? "1331"),
    counterAccount: String(field(initial, "counterAccountCode") ?? "331"),
    project: String(
      field(initialDimensions, "projectId") ?? field(initialDimensions, "project") ?? "",
    ),
    costCenter: String(field(initialDimensions, "costCenter") ?? "ADMIN"),
    invoice: Boolean(field(initialEvidence, "invoice") ?? true),
    receipt: Boolean(field(initialEvidence, "receipt") ?? false),
    contract: Boolean(field(initialEvidence, "contract") ?? false),
    payment: Boolean(field(initialEvidence, "payment") ?? false),
  }));
  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((v) => ({ ...v, [key]: value }));
  const gross = add(form.net, form.vat);

  function submit(event: FormEvent) {
    event.preventDefault();
    const dimensions = {
      costCenter: form.costCenter || "GENERAL",
      ...(form.project ? { projectId: form.project } : {}),
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
          allocations: [
            {
              id: String(field(initialAllocation, "id") ?? crypto.randomUUID()),
              amountMinor: form.net,
              dimensions,
            },
          ],
        },
      ],
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
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
        {submitLabel}
      </Button>
    </form>
  );
}

function RecordActionsDialog({
  kind,
  record,
  busy,
  onAction,
  open,
  onOpenChange,
  parties,
  projects,
}: {
  kind: "documents" | "expenses";
  record: Row;
  busy: boolean;
  onAction: (name: string, body: Row) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parties: readonly Row[];
  projects: readonly Row[];
}) {
  const type = String(field(record, "type") ?? "");
  const state = String(field(record, "state") ?? "");
  const [reason, setReason] = useState("Đã kiểm tra trên giao diện quản trị");
  const [axis, setAxis] = useState("management");
  const [reviewState, setReviewState] = useState("valid");
  const [eligible, setEligible] = useState("");
  const actions =
    kind === "documents" ? (documentActions[type]?.[state] ?? []) : (expenseActions[state] ?? []);

  function getPartyName(partyId: unknown) {
    if (!partyId) return "—";
    const idStr = String(partyId);
    const match = parties.find((p) => String(field(p, "id")) === idStr);
    if (match) {
      return String(field(match, "displayName") ?? field(match, "name") ?? idStr);
    }
    return idStr;
  }

  const renderedLines = useMemo(() => {
    const linesList = (record.lines ?? []) as Row[];
    return linesList.map((line, idx) => {
      const desc = String(field(line, "description") ?? field(line, "memo") ?? `Dòng ${idx + 1}`);
      const gross = money(field(line, "grossMinor") ?? field(line, "netMinor"));
      const allocations = (field(line, "allocations") ?? []) as Row[];
      const allocDetails = allocations
        .map((alloc) => {
          const pId = field(alloc, "projectId");
          const match = projects.find((p) => String(field(p, "id")) === String(pId));
          const pName = match
            ? String(field(match, "name") ?? field(match, "displayName") ?? pId)
            : String(pId || "");
          return pName ? `Dự án: ${pName}` : "";
        })
        .filter(Boolean)
        .join(", ");

      return {
        desc,
        gross,
        allocDetails,
      };
    });
  }, [record, projects]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="border-b border-border/40 pb-4">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <SlidersIcon className="h-5 w-5 text-primary" />
            <span>
              {kind === "documents"
                ? `Hóa đơn: ${field(record, "documentNumber") || field(record, "id")}`
                : `Chi phí: ${field(record, "id")}`}
            </span>
            <Badge
              variant={state === "posted" || state === "paid" ? "secondary" : "outline"}
              className="ml-2"
            >
              {translateState(state)}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Xem đầy đủ chi tiết chứng từ ghi sổ và thực hiện các thao tác phê duyệt quy trình.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 py-4">
          {/* Thông tin chung */}
          <div className="space-y-4 border-b border-border/40 pb-6 px-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <FileTextIcon className="h-4 w-4 text-primary" />
              <span>Thông tin chứng từ</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-3">
                <span className="text-[11px] font-medium text-muted-foreground">Ngày ghi sổ</span>
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  {label(field(record, kind === "documents" ? "documentDate" : "expenseDate"))}
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-3">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Đối tác / Đối tượng
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {getPartyName(field(record, kind === "documents" ? "partyId" : "payeePartyId"))}
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-3">
                <span className="text-[11px] font-medium text-muted-foreground">Phân loại</span>
                <span className="text-sm font-semibold text-foreground">
                  {kind === "documents"
                    ? translateDocumentType(field(record, "type"))
                    : label(field(record, "businessPurpose"))}
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-3">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Tổng tiền thanh toán
                </span>
                <span className="text-sm font-semibold text-foreground tabular-nums text-emerald-500">
                  {money(field(record, "grossMinor"))}
                </span>
              </div>
              {kind === "documents" && (
                <>
                  <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-3">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Tiền hàng (chưa VAT)
                    </span>
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {money(field(record, "netMinor"))}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg border bg-muted/20 p-3">
                    <span className="text-[11px] font-medium text-muted-foreground">Thuế VAT</span>
                    <span className="text-sm font-semibold text-foreground tabular-nums">
                      {money(field(record, "taxMinor"))}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Chi tiết dòng hàng */}
          {renderedLines.length > 0 && (
            <div className="space-y-4 border-b border-border/40 pb-6 px-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <LayersIcon className="h-4 w-4 text-primary" />
                <span>Chi tiết các dòng bút toán ({renderedLines.length})</span>
              </div>
              <div className="flex flex-col gap-2">
                {renderedLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col gap-1 rounded-lg border bg-muted/10 p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-foreground">{line.desc}</span>
                      <span className="font-semibold text-foreground tabular-nums shrink-0">
                        {line.gross}
                      </span>
                    </div>
                    {line.allocDetails && (
                      <span className="text-xs text-muted-foreground">{line.allocDetails}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Workflow & Actions */}
          <div className="space-y-4 px-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <CheckCircle2Icon className="h-4 w-4 text-emerald-500" />
              <span>Thực hiện phê duyệt quy trình</span>
            </div>

            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="action-reason">Lý do / Ghi chú phê duyệt</FieldLabel>
                <Input
                  id="action-reason"
                  aria-label="Lý do phê duyệt"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Nhập lý do thực hiện thao tác..."
                />
              </Field>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                {actions.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">
                    Không có hành động quy trình nào khả dụng ở trạng thái hiện tại.
                  </span>
                ) : (
                  actions.map((name) => (
                    <Button
                      variant="outline"
                      type="button"
                      disabled={busy}
                      key={name}
                      onClick={() => {
                        onAction(name, {
                          reason,
                          ...(name === "mark-evidence-pending"
                            ? { missingEvidenceTypes: ["invoice"] }
                            : {}),
                        });
                        onOpenChange(false);
                      }}
                    >
                      {label(name)}
                    </Button>
                  ))
                )}

                {kind === "expenses" && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border/20 pt-4 w-full">
                    <Field className="w-[120px]">
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
                    <Field className="w-[160px]">
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
                                <SelectItem value="accountant_override">
                                  Kế toán override
                                </SelectItem>
                              </>
                            ) : (
                              <>
                                <SelectItem value="eligible">Đủ điều kiện</SelectItem>
                                <SelectItem value="partially_eligible">Một phần</SelectItem>
                                <SelectItem value="ineligible">Không đủ điều kiện</SelectItem>
                                <SelectItem value="accountant_override">
                                  Kế toán override
                                </SelectItem>
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
                        className="w-[140px]"
                      />
                    ) : null}
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        onAction("review", {
                          axis,
                          lineNumber: 1,
                          state: reviewState,
                          reason,
                          ...(eligible ? { eligibleMinor: eligible } : {}),
                          ...(reviewState === "accountant_override"
                            ? { reference: "admin-ui-review" }
                            : {}),
                        });
                        onOpenChange(false);
                      }}
                    >
                      Lưu đánh giá dòng 1
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border/40 pt-4 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="gap-1">
            <XIcon className="h-4 w-4" />
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
