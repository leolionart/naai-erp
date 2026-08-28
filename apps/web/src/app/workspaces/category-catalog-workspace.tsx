"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
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
import { useAuthenticatedApiClient } from "@/lib/api";

type Category = {
  code: string;
  name: string;
  kind: "expense" | "revenue";
  defaultAccountCode?: string;
  isActive: boolean;
  version?: string;
};
const key = (code: string) =>
  btoa(JSON.stringify({ code })).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
export function CategoryCatalogWorkspace() {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [rows, setRows] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null | undefined>();
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!hydrated) return;
    if (!hasToken) {
      setError("Cần API token để quản lý danh mục.");
      return;
    }
    try {
      const p = await client.data<Category[] | { items?: Category[] }>(
        "master-data/categories?limit=500",
      );
      setRows(
        (Array.isArray(p) ? p : (p.items ?? [])).map((row: Category) => {
          const r = row as Category & Record<string, unknown>;
          return {
            code: String(r.code),
            name: String(r.name ?? r.code),
            kind: r.kind === "revenue" ? "revenue" : "expense",
            defaultAccountCode: r.defaultAccountCode ?? r.default_account_code,
            isActive: Boolean(r.isActive ?? r.is_active ?? true),
            version: r.version ?? r.resourceVersion,
          };
        }),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải danh mục.");
    }
  }, [client, hydrated, hasToken]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Danh mục doanh thu và chi phí</CardTitle>
        <CardDescription>
          Một danh mục thống nhất được dùng khi nhập liệu, báo cáo và posting.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setEditing(null)}>
            <Plus data-icon="inline-start" /> Thêm danh mục
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã</TableHead>
                <TableHead>Tên</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead>Tài khoản mặc định</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.kind}-${r.code}`}>
                  <TableCell className="font-mono">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.kind === "revenue" ? "Doanh thu" : "Chi phí"}</TableCell>
                  <TableCell>{r.defaultAccountCode ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.isActive ? "secondary" : "outline"}>
                      {r.isActive ? "Đang dùng" : "Ngừng dùng"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setEditing(r)}>
                      <Pencil data-icon="inline-start" /> Sửa
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CategoryDialog
        initial={editing}
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        onSaved={load}
      />
    </Card>
  );
}
function CategoryDialog({
  initial,
  open,
  onOpenChange,
  onSaved,
}: {
  initial: Category | null | undefined;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const { client } = useAuthenticatedApiClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(fd: FormData) {
    setBusy(true);
    setError("");
    const data = {
      code: String(fd.get("code") ?? "").trim(),
      name: String(fd.get("name") ?? "").trim(),
      kind: String(fd.get("kind") ?? "expense"),
      default_account_code: String(fd.get("default_account_code") ?? "").trim() || null,
      is_active: String(fd.get("is_active")) === "true",
    };
    try {
      await client.data(
        initial ? `master-data/categories/${key(initial.code)}` : "master-data/categories",
        {
          method: initial ? "PATCH" : "POST",
          body: { data },
          ...(initial?.version ? { expectedVersion: initial.version } : {}),
        },
      );
      await onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể lưu danh mục.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Sửa" : "Thêm"} danh mục</DialogTitle>
          <DialogDescription>
            Danh mục active sẽ xuất hiện trên form doanh thu/chi phí.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel>Mã</FieldLabel>
              <Input
                name="code"
                defaultValue={initial?.code}
                disabled={Boolean(initial)}
                required
              />
            </Field>
            <Field>
              <FieldLabel>Tên hiển thị</FieldLabel>
              <Input name="name" defaultValue={initial?.name} required />
            </Field>
            <Field>
              <FieldLabel>Loại</FieldLabel>
              <Select name="kind" defaultValue={initial?.kind ?? "expense"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Chi phí</SelectItem>
                  <SelectItem value="revenue">Doanh thu</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Tài khoản mặc định (tuỳ chọn)</FieldLabel>
              <Input name="default_account_code" defaultValue={initial?.defaultAccountCode} />
            </Field>
            <Field>
              <FieldLabel>Trạng thái</FieldLabel>
              <Select name="is_active" defaultValue={String(initial?.isActive ?? true)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Đang dùng</SelectItem>
                  <SelectItem value="false">Ngừng dùng</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Đang lưu…" : "Lưu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
