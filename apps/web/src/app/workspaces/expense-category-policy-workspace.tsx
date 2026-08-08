"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthenticatedApiClient } from "@/lib/api";

type Policy = Readonly<{
  code: string;
  name: string;
  isActive: boolean;
  fundingTreatment: "company_funds" | "owner_paid_company_cost" | "tax_only_non_cash";
  version?: string;
}>;

const FUNDING_TREATMENTS = [
  { value: "company_funds", label: "Tiền công ty" },
  { value: "owner_paid_company_cost", label: "Chủ doanh nghiệp chi hộ chi phí thực" },
  { value: "tax_only_non_cash", label: "Chỉ theo dõi thuế, không trừ quỹ" },
] as const;

function masterDataKey(code: string) {
  return btoa(JSON.stringify({ code }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function normalizePolicy(row: Record<string, unknown>): Policy {
  return {
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    isActive: Boolean(row.isActive ?? row.is_active),
    fundingTreatment: String(
      row.fundingTreatment ?? row.funding_treatment,
    ) as Policy["fundingTreatment"],
    version: String(row.version ?? row.resourceVersion ?? row.resource_version ?? "") || undefined,
  };
}

function rowsFrom(payload: readonly Policy[] | { items?: readonly Policy[] }) {
  return Array.isArray(payload)
    ? (payload as readonly Policy[])
    : ((payload as { items?: readonly Policy[] }).items ?? []);
}

export function ExpenseCategoryPolicyWorkspace() {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [rows, setRows] = useState<readonly Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Policy | null | undefined>();

  const load = useCallback(async () => {
    if (!hydrated) return;
    if (!hasToken) {
      setError("Cần API token để quản lý chính sách danh mục chi phí.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload = await client.data<readonly Policy[] | { items?: readonly Policy[] }>(
        "master-data/expense-categories?limit=200",
      );
      setRows(
        rowsFrom(payload).map((row) => normalizePolicy(row as unknown as Record<string, unknown>)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải chính sách danh mục.");
    } finally {
      setLoading(false);
    }
  }, [client, hasToken, hydrated]);

  useEffect(() => void load(), [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chính sách danh mục chi phí</CardTitle>
        <CardDescription>
          Cấu hình nguồn tiền mặc định cho từng danh mục. Từng giao dịch vẫn có thể chọn lại nguồn
          thanh toán.
        </CardDescription>
        <Button size="sm" className="w-fit" onClick={() => setEditing(null)}>
          <Plus data-icon="inline-start" /> Thêm chính sách
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Không thể tải cấu hình</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã danh mục</TableHead>
                <TableHead>Tên hiển thị</TableHead>
                <TableHead>Cách xử lý nguồn tiền</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.code}>
                  <TableCell className="font-mono">{row.code}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>
                    {FUNDING_TREATMENTS.find((item) => item.value === row.fundingTreatment)
                      ?.label ?? row.fundingTreatment}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.isActive ? "secondary" : "outline"}>
                      {row.isActive ? "Đang dùng" : "Ngừng dùng"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditing(row)}>
                      <Pencil data-icon="inline-start" /> Sửa
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <PolicyDialog
        initial={editing}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        onSaved={load}
      />
    </Card>
  );
}

function PolicyDialog({
  initial,
  open,
  onOpenChange,
  onSaved,
}: {
  initial: Policy | null | undefined;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSaved(): Promise<void>;
}) {
  const { client } = useAuthenticatedApiClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(formData: FormData) {
    const data = {
      code: String(formData.get("code") ?? "").trim(),
      name: String(formData.get("name") ?? "").trim(),
      is_active: String(formData.get("is_active")) === "true",
      funding_treatment: String(formData.get("funding_treatment") ?? "company_funds"),
    };
    setBusy(true);
    setError("");
    try {
      await client.data(
        initial
          ? `master-data/expense-categories/${masterDataKey(initial.code)}`
          : "master-data/expense-categories",
        {
          method: initial ? "PATCH" : "POST",
          body: { data },
          ...(initial?.version ? { expectedVersion: initial.version } : {}),
        },
      );
      await onSaved();
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu chính sách.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Sửa" : "Thêm"} chính sách danh mục</DialogTitle>
          <DialogDescription>Cấu hình áp dụng cho bản ghi chi phí tạo mới.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="policy-category-code">code</FieldLabel>
              <Input
                id="policy-category-code"
                name="code"
                defaultValue={initial?.code}
                disabled={Boolean(initial)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="policy-display-name">name</FieldLabel>
              <Input id="policy-display-name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field>
              <FieldLabel>funding_treatment</FieldLabel>
              <Select
                name="funding_treatment"
                defaultValue={initial?.fundingTreatment ?? "company_funds"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {FUNDING_TREATMENTS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>is_active</FieldLabel>
              <Select name="is_active" defaultValue={String(initial?.isActive ?? true)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="true">Đang dùng</SelectItem>
                    <SelectItem value="false">Ngừng dùng</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
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
              {busy ? "Đang lưu…" : "Lưu chính sách"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
