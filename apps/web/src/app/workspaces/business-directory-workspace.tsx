"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuthenticatedApiClient } from "@/lib/api";
import type { createApiClient } from "@/lib/api";

type DirectoryKind = "customers" | "projects";
type Row = Record<string, unknown>;
type Page = Readonly<{ items: readonly Row[]; nextCursor?: string }>;

const value = (row: Row, key: string) => String(row[key] ?? "");
const money = (amount: string, currency = "VND") => {
  try {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(BigInt(amount));
  } catch {
    return amount || "—";
  }
};
const masterDataKey = (id: string) =>
  btoa(JSON.stringify({ id })).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

export function BusinessDirectoryWorkspace({ kind }: Readonly<{ kind: DirectoryKind }>) {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [rows, setRows] = useState<readonly Row[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(false);

  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setError("");
    if (!hasToken) {
      setRows([]);
      setError("AUTH_REQUIRED");
      setLoading(false);
      return;
    }
    try {
      const resource = kind === "customers" ? "parties" : "projects";
      const page = await client.data<Page>(`master-data/${resource}?limit=100`);
      if (kind === "projects") {
        setRows(page.items);
      } else {
        const roles = await client.data<Page>("master-data/party-roles?limit=100");
        const customerIds = new Set(
          roles.items
            .filter((row) => value(row, "role") === "client")
            .map((row) => value(row, "party_id")),
        );
        setRows(
          page.items.filter(
            (row) => value(row, "status") !== "inactive" && customerIds.has(value(row, "id")),
          ),
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, [client, hasToken, hydrated, kind]);
  useEffect(() => void load(), [load]);

  const filtered = rows.filter((row) =>
    Object.values(row).some((item) =>
      String(item ?? "")
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          className="sm:max-w-sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={kind === "customers" ? "Tìm khách hàng…" : "Tìm dự án…"}
          aria-label={kind === "customers" ? "Tìm khách hàng" : "Tìm dự án"}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            Làm mới
          </Button>
          <Button onClick={() => setEditor(true)}>Tạo mới</Button>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Không tải được dữ liệu</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((row) => {
          const id = value(row, "id");
          const customer = kind === "customers";
          return (
            <Card key={id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      {customer ? value(row, "display_name") : value(row, "name")}
                    </CardTitle>
                    <CardDescription>{customer ? id : value(row, "code")}</CardDescription>
                  </div>
                  <Badge variant="outline">
                    {customer ? value(row, "status") : value(row, "state")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href={`/${kind}/${encodeURIComponent(id)}`}>Mở hồ sơ</Link>
                </Button>
                {customer ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/receivables/customers/${encodeURIComponent(id)}`}>Công nợ</Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {!loading && filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có dữ liệu phù hợp.</p>
      ) : null}
      <DirectoryEditor
        kind={kind}
        open={editor}
        onOpenChange={setEditor}
        client={client}
        onSaved={load}
      />
    </div>
  );
}

export function BusinessRecordWorkspace({
  kind,
  id,
}: Readonly<{ kind: DirectoryKind; id: string }>) {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [record, setRecord] = useState<Row>();
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    if (!hasToken) {
      setError("AUTH_REQUIRED");
      return;
    }
    const resource = kind === "customers" ? "parties" : "projects";
    setError("");
    void client
      .data<Row>(`master-data/${resource}/${masterDataKey(id)}`)
      .then((item) => {
        setRecord(item);
        setError("");
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Không thể tải hồ sơ."),
      );
  }, [client, hasToken, hydrated, id, kind]);
  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Không tải được hồ sơ</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (!record) return <p className="text-sm text-muted-foreground">Đang tải hồ sơ…</p>;
  const customer = kind === "customers";
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{customer ? value(record, "display_name") : value(record, "name")}</CardTitle>
          <CardDescription>
            {customer ? `Mã khách hàng: ${id}` : `${value(record, "code")} · ${id}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {customer ? (
            <>
              <Fact
                label="Mã số thuế"
                value={value(record, "normalized_tax_id") || "Chưa cập nhật"}
              />
              <Fact label="Trạng thái" value={value(record, "status")} />
              <Fact label="Liên kết nghiệp vụ" value="Hóa đơn đầu ra · Công nợ phải thu" />
            </>
          ) : (
            <>
              <Fact label="Khách hàng" value={value(record, "client_party_id")} />
              <Fact label="Loại hợp đồng" value={value(record, "contract_type")} />
              <Fact label="Trạng thái" value={value(record, "state")} />
              <Fact
                label="Ngân sách"
                value={money(value(record, "budget_minor"), value(record, "currency"))}
              />
              <Fact label="Ngày bắt đầu" value={value(record, "starts_on")} />
              <Fact label="Ngày kết thúc" value={value(record, "ends_on") || "Chưa xác định"} />
            </>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        {customer ? (
          <>
            <Button asChild>
              <Link href={`/receivables/customers/${encodeURIComponent(id)}`}>
                Xem công nợ phải thu
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/documents?partyId=${encodeURIComponent(id)}`}>Hóa đơn khách hàng</Link>
            </Button>
          </>
        ) : (
          <>
            <Button asChild>
              <Link href={`/customers/${encodeURIComponent(value(record, "client_party_id"))}`}>
                Khách hàng
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/projects/${encodeURIComponent(id)}/budget`}>Ngân sách</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/projects/${encodeURIComponent(id)}/costs`}>Chi phí dự án</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/documents?projectId=${encodeURIComponent(id)}`}>Hóa đơn dự án</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/reports/project-profitability/projects/${encodeURIComponent(id)}`}>
                Lợi nhuận
              </Link>
            </Button>
          </>
        )}
        <Button variant="outline" onClick={() => setEditor(true)}>
          Chỉnh sửa
        </Button>
      </div>
      <DirectoryEditor
        kind={kind}
        open={editor}
        onOpenChange={setEditor}
        client={client}
        initial={record}
        onSaved={async () => {
          const resource = customer ? "parties" : "projects";
          setRecord(await client.data<Row>(`master-data/${resource}/${masterDataKey(id)}`));
        }}
      />
    </div>
  );
}

function Fact({ label, value: content }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{content || "—"}</p>
    </div>
  );
}

function DirectoryEditor({
  kind,
  open,
  onOpenChange,
  client,
  initial,
  onSaved,
}: Readonly<{
  kind: DirectoryKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: ReturnType<typeof createApiClient>;
  initial?: Row;
  onSaved: () => void | Promise<void>;
}>) {
  const customer = kind === "customers";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    const id = String(form.get("id") ?? "").trim();
    const data = customer
      ? {
          ...(initial ? {} : { id }),
          display_name: String(form.get("display_name") ?? "").trim(),
          normalized_tax_id: String(form.get("normalized_tax_id") ?? "").trim() || null,
          status: String(form.get("status") ?? "active"),
        }
      : {
          ...(initial
            ? {}
            : {
                id,
                code: String(form.get("code") ?? "").trim(),
                client_party_id: String(form.get("client_party_id") ?? "").trim(),
                owner_user_id: String(form.get("owner_user_id") ?? "").trim(),
                contract_type: String(form.get("contract_type") ?? "fixed_fee"),
                currency: String(form.get("currency") ?? "VND").trim(),
                starts_on: String(form.get("starts_on") ?? ""),
              }),
          name: String(form.get("name") ?? "").trim(),
          budget_minor: String(form.get("budget_minor") ?? "0").trim(),
          ends_on: String(form.get("ends_on") ?? "").trim() || null,
          state: String(form.get("state") ?? "planned"),
        };
    const resource = customer ? "parties" : "projects";
    try {
      await client.data(
        initial
          ? `master-data/${resource}/${masterDataKey(value(initial, "id"))}`
          : `master-data/${resource}`,
        { method: initial ? "PATCH" : "POST", body: { data } },
      );
      if (customer && !initial) {
        await client.data("master-data/party-roles", {
          method: "POST",
          body: { data: { party_id: id, role: "client" } },
        });
      }
      await onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể lưu dữ liệu.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {initial ? "Chỉnh sửa" : "Tạo"} {customer ? "khách hàng" : "dự án"}
          </SheetTitle>
          <SheetDescription>
            Dữ liệu được ghi trực tiếp vào danh mục ERP và có audit phía server.
          </SheetDescription>
        </SheetHeader>
        <form className="space-y-4 px-4" action={(form) => void submit(form)}>
          {!initial ? <EditorField name="id" label="ID" required /> : null}
          {customer ? (
            <>
              <EditorField
                name="display_name"
                label="Tên khách hàng"
                defaultValue={value(initial ?? {}, "display_name")}
                required
              />
              <EditorField
                name="normalized_tax_id"
                label="Mã số thuế"
                defaultValue={value(initial ?? {}, "normalized_tax_id")}
              />
              <EditorField
                name="status"
                label="Trạng thái"
                defaultValue={value(initial ?? {}, "status") || "active"}
                required
              />
            </>
          ) : (
            <>
              {!initial ? <EditorField name="code" label="Mã dự án" required /> : null}
              <EditorField
                name="name"
                label="Tên dự án"
                defaultValue={value(initial ?? {}, "name")}
                required
              />
              {!initial ? (
                <EditorField name="client_party_id" label="ID khách hàng" required />
              ) : null}
              {!initial ? (
                <EditorField name="owner_user_id" label="ID người phụ trách" required />
              ) : null}
              {!initial ? (
                <EditorField
                  name="contract_type"
                  label="Loại hợp đồng"
                  defaultValue="fixed_fee"
                  required
                />
              ) : null}
              {!initial ? (
                <EditorField name="currency" label="Tiền tệ" defaultValue="VND" required />
              ) : null}
              <EditorField
                name="budget_minor"
                label="Ngân sách (đơn vị nhỏ nhất)"
                type="number"
                defaultValue={value(initial ?? {}, "budget_minor") || "0"}
                required
              />
              {!initial ? (
                <EditorField name="starts_on" label="Ngày bắt đầu" type="date" required />
              ) : null}
              <EditorField
                name="ends_on"
                label="Ngày kết thúc"
                type="date"
                defaultValue={value(initial ?? {}, "ends_on")}
              />
              <EditorField
                name="state"
                label="Trạng thái"
                defaultValue={value(initial ?? {}, "state") || "planned"}
                required
              />
            </>
          )}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <SheetFooter className="px-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Đang lưu…" : "Lưu"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function EditorField({
  name,
  label,
  ...props
}: React.ComponentProps<typeof Input> & { name: string; label: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`directory-${name}`}>{label}</Label>
      <Input id={`directory-${name}`} name={name} {...props} />
    </div>
  );
}
