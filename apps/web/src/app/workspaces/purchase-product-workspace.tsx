"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Power } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
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
import { createApiClient, useAuthenticatedApiClient } from "@/lib/api";

type PurchaseProduct = Readonly<{
  code: string;
  name: string;
  vatRatePercent: 8 | 10;
  isActive: boolean;
  version?: string;
}>;

function masterDataKey(code: string) {
  return btoa(JSON.stringify({ code }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function normalizeProduct(row: Record<string, unknown>): PurchaseProduct {
  return {
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    vatRatePercent: Number(row.vatRatePercent ?? row.vat_rate_percent) as 8 | 10,
    isActive: Boolean(row.isActive ?? row.is_active),
    version: String(row.version ?? row.resourceVersion ?? row.resource_version ?? "") || undefined,
  };
}

function rowsFrom(
  payload: readonly Record<string, unknown>[] | { items?: readonly Record<string, unknown>[] },
) {
  return Array.isArray(payload)
    ? payload
    : ((payload as { items?: readonly Record<string, unknown>[] }).items ?? []);
}

export function PurchaseProductWorkspace() {
  const authenticated = useAuthenticatedApiClient();
  const localApiUrl = process.env.NEXT_PUBLIC_PURCHASE_PRODUCTS_API_URL?.trim();
  const localApiToken = process.env.NEXT_PUBLIC_PURCHASE_PRODUCTS_API_TOKEN?.trim() ?? "dev-token";
  const client = useMemo(
    () =>
      localApiUrl
        ? createApiClient({
            connection: () => ({
              ...authenticated.connection,
              baseUrl: localApiUrl.replace(/\/$/, ""),
            }),
            token: () => localApiToken,
          })
        : authenticated.client,
    [authenticated.client, authenticated.connection, localApiToken, localApiUrl],
  );
  const { hydrated } = authenticated;
  const hasToken = Boolean(localApiUrl) || authenticated.hasToken;
  const [rows, setRows] = useState<readonly PurchaseProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCode, setBusyCode] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PurchaseProduct | null | undefined>();

  const load = useCallback(async () => {
    if (!hydrated) return;
    if (!hasToken) {
      setError("Cần đăng nhập hoặc API token để quản lý sản phẩm mua vào.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload = await client.data<
        readonly Record<string, unknown>[] | { items?: readonly Record<string, unknown>[] }
      >("master-data/purchase-products?limit=200");
      setRows(rowsFrom(payload).map(normalizeProduct));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải sản phẩm mua vào.");
    } finally {
      setLoading(false);
    }
  }, [client, hasToken, hydrated]);

  useEffect(() => void load(), [load]);

  async function deactivate(product: PurchaseProduct) {
    setBusyCode(product.code);
    setError("");
    try {
      await client.data(`master-data/purchase-products/${masterDataKey(product.code)}/deactivate`, {
        method: "POST",
        body: { data: {} },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể ngừng sử dụng sản phẩm.");
    } finally {
      setBusyCode("");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Danh mục sản phẩm mua vào</CardTitle>
        <CardDescription>
          Mức VAT mặc định chỉ nhận 8% hoặc 10%. Chứng từ đã ghi nhận vẫn giữ nguyên dữ liệu lịch
          sử.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setEditing(null)}>
            <Plus data-icon="inline-start" /> Thêm sản phẩm
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Không thể hoàn tất yêu cầu</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Chưa có sản phẩm mua vào</EmptyTitle>
              <EmptyDescription>Thêm sản phẩm đầu tiên và chọn VAT 8% hoặc 10%.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã sản phẩm</TableHead>
                <TableHead>Tên sản phẩm</TableHead>
                <TableHead>VAT mặc định</TableHead>
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
                    <Badge variant="outline">VAT {row.vatRatePercent}%</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.isActive ? "secondary" : "outline"}>
                      {row.isActive ? "Đang dùng" : "Ngừng dùng"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(row)}>
                        <Pencil data-icon="inline-start" /> Sửa
                      </Button>
                      {row.isActive ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyCode === row.code}
                          onClick={() => void deactivate(row)}
                        >
                          <Power data-icon="inline-start" /> Ngừng dùng
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <ProductDialog
        initial={editing}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        onSaved={load}
      />
    </Card>
  );
}

function ProductDialog({
  initial,
  open,
  onOpenChange,
  onSaved,
}: {
  initial: PurchaseProduct | null | undefined;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSaved(): Promise<void>;
}) {
  const authenticated = useAuthenticatedApiClient();
  const localApiUrl = process.env.NEXT_PUBLIC_PURCHASE_PRODUCTS_API_URL?.trim();
  const localApiToken = process.env.NEXT_PUBLIC_PURCHASE_PRODUCTS_API_TOKEN?.trim() ?? "dev-token";
  const client = useMemo(
    () =>
      localApiUrl
        ? createApiClient({
            connection: () => ({
              ...authenticated.connection,
              baseUrl: localApiUrl.replace(/\/$/, ""),
            }),
            token: () => localApiToken,
          })
        : authenticated.client,
    [authenticated.client, authenticated.connection, localApiToken, localApiUrl],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    const data = {
      code: String(formData.get("code") ?? "").trim(),
      name: String(formData.get("name") ?? "").trim(),
      vat_rate_percent: Number(formData.get("vat_rate_percent")),
      ...(initial ? {} : { is_active: true }),
    };
    setBusy(true);
    setError("");
    try {
      await client.data(
        initial
          ? `master-data/purchase-products/${masterDataKey(initial.code)}`
          : "master-data/purchase-products",
        {
          method: initial ? "PATCH" : "POST",
          body: { data },
          ...(initial?.version ? { expectedVersion: initial.version } : {}),
        },
      );
      await onSaved();
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu sản phẩm.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Sửa sản phẩm mua vào" : "Thêm sản phẩm mua vào"}</DialogTitle>
          <DialogDescription>Chọn mức VAT mặc định 8% hoặc 10%.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="purchase-product-code">Mã sản phẩm</FieldLabel>
              <Input
                id="purchase-product-code"
                name="code"
                defaultValue={initial?.code}
                disabled={Boolean(initial)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="purchase-product-name">Tên sản phẩm</FieldLabel>
              <Input id="purchase-product-name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field>
              <FieldLabel>VAT mặc định</FieldLabel>
              <Select name="vat_rate_percent" defaultValue={String(initial?.vatRatePercent ?? 8)}>
                <SelectTrigger aria-label="VAT mặc định">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="8">VAT 8%</SelectItem>
                    <SelectItem value="10">VAT 10%</SelectItem>
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
              {busy ? "Đang lưu…" : "Lưu sản phẩm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
