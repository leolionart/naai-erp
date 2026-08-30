"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileSpreadsheet,
  Trash2,
  Upload,
} from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthenticatedApiClient } from "@/lib/api";

type SheetInventory = Readonly<{
  resourceType: string;
  sheetName?: string;
  excluded: boolean;
  exclusionReason?: string;
  rowCount: number;
  mutability: string;
}>;
type RowResult = Readonly<{
  sheetName: string;
  resourceType: string;
  rowNumber: number;
  stableId?: string;
  operation: string;
  disposition: "ready" | "invalid" | "conflict" | "unchanged";
  issues: readonly Readonly<{ code: string; message: string; field?: string; severity: string }>[];
}>;
type ImportRecord = Readonly<{
  importId: string;
  packageId: string;
  state: string;
  workbookSha256: string;
  inventory?: Readonly<{
    valid: boolean;
    issues: readonly Readonly<{ code: string; message: string }>[];
    sheets: readonly SheetInventory[];
  }>;
  dryRunId?: string;
  dryRun?: Readonly<{
    valid: boolean;
    mutationCount: number;
    totals: Readonly<{
      sheets: number;
      rows: number;
      ready: number;
      invalid: number;
      conflicts: number;
      unchanged: number;
    }>;
    sheetInventory: readonly SheetInventory[];
    rows: readonly RowResult[];
  }>;
  commitResult?: Readonly<{
    committed: boolean;
    applied: number;
    unchanged: number;
    failed: number;
  }>;
}>;
type ExportRecord = Readonly<{
  packageId: string;
  filename: string;
  sizeBytes: number;
  contentHash: string;
  manifest: Readonly<{
    totalSheetCount: number;
    totalRowCount: number;
    sheets: readonly SheetInventory[];
  }>;
}>;
type BackupHistoryRecord = Readonly<{
  packageId: string;
  filename: string;
  asOf: string;
  generatedAt: string;
  sizeBytes: number;
  contentHash: string;
  contentPrunedAt?: string;
}>;

const today = () => new Date().toISOString().slice(0, 10);

export function PortableDataPackageWorkspace() {
  const { client, connection, token, hydrated, hasToken } = useAuthenticatedApiClient();
  const [asOf, setAsOf] = useState(today);
  const [file, setFile] = useState<File>();
  const [exported, setExported] = useState<ExportRecord>();
  const [history, setHistory] = useState<readonly BackupHistoryRecord[]>([]);
  const [imported, setImported] = useState<ImportRecord>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BackupHistoryRecord>();

  const root = `${connection.baseUrl}/api/v1/organizations/${encodeURIComponent(connection.organizationId)}/portable-data-packages`;
  const authHeaders = useMemo(
    () => ({ authorization: `Bearer ${token}`, "x-correlation-id": crypto.randomUUID() }),
    [token],
  );

  useEffect(() => {
    if (!hydrated || !hasToken) return;
    void client
      .data<readonly BackupHistoryRecord[]>("portable-data-packages/exports?limit=20")
      .then(setHistory)
      .catch(() => undefined);
  }, [client, hasToken, hydrated, exported]);

  async function jsonFetch<T>(path: string, init: RequestInit) {
    const response = await fetch(`${root}/${path}`, init);
    const payload = (await response.json()) as { data?: T; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
    return (payload.data ?? payload) as T;
  }

  async function createExport() {
    setBusy("export");
    setError("");
    try {
      setExported(
        await client.data<ExportRecord>("portable-data-packages/exports", {
          method: "POST",
          body: { asOf, format: "xlsx" },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  async function downloadExport() {
    if (!exported) return;
    setBusy("download");
    setError("");
    try {
      const response = await fetch(
        `${root}/exports/${encodeURIComponent(exported.packageId)}/download`,
        { headers: authHeaders },
      );
      if (!response.ok) throw new Error(`Không thể tải file: HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exported.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  async function downloadPackage(item: BackupHistoryRecord) {
    setBusy("download");
    try {
      const response = await fetch(
        `${root}/exports/${encodeURIComponent(item.packageId)}/download`,
        {
          headers: authHeaders,
        },
      );
      if (!response.ok) throw new Error(`Không thể tải file: HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = item.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  async function deletePackage(item: BackupHistoryRecord) {
    setBusy("delete");
    try {
      await jsonFetch(`exports/${encodeURIComponent(item.packageId)}`, {
        method: "DELETE",
        headers: { ...authHeaders, "idempotency-key": crypto.randomUUID() },
      });
      setHistory((items) => items.filter((entry) => entry.packageId !== item.packageId));
      setDeleteTarget(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  async function upload(action: "inventory" | "dry-run") {
    if (!file) return;
    setBusy(action);
    setError("");
    try {
      const form = new FormData();
      form.set("workbook", file);
      setImported(
        await jsonFetch<ImportRecord>(`imports/${action}`, {
          method: "POST",
          headers: { ...authHeaders, "idempotency-key": crypto.randomUUID() },
          body: form,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  async function commit() {
    if (!imported?.dryRunId) return;
    setConfirmOpen(false);
    setBusy("commit");
    setError("");
    try {
      setImported(
        await jsonFetch<ImportRecord>(`imports/${encodeURIComponent(imported.importId)}/commit`, {
          method: "POST",
          headers: {
            ...authHeaders,
            "content-type": "application/json",
            "idempotency-key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            dryRunId: imported.dryRunId,
            workbookSha256: imported.workbookSha256,
          }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }

  const dryRun = imported?.dryRun;
  const canCommit = Boolean(dryRun?.valid && dryRun.mutationCount === 0 && imported?.dryRunId);
  return (
    <ModulePage
      title="Sao lưu & chỉnh sửa toàn bộ dữ liệu ERP"
      description="Xuất một gói XLSX đầy đủ, chỉnh sửa có kiểm soát, kiểm tra trước rồi mới nhập lại."
      section="Dữ liệu & Cấu hình"
    >
      <div className="flex flex-col gap-6">
        <Alert>
          <DatabaseBackup />
          <AlertTitle>Đây là Full ERP Data Package, không phải Accountant Export</AlertTitle>
          <AlertDescription>
            Gói này chứa inventory các tài nguyên ERP, stable ID, quan hệ và version để round-trip.{" "}
            <Link className="underline underline-offset-4" href="/reports/accountant-exports">
              Accountant Export
            </Link>{" "}
            chỉ là snapshot báo cáo để bàn giao kế toán và không dùng để khôi phục dữ liệu.
          </AlertDescription>
        </Alert>
        {!hydrated || !hasToken ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Chưa kết nối API</AlertTitle>
            <AlertDescription>
              Hãy cấu hình organization và API token trước khi export hoặc import.
            </AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Không thể hoàn tất thao tác</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>1. Export toàn bộ dữ liệu</CardTitle>
              <CardDescription>
                Tạo workbook versioned tại ngày cutoff, kèm manifest và checksum.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="portable-as-of">Ngày cutoff</FieldLabel>
                  <Input
                    id="portable-as-of"
                    type="date"
                    value={asOf}
                    onChange={(event) => setAsOf(event.target.value)}
                  />
                  <FieldDescription>Dữ liệu sau ngày này không nằm trong package.</FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Button disabled={!hasToken || busy !== ""} onClick={createExport}>
                {busy === "export" ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <FileSpreadsheet data-icon="inline-start" />
                )}
                Tạo Full ERP Package
              </Button>
              {exported ? (
                <Button variant="outline" disabled={busy !== ""} onClick={downloadExport}>
                  {busy === "download" ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Download data-icon="inline-start" />
                  )}
                  Tải XLSX
                </Button>
              ) : null}
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>2. Upload workbook đã chỉnh sửa</CardTitle>
              <CardDescription>Inventory và dry-run không thay đổi dữ liệu ERP.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="portable-file">Workbook XLSX</FieldLabel>
                  <Input
                    id="portable-file"
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => {
                      setFile(event.target.files?.[0]);
                      setImported(undefined);
                    }}
                  />
                  <FieldDescription>Không upload Accountant Export tại đây.</FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!file || busy !== ""}
                onClick={() => upload("inventory")}
              >
                <Upload data-icon="inline-start" />
                Kiểm kê file
              </Button>
              <Button disabled={!file || busy !== ""} onClick={() => upload("dry-run")}>
                {busy === "dry-run" ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <CheckCircle2 data-icon="inline-start" />
                )}
                Dry-run
              </Button>
            </CardFooter>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Lịch sử sao lưu</CardTitle>
              <CardDescription>
                Các package gần nhất của organization này. Package còn nội dung có thể tải lại để
                khôi phục; metadata và checksum vẫn được giữ khi file đã được dọn theo retention.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày dữ liệu</TableHead>
                    <TableHead>Tạo lúc</TableHead>
                    <TableHead>Kích thước</TableHead>
                    <TableHead>Checksum</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.length ? (
                    history.map((item) => (
                      <TableRow key={item.packageId}>
                        <TableCell>{item.asOf}</TableCell>
                        <TableCell>{new Date(item.generatedAt).toLocaleString("vi-VN")}</TableCell>
                        <TableCell>{Math.ceil(item.sizeBytes / 1024)} KB</TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.contentHash.slice(0, 12)}…
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.contentPrunedAt ? "outline" : "default"}>
                            {item.contentPrunedAt ? "Đã dọn file" : "Có thể tải"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={Boolean(item.contentPrunedAt) || busy !== ""}
                            onClick={() => void downloadPackage(item)}
                          >
                            <Download data-icon="inline-start" /> Tải lại
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy !== ""}
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 data-icon="inline-start" /> Xoá
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Chưa có lịch sử sao lưu.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {exported ? (
          <InventoryCard
            title="Inventory package vừa export"
            inventory={exported.manifest.sheets}
            summary={`${exported.manifest.totalSheetCount} sheets · ${exported.manifest.totalRowCount} rows`}
          />
        ) : null}
        {dryRun ? (
          <>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>3. Kết quả dry-run</CardTitle>
                    <CardDescription>
                      Không có mutation nào được thực hiện trong bước này.
                    </CardDescription>
                  </div>
                  <Badge variant={dryRun.valid ? "default" : "destructive"}>
                    {dryRun.valid ? "Sẵn sàng commit" : "Cần sửa file"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {Object.entries(dryRun.totals).map(([key, value]) => (
                    <div key={key} className="rounded-lg border p-3">
                      <div className="text-xs text-muted-foreground">{key}</div>
                      <div className="text-lg font-semibold">{value}</div>
                    </div>
                  ))}
                </div>
                <RowResults rows={dryRun.rows} />
              </CardContent>
              <CardFooter>
                <Button disabled={!canCommit || busy !== ""} onClick={() => setConfirmOpen(true)}>
                  Xác nhận commit các thay đổi hợp lệ
                </Button>
              </CardFooter>
            </Card>
          </>
        ) : imported ? (
          <InventoryCard
            title="Inventory workbook upload"
            inventory={imported.inventory?.sheets ?? []}
            summary={`Import ${imported.importId} · ${imported.state}${imported.inventory ? ` · ${imported.inventory.valid ? "hợp lệ" : `${imported.inventory.issues.length} lỗi`}` : ""}`}
          />
        ) : null}
        {imported?.commitResult ? (
          <Alert variant={imported.commitResult.committed ? "default" : "destructive"}>
            <CheckCircle2 />
            <AlertTitle>
              {imported.commitResult.committed ? "Commit hoàn tất" : "Commit có dòng thất bại"}
            </AlertTitle>
            <AlertDescription>
              Applied {imported.commitResult.applied}, unchanged {imported.commitResult.unchanged},
              failed {imported.commitResult.failed}.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Commit thay đổi vào ERP?</AlertDialogTitle>
            <AlertDialogDescription>
              Hệ thống sẽ dùng đúng dry-run ID và checksum workbook này. Dữ liệu posted/issued chỉ
              được sửa qua cancel hoặc reverse & replace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Quay lại kiểm tra</AlertDialogCancel>
            <AlertDialogAction onClick={commit}>Commit có kiểm soát</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá bản sao lưu?</AlertDialogTitle>
            <AlertDialogDescription>
              Bản sao lưu này sẽ bị xoá khỏi lịch sử và không thể dùng để khôi phục nữa.
              {deleteTarget ? ` Package: ${deleteTarget.packageId}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && void deletePackage(deleteTarget)}>
              Xoá bản sao lưu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ModulePage>
  );
}

function InventoryCard({
  title,
  inventory,
  summary,
}: {
  title: string;
  inventory: readonly SheetInventory[];
  summary: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{summary}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tài nguyên</TableHead>
              <TableHead>Sheet</TableHead>
              <TableHead>Rows</TableHead>
              <TableHead>Mutability</TableHead>
              <TableHead>Phạm vi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inventory.map((item) => (
              <TableRow key={item.resourceType}>
                <TableCell className="font-medium">{item.resourceType}</TableCell>
                <TableCell>{item.sheetName ?? "—"}</TableCell>
                <TableCell>{item.rowCount}</TableCell>
                <TableCell>
                  <Badge variant="outline">{item.mutability}</Badge>
                </TableCell>
                <TableCell>{item.excluded ? item.exclusionReason : "Included"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RowResults({ rows }: { rows: readonly RowResult[] }) {
  const visible = rows.filter((row) => row.disposition !== "unchanged" || row.issues.length > 0);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sheet / row</TableHead>
            <TableHead>Operation</TableHead>
            <TableHead>Diff status</TableHead>
            <TableHead>Lỗi / cảnh báo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length ? (
            visible.map((row) => (
              <TableRow key={`${row.sheetName}-${row.rowNumber}`}>
                <TableCell>
                  <div className="font-medium">
                    {row.sheetName} · {row.rowNumber}
                  </div>
                  <div className="text-xs text-muted-foreground">{row.stableId ?? "new row"}</div>
                </TableCell>
                <TableCell>{row.operation}</TableCell>
                <TableCell>
                  <Badge variant={row.disposition === "ready" ? "default" : "destructive"}>
                    {row.disposition}
                  </Badge>
                </TableCell>
                <TableCell>
                  {row.issues.length
                    ? row.issues.map((item) => (
                        <div key={`${item.code}-${item.field ?? ""}`}>
                          <span className="font-medium">{item.code}</span>: {item.message}
                        </div>
                      ))
                    : "Thay đổi hợp lệ"}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Không có thay đổi hoặc lỗi cần hiển thị.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
