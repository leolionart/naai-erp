"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { KpiCard } from "@/components/financial/kpi-card";
import { useAuthenticatedApiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  RefreshCwIcon,
  SearchIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  FileTextIcon,
  EyeIcon,
  SaveIcon,
  DatabaseIcon,
  FileSpreadsheetIcon,
  AlertCircleIcon,
  TrendingUpIcon,
  ArrowUpRightIcon,
  ArrowLeftRightIcon,
  FolderIcon,
  SlidersIcon,
  XIcon,
  CheckIcon,
} from "lucide-react";

type ReviewStatus = "pending_review" | "approved" | "ignored" | "posted";
type MasterRow = Record<string, unknown>;
type ReviewRow = Readonly<{
  id: string;
  sourceIdentity: string;
  workbook: string;
  sheet: string;
  sourceRow: number;
  kind: string;
  proposedResourceType: string;
  proposedResourceId: string | null;
  status: ReviewStatus;
  reviewFlags: readonly string[];
  rawData: Record<string, unknown>;
  mappedData: Record<string, unknown>;
  resolution: Record<string, unknown>;
  notes: string | null;
  resourceVersion: string;
}>;

const statusLabels: Record<ReviewStatus, string> = {
  pending_review: "Cần bổ sung",
  approved: "Đã xác nhận",
  ignored: "Bỏ qua",
  posted: "Đã ghi nhận",
};

const flagLabels: Record<string, string> = {
  generic_client: "Thiếu khách hàng",
  generic_payee: "Thiếu nhà cung cấp",
  missing_project: "Thiếu dự án",
  missing_budget: "Thiếu ngân sách",
  owner_movement_requires_classification: "Cần phân loại vốn/chuyển khoản",
  zero_value: "Giá trị bằng 0",
};

const kindLabels: Record<string, string> = {
  project: "Dự án",
  sales: "Doanh thu",
  expense: "Chi phí",
  owner_movement: "Vốn / chuyển khoản",
};

const kindIcons: Record<string, LucideIcon> = {
  project: FolderIcon,
  sales: TrendingUpIcon,
  expense: ArrowUpRightIcon,
  owner_movement: ArrowLeftRightIcon,
};

const sourceFieldLabels: Record<string, string> = {
  transactionDate: "Ngày giao dịch",
  projectName: "Tên dự án",
  projectStage: "Giai đoạn",
  projectCost: "Chi phí / ngân sách",
  companyOrClient: "Khách hàng / công ty",
  projectRevenue: "Doanh thu dự án",
  gross: "Tổng tiền",
  vat: "VAT",
  vatRate: "Thuế suất VAT",
  expenseType: "Loại chi phí",
  personnel: "Nhân sự / người nhận",
  department: "Bộ phận",
  fundingSource: "Nguồn tiền",
  invoiceDate: "Ngày hóa đơn",
  invoiceFile: "File hóa đơn",
  notes: "Nội dung nguồn",
};

const fieldLabels: Record<string, string> = {
  partyId: "Khách hàng",
  clientPartyId: "Khách hàng",
  payeePartyId: "Nhà cung cấp / người nhận",
  projectId: "Dự án",
  budgetMinor: "Ngân sách",
  amountMinor: "Giá trị",
  classification: "Phân loại giao dịch",
};

function correctionFields(row: ReviewRow) {
  const keys = new Set<string>();
  for (const flag of row.reviewFlags) {
    if (flag === "generic_client") keys.add(row.kind === "project" ? "clientPartyId" : "partyId");
    if (flag === "generic_payee") keys.add("payeePartyId");
    if (flag === "missing_project") keys.add("projectId");
    if (flag === "missing_budget") keys.add("budgetMinor");
    if (flag === "owner_movement_requires_classification") keys.add("classification");
    if (flag === "zero_value") keys.add("amountMinor");
  }
  return [...keys];
}

export function ImportReviewWorkspace() {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [rows, setRows] = useState<readonly ReviewRow[]>([]);
  const [selected, setSelected] = useState<ReviewRow>();
  const [parties, setParties] = useState<readonly MasterRow[]>([]);
  const [projects, setProjects] = useState<readonly MasterRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!hydrated) return;
    if (!hasToken) {
      setError("AUTH_REQUIRED");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [result, partyPage, projectPage] = await Promise.all([
        client.data<{ items: readonly ReviewRow[] }>("workbook-imports/review-rows"),
        client.data<{ items: readonly MasterRow[] }>("master-data/parties?limit=100"),
        client.data<{ items: readonly MasterRow[] }>("master-data/projects?limit=100"),
      ]);
      setRows(result.items);
      setParties(partyPage.items);
      setProjects(projectPage.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tải dữ liệu review.");
    } finally {
      setLoading(false);
    }
  }, [client, hasToken, hydrated]);

  useEffect(() => void load(), [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (kind !== "all" && row.kind !== kind) return false;
      if (!normalized) return true;
      return [row.id, row.sheet, row.sourceRow, row.kind, ...row.reviewFlags]
        .join(" ")
        .toLocaleLowerCase("vi")
        .includes(normalized);
    });
  }, [kind, query, rows, status]);

  const pending = rows.filter((row) => row.status === "pending_review").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          title="Tổng dòng nguồn"
          period="Có record trong DB"
          value={rows.length}
          comparison={<FileSpreadsheetIcon className="h-4 w-4" aria-hidden="true" />}
        />
        <KpiCard
          title="Cần bổ sung"
          period="Chưa dùng làm dữ liệu chuẩn"
          value={pending}
          comparison={<AlertTriangleIcon className="h-4 w-4" aria-hidden="true" />}
        />
        <KpiCard
          title="Đã xử lý"
          period="Đã ghi nhận, xác nhận hoặc bỏ qua"
          value={rows.length - pending}
          comparison={<CheckCircle2Icon className="h-4 w-4" aria-hidden="true" />}
        />
      </div>

      <Card className="border-border/60 shadow-xs">
        <CardHeader className="pb-3 border-b border-border/40">
          <CardTitle className="text-lg font-semibold">Hàng đợi kiểm tra dữ liệu</CardTitle>
          <CardDescription>
            Dữ liệu nguồn được giữ nguyên; dữ liệu đề xuất có thể bổ sung trước khi áp dụng.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Tìm dữ liệu cần bổ sung"
                placeholder="Tìm theo sheet, dòng hoặc cờ review…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Lọc trạng thái">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Mọi trạng thái</SelectItem>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger aria-label="Lọc loại dữ liệu">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Mọi loại dữ liệu</SelectItem>
                  <SelectItem value="project">Dự án</SelectItem>
                  <SelectItem value="sales">Doanh thu</SelectItem>
                  <SelectItem value="expense">Chi phí</SelectItem>
                  <SelectItem value="owner_movement">Vốn / chuyển khoản</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
              className="gap-1.5"
            >
              {loading ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCwIcon className="h-4 w-4" />
              )}
              Làm mới
            </Button>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Không tải được dữ liệu</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-[200px]">Nguồn</TableHead>
                  <TableHead className="w-[180px]">Loại</TableHead>
                  <TableHead>Vấn đề cần xử lý</TableHead>
                  <TableHead className="w-[150px]">Trạng thái</TableHead>
                  <TableHead className="text-right w-[150px]">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-foreground">{row.sheet}</span>
                        <span className="text-xs text-muted-foreground">Dòng {row.sourceRow}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const KindIcon = kindIcons[row.kind] ?? FileTextIcon;
                        return (
                          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                            <KindIcon className="h-4 w-4 text-muted-foreground" />
                            <span>{kindLabels[row.kind] ?? row.kind}</span>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-xl flex-wrap gap-1">
                        {row.reviewFlags.length ? (
                          row.reviewFlags.map((flag) => (
                            <Badge key={flag} variant="destructive" className="px-1.5 py-0">
                              <AlertCircleIcon className="h-3 w-3 shrink-0" />
                              {flagLabels[flag] ?? flag}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1 text-xs">
                            <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
                            Không có vấn đề
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const styles: Record<ReviewStatus, string> = {
                          pending_review:
                            "bg-amber-500/10 text-amber-500 border-amber-500/20 dark:bg-amber-500/20",
                          approved:
                            "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 dark:bg-emerald-500/20",
                          ignored: "bg-muted text-muted-foreground border-border",
                          posted:
                            "bg-blue-500/10 text-blue-500 border-blue-500/20 dark:bg-blue-500/20",
                        };
                        return (
                          <Badge
                            variant="outline"
                            className={cn("font-medium", styles[row.status])}
                          >
                            {statusLabels[row.status]}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelected(row)}
                        className="gap-1.5"
                      >
                        <EyeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        Mở chi tiết
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!loading && filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Không có dòng dữ liệu phù hợp.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <ReviewRowEditor
        row={selected}
        parties={parties}
        projects={projects}
        open={Boolean(selected)}
        onOpenChange={(nextOpen) => !nextOpen && setSelected(undefined)}
        onSaved={(updated) => {
          setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
          setSelected(updated);
        }}
      />
    </div>
  );
}

function ReviewRowEditor({
  row,
  parties,
  projects,
  open,
  onOpenChange,
  onSaved,
}: Readonly<{
  row?: ReviewRow;
  parties: readonly MasterRow[];
  projects: readonly MasterRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: ReviewRow) => void;
}>) {
  const { client } = useAuthenticatedApiClient();
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<ReviewStatus>("pending_review");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!row) return;
    setCorrections(
      Object.fromEntries(
        correctionFields(row).map((key) => [key, String(row.mappedData[key] ?? "")]),
      ),
    );
    setNotes(row.notes ?? "");
    setStatus(row.status);
    setError("");
  }, [row]);

  async function save() {
    if (!row) return;
    setBusy(true);
    setError("");
    try {
      const updated = await client.data<ReviewRow>(`workbook-imports/review-rows/${row.id}`, {
        method: "PATCH",
        expectedVersion: row.resourceVersion,
        body: {
          mappedData: { ...row.mappedData, ...corrections },
          resolution: { ...row.resolution, correctedFields: Object.keys(corrections) },
          notes: notes.trim() || null,
          status,
        },
      });
      onSaved(updated);
      toast.success("Đã lưu dữ liệu bổ sung");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể lưu dữ liệu review.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-2xl border-l border-border/80 bg-background/95 backdrop-blur-md">
        <SheetHeader className="border-b border-border/40 pb-4">
          <SheetTitle className="text-xl font-bold flex items-center gap-2">
            <SlidersIcon className="h-5 w-5 text-primary" />
            Kiểm tra {row ? `${row.sheet} · dòng ${row.sourceRow}` : "dữ liệu"}
          </SheetTitle>
          <SheetDescription>
            Bổ sung các trường còn thiếu và ghi rõ cách xử lý. Dữ liệu nguồn luôn chỉ đọc.
          </SheetDescription>
        </SheetHeader>
        {row ? (
          <div className="flex flex-col gap-6 py-6">
            <div className="flex flex-wrap gap-1.5 px-1">
              {row.reviewFlags.map((flag) => (
                <Badge key={flag} variant="destructive" className="px-2 py-0.5">
                  <AlertCircleIcon className="h-3 w-3 shrink-0" />
                  {flagLabels[flag] ?? flag}
                </Badge>
              ))}
            </div>

            <div className="space-y-4 border-b border-border/40 pb-6 px-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <SlidersIcon className="h-4 w-4 text-primary" />
                <span>Thông tin sửa đổi</span>
              </div>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="review-status">Trạng thái review</FieldLabel>
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as ReviewStatus)}
                  >
                    <SelectTrigger id="review-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {Object.entries(statusLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {correctionFields(row).map((key) => (
                  <Field key={key}>
                    <FieldLabel htmlFor={`review-${key}`}>{fieldLabels[key] ?? key}</FieldLabel>
                    <CorrectionControl
                      field={key}
                      value={corrections[key] ?? ""}
                      parties={parties}
                      projects={projects}
                      onChange={(value) =>
                        setCorrections((current) => ({ ...current, [key]: value }))
                      }
                    />
                    <FieldDescription>
                      Thay placeholder trong dữ liệu đề xuất; chưa tự tạo hoặc sửa bút toán.
                    </FieldDescription>
                  </Field>
                ))}
                <Field>
                  <FieldLabel htmlFor="review-notes">Ghi chú</FieldLabel>
                  <Textarea
                    id="review-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Nhập ghi chú hoặc lý do bổ sung thông tin..."
                    className="min-h-[80px]"
                  />
                </Field>
              </FieldGroup>
            </div>

            <div className="space-y-4 px-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <DatabaseIcon className="h-4 w-4 text-primary" />
                <span>Dữ liệu nguồn (Chỉ đọc)</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {Object.entries(row.rawData).map(([key, value]) => (
                  <Card key={key} className="bg-muted/40 border-muted/50">
                    <CardHeader className="p-3 gap-1.5">
                      <CardDescription className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                        <span>{sourceFieldLabels[key] ?? key}</span>
                        <span className="font-mono uppercase text-[9px] tracking-wider bg-muted-foreground/10 px-1 py-0.5 rounded-sm">
                          {key}
                        </span>
                      </CardDescription>
                      <CardTitle className="text-sm font-semibold text-foreground tabular-nums">
                        {String(value || "—")}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Không lưu được</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}
        <SheetFooter className="border-t border-border/40 pt-4 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="gap-1">
            <XIcon className="h-4 w-4" />
            Đóng
          </Button>
          <Button onClick={() => void save()} disabled={!row || busy} className="gap-1.5">
            {busy ? <Spinner data-icon="inline-start" /> : <SaveIcon className="h-4 w-4" />}
            Lưu thay đổi
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function CorrectionControl({
  field,
  value,
  parties,
  projects,
  onChange,
}: Readonly<{
  field: string;
  value: string;
  parties: readonly MasterRow[];
  projects: readonly MasterRow[];
  onChange: (value: string) => void;
}>) {
  const partyField = ["partyId", "clientPartyId", "payeePartyId"].includes(field);
  if (partyField || field === "projectId") {
    const options = partyField ? parties : projects;
    return (
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={`review-${field}`}>
          <SelectValue placeholder={partyField ? "Chọn đối tác" : "Chọn dự án"} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => {
              const id = String(option.id ?? "");
              const label = String(option.display_name ?? option.name ?? id);
              return (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }
  return (
    <Input
      id={`review-${field}`}
      inputMode={["budgetMinor", "amountMinor"].includes(field) ? "numeric" : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
