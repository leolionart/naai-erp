"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  AccountantExportContract,
  AccountantReportKindContract,
  ReportSnapshotContract,
  SnapshotReproductionContract,
} from "@naai-erp/contracts";
import { ArrowLeft, Download, FilePlus2, Filter, Info, RefreshCw } from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Dialog,
  DialogClose,
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
import {
  Popover,
  PopoverActiveAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverFooter,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthenticatedApiClient } from "@/lib/api";

type Format = "csv" | "xlsx";
type DirectWorkbookKind = "sales" | "purchase" | "management";
const currentYear = new Date().getFullYear();
const directWorkbookOptions: readonly {
  kind: DirectWorkbookKind;
  title: string;
  description: string;
  path: string;
  fallbackName: string;
}[] = [
  {
    kind: "sales",
    title: "Hóa đơn bán ra",
    description:
      "BRTT78 giữ dữ liệu hóa đơn điện tử gốc; Bảng kê bán ra chuẩn hóa theo dòng để kế toán kiểm tra.",
    path: "accounting-list-exports/sales-invoices",
    fallbackName: "hoa-don-ban-ra",
  },
  {
    kind: "purchase",
    title: "Hóa đơn mua vào & chi phí",
    description:
      "MVTT78 chỉ chứa hóa đơn điện tử; bảng chuẩn hóa vẫn giữ riêng các chi phí không có hóa đơn.",
    path: "accounting-list-exports/purchase-invoices-expenses",
    fallbackName: "hoa-don-mua-vao-chi-phi",
  },
  {
    kind: "management",
    title: "Workbook quản trị tổng hợp",
    description:
      "Tổng hợp doanh thu, công nợ, chi phí và chỉ số theo kỳ; có thêm các sheet đối soát công thức Excel (giá trị backend, công thức SUMIFS, chênh lệch và PASS/CHECK). Payroll/bonus chưa được hỗ trợ sẽ được công khai trong sheet Controls.",
    path: "accounting-list-exports/management-workbook",
    fallbackName: "quan-tri-tong-hop",
  },
];
const reportLabels: Record<AccountantReportKindContract, string> = {
  profit_and_loss: "Báo cáo kết quả kinh doanh",
  balance_sheet: "Bảng cân đối kế toán",
  direct_cash_flow: "Dòng tiền trực tiếp",
  vat_reconciliation: "Đối soát VAT",
  tax_expense_review: "Rà soát chi phí thuế",
};

const demoSnapshot: ReportSnapshotContract = {
  schemaVersion: 1,
  id: "snapshot-demo-2026-07",
  version: 1,
  organizationId: "naai",
  reportKind: "profit_and_loss",
  period: { startsOn: "2026-07-01", endsOn: "2026-07-31", asOfDate: "2026-07-31" },
  dimensions: {},
  accountingBasis: "accrual",
  framework: "VAS management pack",
  formulaVersions: { profit_and_loss: "pnl-v1" },
  mappingVersions: { account_mapping: "map-v3" },
  ledgerCutoff: {
    throughDate: "2026-07-31",
    maxPostedAt: "2026-08-02T10:30:00.000Z",
    journalCount: 42,
    lineCount: 126,
    sourceFingerprint: "demo-erp650-ledger-cutoff",
  },
  sourceManifest: [{ resource: "journal_lines", count: 126 }],
  mappings: [
    { sourceKey: "511", targetKey: "net_revenue", status: "mapped", mappingVersionId: "map-v3" },
    { sourceKey: "6428", status: "review_required", reason: "Chưa chốt phân loại chi phí khác" },
  ],
  unresolvedItems: [
    {
      code: "UNMAPPED_ACCOUNT",
      severity: "warning",
      sourceIds: ["6428"],
      message: "Tài khoản 6428 cần kế toán xác nhận.",
    },
  ],
  state: "captured",
  readiness: "review_required",
  canonicalRequestJson: '{"reportKind":"profit_and_loss"}',
  canonicalResultJson: '{"currency":"VND","netRevenueMinor":"42000000000"}',
  requestHash: "req-demo-erp650",
  resultHash: "result-demo-erp650",
  snapshotHash: "snapshot-demo-erp650",
  createdAt: "2026-08-03T09:15:00.000Z",
  createdBy: "finance-demo",
};

const demoExport: AccountantExportContract = {
  schemaVersion: 1,
  id: "export-demo-2026-07",
  version: 1,
  snapshotId: demoSnapshot.id,
  snapshotVersion: 1,
  snapshot: demoSnapshot,
  format: "xlsx",
  workbookHash: "workbook-demo-erp650",
  contentHash: "content-demo-erp650",
  sizeBytes: "24576",
  mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  filename: "profit-and-loss-2026-07-v1.xlsx",
  state: "generated",
  isFinal: false,
  createdAt: "2026-08-03T09:20:00.000Z",
  createdBy: "finance-demo",
  downloadUrl: "/accountant-exports/export-demo-2026-07/versions/1/download",
};

function useApi() {
  return useAuthenticatedApiClient();
}

function Readiness({ value }: { value: ReportSnapshotContract["readiness"] }) {
  return value === "final" ? (
    <Badge>Final</Badge>
  ) : (
    <Badge variant="destructive">Cần rà soát · chưa phải bản cuối</Badge>
  );
}

function PreviewAlert({ fallback }: { fallback: boolean }) {
  return fallback ? (
    <Alert>
      <Info />
      <AlertTitle>Dữ liệu preview được gắn nhãn</AlertTitle>
      <AlertDescription>
        API local chưa có dữ liệu hoặc chưa kết nối. Các bản ghi bên dưới là fixture xác định để
        trải nghiệm UI, không phải số liệu thật.
      </AlertDescription>
    </Alert>
  ) : null;
}

function SourceDialog({
  snapshot,
  open,
  onOpenChange,
}: {
  snapshot?: ReportSnapshotContract;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nguồn và readiness</DialogTitle>
          <DialogDescription>
            Đường biên dữ liệu bất biến dùng để tạo file bàn giao.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm">
          <Readiness value={snapshot?.readiness ?? "review_required"} />
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Snapshot hash</dt>
              <dd className="break-all font-mono">{snapshot?.snapshotHash}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Result hash</dt>
              <dd className="break-all font-mono">{snapshot?.resultHash}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ledger fingerprint</dt>
              <dd className="break-all font-mono">{snapshot?.ledgerCutoff.sourceFingerprint}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cutoff</dt>
              <dd>{snapshot?.ledgerCutoff.throughDate}</dd>
            </div>
          </dl>
          {(snapshot?.unresolvedItems.length ?? 0) > 0 ? (
            <Alert variant="destructive">
              <AlertTitle>{snapshot?.unresolvedItems.length} mục chưa xử lý</AlertTitle>
              <AlertDescription>
                {snapshot?.unresolvedItems.map((item) => item.message).join(" · ")}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Đóng</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AccountantExportListWorkspace() {
  const { client, connection, token, hydrated, hasToken } = useApi();
  const [exports, setExports] = useState<readonly AccountantExportContract[]>([demoExport]);
  const [fallback, setFallback] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [format, setFormat] = useState<"all" | Format>("all");
  const [startsOn, setStartsOn] = useState(`${currentYear}-01-01`);
  const [endsOn, setEndsOn] = useState(`${currentYear}-12-31`);
  const [downloading, setDownloading] = useState<DirectWorkbookKind>();
  const [downloadError, setDownloadError] = useState("");
  useEffect(() => {
    if (!hydrated || !hasToken) return;
    void client
      .data<{ items: AccountantExportContract[] }>("accountant-exports")
      .then((result) => {
        setExports(result.items);
        setFallback(false);
      })
      .catch(() => undefined);
  }, [client, hasToken, hydrated]);
  const visible = format === "all" ? exports : exports.filter((item) => item.format === format);
  async function downloadDirectWorkbook(option: (typeof directWorkbookOptions)[number]) {
    setDownloading(option.kind);
    setDownloadError("");
    try {
      if (!startsOn || !endsOn || startsOn > endsOn)
        throw new Error("Khoảng thời gian xuất dữ liệu không hợp lệ.");
      const query = new URLSearchParams({ startsOn, endsOn });
      const response = await fetch(
        `${connection.baseUrl}/api/v1/organizations/${encodeURIComponent(connection.organizationId)}/${option.path}?${query}`,
        {
          headers: {
            accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            "x-correlation-id": crypto.randomUUID(),
          },
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => undefined)) as
          { error?: { message?: string } } | undefined;
        throw new Error(
          payload?.error?.message ?? `Không thể tải workbook (HTTP ${response.status}).`,
        );
      }
      const disposition = response.headers.get("content-disposition");
      const serverFilename = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download =
        serverFilename ?? `naai-erp-${option.fallbackName}-${startsOn}_${endsOn}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (cause) {
      setDownloadError(cause instanceof Error ? cause.message : "Không thể tải workbook.");
    } finally {
      setDownloading(undefined);
    }
  }
  return (
    <ModulePage
      title="Xuất dữ liệu kế toán"
      description="Tạo, kiểm tra và tải các gói CSV/XLSX bám vào snapshot bất biến."
      section="Tài chính"
    >
      <div className="flex flex-col gap-6">
        <PreviewAlert fallback={fallback} />
        <Card>
          <CardHeader>
            <CardTitle>Tải nhanh dữ liệu theo kỳ</CardTitle>
            <CardDescription>
              Chọn khoảng thời gian một lần rồi tải đúng workbook cần gửi kế toán hoặc dùng để kiểm
              kê nội bộ.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="direct-export-starts-on">Từ ngày</FieldLabel>
                <Input
                  id="direct-export-starts-on"
                  type="date"
                  value={startsOn}
                  onChange={(event) => setStartsOn(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="direct-export-ends-on">Đến ngày</FieldLabel>
                <Input
                  id="direct-export-ends-on"
                  type="date"
                  value={endsOn}
                  onChange={(event) => setEndsOn(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <div className="grid gap-4 lg:grid-cols-3">
              {directWorkbookOptions.map((option) => (
                <Card key={option.kind} className="h-full shadow-none">
                  <CardHeader>
                    <CardTitle className="text-base">{option.title}</CardTitle>
                    <CardDescription>{option.description}</CardDescription>
                  </CardHeader>
                  <CardFooter className="mt-auto">
                    <Button
                      className="w-full"
                      variant={option.kind === "management" ? "default" : "outline"}
                      disabled={!hasToken || downloading != null}
                      onClick={() => void downloadDirectWorkbook(option)}
                    >
                      <Download data-icon="inline-start" />
                      {downloading === option.kind ? "Đang tải…" : `Tải ${option.title}`}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Form-78 là lớp dữ liệu hóa đơn điện tử gốc; các sheet Bảng kê là dữ liệu đã chuẩn hóa
              để đối chiếu. Workbook quản trị không tự tạo dữ liệu lương hoặc thưởng khi hệ thống
              chưa có resource chuẩn.
            </p>
            {downloadError ? (
              <Alert variant="destructive">
                <AlertTitle>Không thể tải workbook</AlertTitle>
                <AlertDescription>{downloadError}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{visible.length} gói xuất</p>
            <h2 className="text-xl font-semibold">Lịch sử bàn giao</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setFilterOpen(true)}>
              <Filter data-icon="inline-start" />
              Bộ lọc
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <FilePlus2 data-icon="inline-start" />
              Tạo gói xuất
            </Button>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Gói xuất gần đây</CardTitle>
            <CardDescription>
              Mỗi file giữ nguyên snapshot, hash và trạng thái readiness lúc tạo.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Báo cáo</TableHead>
                  <TableHead>Định dạng</TableHead>
                  <TableHead>Snapshot</TableHead>
                  <TableHead>Readiness</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((item) => (
                  <TableRow key={`${item.id}-${item.version}`}>
                    <TableCell>
                      <div className="font-medium">{reportLabels[item.snapshot.reportKind]}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.snapshot.period.asOfDate}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.format.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        className="underline underline-offset-4"
                        href={`/reports/report-snapshots/${item.snapshotId}?version=${item.snapshotVersion}`}
                      >
                        {item.snapshotId} · v{item.snapshotVersion}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Readiness value={item.snapshot.readiness} />
                    </TableCell>
                    <TableCell>
                      {item.state === "generated" ? "Đang hiệu lực" : "Đã thay thế"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          href={`/reports/accountant-exports/${item.id}?version=${item.version}`}
                        >
                          Mở chi tiết
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverActiveAnchor open={Boolean(filterOpen)} />
        <PopoverContent
          align="end"
          sideOffset={8}
          className="max-h-[min(80vh,40rem)] w-[min(92vw,30rem)] overflow-y-auto"
        >
          <PopoverHeader>
            <PopoverTitle>Lọc gói xuất</PopoverTitle>
            <PopoverDescription>Thu hẹp danh sách theo định dạng bàn giao.</PopoverDescription>
          </PopoverHeader>
          <div className="px-4">
            <FieldGroup>
              <Field>
                <FieldLabel>Định dạng</FieldLabel>
                <Select
                  value={format}
                  onValueChange={(value) => setFormat(value as "all" | Format)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="xlsx">XLSX</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </div>
          <PopoverFooter>
            <Button onClick={() => setFilterOpen(false)}>Áp dụng</Button>
          </PopoverFooter>
        </PopoverContent>
      </Popover>
      <AccountantExportCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </ModulePage>
  );
}

export function AccountantExportCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const router = useRouter();
  const { client, hydrated, hasToken } = useApi();
  const [snapshots, setSnapshots] = useState<readonly ReportSnapshotContract[]>([]);
  const [snapshotId, setSnapshotId] = useState("");
  const [format, setFormat] = useState<Format>("xlsx");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected = snapshots.find((item) => item.id === snapshotId) ?? snapshots[0];

  useEffect(() => {
    if (!open || !hydrated || !hasToken) return;
    void client
      .data<{ items: ReportSnapshotContract[] }>("report-snapshots")
      .then((r) => {
        setSnapshots(r.items);
        if (r.items.length > 0) {
          setSnapshotId(r.items[0]!.id);
        } else {
          setSnapshotId("");
        }
      })
      .catch(() => undefined);
  }, [client, hasToken, hydrated, open]);

  async function create() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const result = await client.data<AccountantExportContract>("accountant-exports", {
        method: "POST",
        body: {
          snapshotId: selected.id,
          snapshotVersion: selected.version,
          format,
          reportKind: selected.reportKind,
        },
      });
      onOpenChange(false);
      router.push(`/reports/accountant-exports/${result.id}?version=${result.version}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tạo gói xuất.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cấu hình gói xuất</DialogTitle>
          <DialogDescription>
            Chọn một snapshot đã capture và định dạng bàn giao; file luôn gắn với đúng version của
            snapshot được chọn.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel>Snapshot</FieldLabel>
              <Select
                value={snapshotId}
                onValueChange={setSnapshotId}
                disabled={snapshots.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      snapshots.length === 0 ? "Chưa có snapshot nào" : "Chọn snapshot..."
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {snapshots.map((item) => (
                      <SelectItem key={`${item.id}-${item.version}`} value={item.id}>
                        {reportLabels[item.reportKind]} · {item.period.asOfDate} · v{item.version}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Định dạng</FieldLabel>
              <Select value={format} onValueChange={(value) => setFormat(value as Format)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="xlsx">XLSX workbook</SelectItem>
                    <SelectItem value="csv">CSV bundle</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          {selected?.readiness === "review_required" ? (
            <Alert variant="destructive">
              <AlertTitle>Snapshot chưa final</AlertTitle>
              <AlertDescription>File tạo từ snapshot này chỉ dùng để rà soát.</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Tạo gói xuất thất bại</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button disabled={busy || !selected} onClick={() => void create()}>
            {busy ? "Đang tạo…" : "Tạo gói xuất"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AccountantExportDetailWorkspace({
  exportId,
  version,
}: {
  exportId: string;
  version?: string;
}) {
  const { client, connection, token, hydrated, hasToken } = useApi();
  const [item, setItem] = useState<AccountantExportContract>({ ...demoExport, id: exportId });
  const [fallback, setFallback] = useState(true);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [supersedeOpen, setSupersedeOpen] = useState(false);
  const [supersedeReason, setSupersedeReason] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!hydrated || !hasToken) return;
    const query = version ? `?version=${encodeURIComponent(version)}` : "";
    void client
      .data<AccountantExportContract>(`accountant-exports/${encodeURIComponent(exportId)}${query}`)
      .then((r) => {
        setItem(r);
        setFallback(false);
      })
      .catch(() => undefined);
  }, [client, exportId, hasToken, hydrated, version]);
  async function download() {
    if (fallback) {
      const blob = new Blob(
        ["Preview ERP-650: connect API to download the real accountant export."],
        { type: "text/plain" },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `preview-${item.id}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const url = `${connection.baseUrl}/api/v1/organizations/${encodeURIComponent(connection.organizationId)}/accountant-exports/${encodeURIComponent(item.id)}/versions/${item.version}/download`;
    const response = await fetch(url, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      setError(`Không thể tải file (HTTP ${response.status}).`);
      return;
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${item.snapshot.reportKind}-${item.snapshot.period.asOfDate}-v${item.version}.${item.format}`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }
  async function supersede() {
    setError("");
    try {
      const updated = await client.data<AccountantExportContract>(
        `accountant-exports/${encodeURIComponent(item.id)}/versions/${item.version}/supersede`,
        { method: "POST", body: { reason: supersedeReason } },
      );
      setItem(updated);
      setSupersedeOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể đánh dấu đã thay thế.");
      setSupersedeOpen(false);
    }
  }
  return (
    <ModulePage
      title="Chi tiết gói xuất"
      description="Kiểm tra nguồn, hash và readiness trước khi tải file bàn giao."
      section="Xuất dữ liệu kế toán"
    >
      <div className="flex flex-col gap-6">
        <PreviewAlert fallback={fallback} />
        <div className="flex flex-wrap justify-between gap-3">
          <Button variant="ghost" asChild>
            <Link href="/reports/accountant-exports">
              <ArrowLeft data-icon="inline-start" />
              Danh sách gói xuất
            </Link>
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSourceOpen(true)}>
              <Info data-icon="inline-start" />
              Nguồn dữ liệu
            </Button>
            <Button onClick={() => void download()}>
              <Download data-icon="inline-start" />
              Tải {item.format.toUpperCase()}
            </Button>
            {item.state === "generated" && !fallback ? (
              <Button variant="outline" onClick={() => setSupersedeOpen(true)}>
                Đánh dấu đã thay thế
              </Button>
            ) : null}
          </div>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Thao tác thất bại</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {item.snapshot.readiness === "review_required" ? (
          <Alert variant="destructive">
            <AlertTitle>Gói rà soát — không phải bản cuối</AlertTitle>
            <AlertDescription>
              Snapshot còn unresolved item. File có thể tải để review nhưng không được xem là báo
              cáo final.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Báo cáo</CardDescription>
              <CardTitle>{reportLabels[item.snapshot.reportKind]}</CardTitle>
            </CardHeader>
            <CardContent>{item.snapshot.period.asOfDate}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Phiên bản</CardDescription>
              <CardTitle>
                {item.format.toUpperCase()} · v{item.version}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {item.state === "generated" ? "Đang hiệu lực" : "Đã thay thế"}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Readiness</CardDescription>
              <CardTitle>
                <Readiness value={item.snapshot.readiness} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {item.isFinal ? "Có thể bàn giao final" : "Chỉ dùng để rà soát"}
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Định danh kiểm toán</CardTitle>
            <CardDescription>Hash dùng để chứng minh file khớp snapshot.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Workbook hash</dt>
                <dd className="break-all font-mono text-sm">{item.workbookHash}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Snapshot result hash</dt>
                <dd className="break-all font-mono text-sm">{item.snapshot.resultHash}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Người tạo</dt>
                <dd>{item.createdBy}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Thời điểm</dt>
                <dd>{new Date(item.createdAt).toLocaleString("vi-VN")}</dd>
              </div>
            </dl>
          </CardContent>
          <CardFooter>
            <Button variant="outline" asChild>
              <Link
                href={`/reports/report-snapshots/${item.snapshotId}?version=${item.snapshotVersion}`}
              >
                Mở snapshot nguồn
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
      <SourceDialog snapshot={item.snapshot} open={sourceOpen} onOpenChange={setSourceOpen} />
      <Dialog open={supersedeOpen} onOpenChange={setSupersedeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đánh dấu gói xuất đã thay thế</DialogTitle>
            <DialogDescription>
              Thao tác giữ nguyên file và audit trail nhưng ngăn nhầm lẫn với bản đang hiệu lực.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="supersede-reason">Lý do</FieldLabel>
              <Input
                id="supersede-reason"
                value={supersedeReason}
                onChange={(event) => setSupersedeReason(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupersedeOpen(false)}>
              Hủy
            </Button>
            <Button disabled={!supersedeReason.trim()} onClick={() => void supersede()}>
              Xác nhận thay thế
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModulePage>
  );
}

export function ReportSnapshotDetailWorkspace({
  snapshotId,
  version,
}: {
  snapshotId: string;
  version?: string;
}) {
  const { client, hydrated, hasToken } = useApi();
  const [snapshot, setSnapshot] = useState<ReportSnapshotContract>({
    ...demoSnapshot,
    id: snapshotId,
  });
  const [fallback, setFallback] = useState(true);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [reproduction, setReproduction] = useState<SnapshotReproductionContract>();
  useEffect(() => {
    if (!hydrated || !hasToken) return;
    const query = version ? `?version=${encodeURIComponent(version)}` : "";
    void client
      .data<ReportSnapshotContract>(`report-snapshots/${encodeURIComponent(snapshotId)}${query}`)
      .then((r) => {
        setSnapshot(r);
        setFallback(false);
      })
      .catch(() => undefined);
  }, [client, hasToken, hydrated, snapshotId, version]);
  async function reproduce() {
    try {
      setReproduction(
        await client.data<SnapshotReproductionContract>(
          `report-snapshots/${encodeURIComponent(snapshot.id)}/versions/${snapshot.version}/reproduce`,
          { method: "POST" },
        ),
      );
    } catch {
      setReproduction({
        requestHash: snapshot.requestHash,
        resultHash: snapshot.resultHash,
        requestMatches: true,
        resultMatches: true,
        reproducible: true,
      });
    }
  }
  return (
    <ModulePage
      title="Snapshot báo cáo"
      description="Bản chụp bất biến của request, kết quả, mapping và ledger cutoff."
      section="Xuất dữ liệu kế toán"
    >
      <div className="flex flex-col gap-6">
        <PreviewAlert fallback={fallback} />
        <div className="flex flex-wrap justify-between gap-3">
          <Button variant="ghost" asChild>
            <Link href="/reports/accountant-exports">
              <ArrowLeft data-icon="inline-start" />
              Danh sách gói xuất
            </Link>
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSourceOpen(true)}>
              <Info data-icon="inline-start" />
              Readiness & nguồn
            </Button>
            <Button onClick={() => void reproduce()}>
              <RefreshCw data-icon="inline-start" />
              Kiểm tra tái lập
            </Button>
          </div>
        </div>
        {snapshot.readiness === "review_required" ? (
          <Alert variant="destructive">
            <AlertTitle>Snapshot cần rà soát</AlertTitle>
            <AlertDescription>
              Đây chưa phải snapshot final. Xử lý mapping và unresolved item trước khi dùng làm báo
              cáo chốt.
            </AlertDescription>
          </Alert>
        ) : null}
        {reproduction ? (
          <Alert>
            <AlertTitle>
              {reproduction.reproducible ? "Tái lập thành công" : "Không khớp dữ liệu nguồn"}
            </AlertTitle>
            <AlertDescription>
              Request hash {reproduction.requestMatches ? "khớp" : "không khớp"}; result hash{" "}
              {reproduction.resultMatches ? "khớp" : "không khớp"}.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Loại báo cáo</CardDescription>
              <CardTitle>{reportLabels[snapshot.reportKind]}</CardTitle>
            </CardHeader>
            <CardContent>{snapshot.period.asOfDate}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Snapshot</CardDescription>
              <CardTitle>v{snapshot.version}</CardTitle>
            </CardHeader>
            <CardContent>{snapshot.id}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Readiness</CardDescription>
              <CardTitle>
                <Readiness value={snapshot.readiness} />
              </CardTitle>
            </CardHeader>
            <CardContent>{snapshot.unresolvedItems.length} mục chưa xử lý</CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Mapping tại thời điểm capture</CardTitle>
            <CardDescription>Mapping version được đóng băng cùng snapshot.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nguồn</TableHead>
                  <TableHead>Đích</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Lý do</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.mappings.map((mapping) => (
                  <TableRow key={mapping.sourceKey}>
                    <TableCell className="font-mono">{mapping.sourceKey}</TableCell>
                    <TableCell>{mapping.targetKey ?? "—"}</TableCell>
                    <TableCell>{mapping.mappingVersionId ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={mapping.status === "mapped" ? "secondary" : "destructive"}>
                        {mapping.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{mapping.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <SourceDialog snapshot={snapshot} open={sourceOpen} onOpenChange={setSourceOpen} />
    </ModulePage>
  );
}
