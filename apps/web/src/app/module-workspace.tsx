"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  const [organizationId, setOrganizationId] = useState("naai");
  const [token, setToken] = useState("");
  const [items, setItems] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Nhập access token rồi bấm Tải dữ liệu.");
  const [filter, setFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem("naai-erp-admin-settings-v2");
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Settings;
        if (saved.version === 1) {
          setBaseUrl(saved.baseUrl);
          setOrganizationId(saved.organizationId);
        }
      } catch {
        window.localStorage.removeItem("naai-erp-admin-settings-v2");
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
      "naai-erp-admin-settings-v2",
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
    <Card className="operational-workspace">
      <CardHeader>
        <CardTitle>{config.title}</CardTitle>
        <CardDescription>
          Thao tác trực tiếp qua REST API, không cần nhập JSON cho luồng chính.
        </CardDescription>
        <CardAction className="flex gap-2">
          {moduleKey !== "documents" && moduleKey !== "expenses" ? (
            <Button variant="outline" onClick={load} disabled={busy}>
              Tải dữ liệu
            </Button>
          ) : null}
          {moduleKey !== "integrations" && moduleKey !== "documents" && moduleKey !== "expenses" ? (
            <Button onClick={() => setShowCreate((open) => !open)}>
              {showCreate ? "Đóng form" : "+ Tạo mới"}
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <details className="connection-settings">
          <summary>Kết nối API local</summary>
          <FieldGroup className="grid gap-4 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="module-api-url">API URL</FieldLabel>
              <Input
                id="module-api-url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="module-organization-id">Organization ID</FieldLabel>
              <Input
                id="module-organization-id"
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="module-access-token">Access token</FieldLabel>
              <Input
                id="module-access-token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Bearer token"
              />
            </Field>
          </FieldGroup>
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
          <Alert
            variant={
              notice.includes("Không") || notice.includes("AUTH") ? "destructive" : "default"
            }
          >
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        {moduleKey !== "documents" && moduleKey !== "expenses" ? (
          <div className="flex items-center gap-3">
            <Input
              aria-label="Tìm trong danh sách"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Tìm trong danh sách…"
            />
            <Badge variant="secondary">{visible.length} bản ghi</Badge>
          </div>
        ) : null}
        {moduleKey !== "documents" && moduleKey !== "expenses" ? (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {config.columns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row, index) => (
                  <TableRow
                    key={String(row.id ?? row.code ?? index)}
                    onClick={() => setSelected(row)}
                    data-state={selected === row ? "selected" : undefined}
                    className="cursor-pointer"
                  >
                    {config.columns.map((column) => (
                      <TableCell key={column}>{value(row, column)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!visible.length ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>Chưa có dữ liệu</EmptyTitle>
                  <EmptyDescription>{config.empty}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
          </div>
        ) : null}
        {moduleKey !== "documents" && moduleKey !== "expenses" && selected ? (
          <LifecycleActions moduleKey={moduleKey as ModuleKey} onAction={action} />
        ) : null}
      </CardContent>
    </Card>
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
  const field = (key: string, label: string, type = "text", required = true) => {
    const id = `create-${moduleKey}-${key}`;
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Input
          id={id}
          type={type}
          value={form[key] ?? ""}
          onChange={(event) => set(key, event.target.value)}
          required={required}
        />
      </Field>
    );
  };
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
      <FieldGroup>
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
        <Button type="submit" disabled={busy}>
          Lưu bản nháp
        </Button>
      </FieldGroup>
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
      <Field>
        <FieldLabel htmlFor="evidence-subject-type">Loại đối tượng</FieldLabel>
        <Input
          id="evidence-subject-type"
          value={form.subjectType ?? "expense"}
          onChange={(event) => set("subjectType", event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="evidence-subject-id">ID đối tượng</FieldLabel>
        <Input
          id="evidence-subject-id"
          value={form.subjectId ?? ""}
          onChange={(event) => set("subjectId", event.target.value)}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="evidence-type">Loại chứng từ</FieldLabel>
        <Input
          id="evidence-type"
          value={form.evidenceType ?? "receipt"}
          onChange={(event) => set("evidenceType", event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="evidence-file">Chọn PDF/XML/ảnh</FieldLabel>
        <Input
          id="evidence-file"
          type="file"
          accept=".pdf,.xml,image/jpeg,image/png"
          onChange={(event) => choose(event.target.files?.[0])}
          required
        />
      </Field>
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
    <div className="flex flex-wrap items-center gap-2">
      <strong>Thao tác bản ghi đã chọn</strong>
      {actions.map((name) => (
        <Button
          variant="outline"
          size="sm"
          key={name}
          onClick={() =>
            onAction(name, {
              reason: `Thực hiện ${name} từ admin UI`,
              ...(moduleKey === "evidence" ? { state: "accepted" } : {}),
            })
          }
        >
          {name}
        </Button>
      ))}
    </div>
  );
}
