"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthenticatedApiClient } from "@/lib/api";
import type { createApiClient } from "@/lib/api";
import { ProjectBudgetWorkspace } from "./project-revenue-workspaces";
import { ProjectCostsWorkspace } from "./project-cost-workspaces";
import { FocusedRecordListWorkspace } from "./focused-record-workspaces";

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
          const rawName = customer ? value(row, "display_name") : value(row, "name");
          let title = rawName;
          let note = value(row, "notes") || value(row, "description");
          if (!customer && rawName.includes(" — ")) {
            const parts = rawName.split(" — ");
            title = parts[0]!.trim();
            if (!note) note = parts.slice(1).join(" — ").trim();
          }

          return (
            <Card key={id} className="flex flex-col justify-between">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-semibold leading-tight">{title}</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {customer ? id : value(row, "code")}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {customer ? value(row, "status") : value(row, "state")}
                  </Badge>
                </div>
                {note ? (
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-2 italic">{note}</p>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 pt-0">
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
  const [clientParty, setClientParty] = useState<Row>();

  useEffect(() => {
    if (!hydrated || !hasToken || !id) return;
    const resource = kind === "customers" ? "parties" : "projects";
    setError("");
    void client
      .data<Row>(`master-data/${resource}/${masterDataKey(id)}`)
      .then((item) => {
        setRecord(item);
        setError("");
        const clientId = String(item.client_party_id || "");
        if (clientId) {
          client
            .data<Row>(`master-data/parties/${masterDataKey(clientId)}`)
            .then(setClientParty)
            .catch(() => undefined);
        }
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
  const clientName = clientParty
    ? String(clientParty.display_name || clientParty.name || value(record, "client_party_id"))
    : value(record, "client_party_id");

  const rawName = customer ? value(record, "display_name") : value(record, "name");
  let projectName = rawName;
  let projectNote = value(record, "notes") || value(record, "description");

  if (!customer && rawName.includes(" — ")) {
    const parts = rawName.split(" — ");
    projectName = parts[0]!.trim();
    if (!projectNote) projectNote = parts.slice(1).join(" — ").trim();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl">{projectName}</CardTitle>
              <CardDescription className="font-mono text-xs mt-1">
                {customer ? `Mã khách hàng: ${id}` : `${value(record, "code")} · ${id}`}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditor(true)}>
                Chỉnh sửa thông tin
              </Button>
            </div>
          </div>
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
              <Fact label="Khách hàng" value={clientName} />
              <Fact label="Loại hợp đồng" value={value(record, "contract_type")} />
              <Fact label="Trạng thái" value={value(record, "state")} />
              <Fact
                label="Ngân sách phê duyệt"
                value={money(value(record, "budget_minor"), value(record, "currency"))}
              />
              <Fact label="Ngày bắt đầu" value={value(record, "starts_on")} />
              <Fact label="Ngày kết thúc" value={value(record, "ends_on") || "Chưa xác định"} />
              {projectNote ? (
                <div className="col-span-full rounded-lg border p-3 bg-muted/20">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Ghi chú / Mới bổ sung
                  </p>
                  <p className="mt-1 font-medium text-sm text-foreground">{projectNote}</p>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {customer ? (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">
                    1. Hóa đơn Khách hàng (Đầu ra & Đã liên kết)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Tất cả các hóa đơn bán ra phát sinh cho khách hàng {projectName}.
                  </CardDescription>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/receivables/customers/${encodeURIComponent(id)}`}>
                    Xem sổ chi tiết công nợ
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <FocusedRecordListWorkspace kind="documents" initialPartyId={id} />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">1. Hóa đơn Dự án (Bán ra & Mua vào)</CardTitle>
              <CardDescription className="text-xs">
                Toàn bộ hóa đơn phát sinh doanh thu và chi phí gắn với mã dự án này.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FocusedRecordListWorkspace kind="documents" initialProjectId={id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">2. Ngân sách & Ghi nhận Doanh thu</CardTitle>
              <CardDescription className="text-xs">
                Budget versions, scope changes và các mốc doanh thu (recognized, invoiced,
                collected) của dự án.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProjectBudgetWorkspace projectId={id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">3. Chi phí Dự án (Project Costs)</CardTitle>
              <CardDescription className="text-xs">
                Chi tiết các khoản chi phí mua ngoài, vật tư, nhân công gắn liền với dự án.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProjectCostsWorkspace projectId={id} />
            </CardContent>
          </Card>
        </div>
      )}

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
            ? {
                client_party_id: String(form.get("client_party_id") ?? "").trim(),
                owner_user_id: String(form.get("owner_user_id") ?? "").trim(),
              }
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Chỉnh sửa" : "Tạo"} {customer ? "khách hàng" : "dự án"}
          </DialogTitle>
          <DialogDescription>
            Dữ liệu được ghi trực tiếp vào danh mục ERP và có audit phía server.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" action={(form) => void submit(form)}>
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
              <EditorField
                name="client_party_id"
                label="ID khách hàng"
                defaultValue={value(initial ?? {}, "client_party_id")}
                required
              />
              <EditorField
                name="owner_user_id"
                label="ID người phụ trách"
                defaultValue={value(initial ?? {}, "owner_user_id")}
                required
              />
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Đang lưu…" : "Lưu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
