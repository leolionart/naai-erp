"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, ExternalLink, Eye, Filter, Plus } from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { QuickDatePresetButtons } from "@/components/ui/quick-date-range-picker";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  DocumentForm,
  ExpenseForm,
  getCategoryName,
} from "@/components/forms/document-expense-forms";
import {
  MonthlyCategoryStackedChart,
  type StackedCategoryPoint,
} from "@/components/dashboard/monthly-category-stacked-chart";
import { PeriodRangeNavigator } from "@/components/layout/period-range-navigator";

type Kind = "documents" | "expenses";
type SourceKind = "documents" | "expenses" | "recognition";
type Row = Record<string, unknown>;
type TaggedRow = Row & {
  __sourceKind: SourceKind;
  __invoicePresence: "present" | "missing";
  __revenueAxis?: "invoiced" | "recognized";
};
const config = {
  documents: {
    endpoint: "commercial-documents",
    singular: "hoạt động doanh thu",
    title: "Quản lý doanh thu",
    newTitle: "Tạo hóa đơn",
    detailTitle: "Chi tiết hóa đơn",
  },
  expenses: {
    endpoint: "expenses",
    singular: "hoạt động chi phí",
    title: "Quản lý chi phí",
    newTitle: "Tạo chi phí",
    detailTitle: "Chi tiết chi phí",
  },
} as const;
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

function text(row: Row | undefined, ...keys: string[]) {
  for (const key of keys) {
    const snake = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const value = row?.[key] ?? row?.[snake];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}
function money(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  try {
    const cleanStr = String(value).replace(/[^0-9-]/g, "");
    if (!cleanStr) return `${value} ₫`;
    return `${new Intl.NumberFormat("vi-VN").format(BigInt(cleanStr))} ₫`;
  } catch {
    return `${value} ₫`;
  }
}
function human(value: string) {
  return value ? value.replaceAll("_", " ") : "—";
}
function sourceKind(row: Row | undefined): SourceKind {
  const value = row?.__sourceKind;
  return value === "expenses" || value === "recognition" ? value : "documents";
}
function sourceEndpoint(source: SourceKind) {
  if (source === "expenses") return "expenses";
  if (source === "recognition") return "revenue-recognition-events";
  return "commercial-documents";
}
function tagRow(
  row: Row,
  source: SourceKind,
  presence: "present" | "missing",
  revenueAxis?: "invoiced" | "recognized",
): TaggedRow {
  return { ...row, __sourceKind: source, __invoicePresence: presence, __revenueAxis: revenueAxis };
}

function queryFor(kind: Kind, params: URLSearchParams) {
  const query = new URLSearchParams();
  for (const key of kind === "documents"
    ? ["type", "state", "partyId", "projectId", "startsOn", "endsOn"]
    : ["state", "class", "payeePartyId", "startsOn", "endsOn"]) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  return query;
}

export function FocusedRecordListWorkspace({
  kind,
  initialProjectId,
  initialPartyId,
}: {
  kind: Kind;
  initialProjectId?: string;
  initialPartyId?: string;
}) {
  const { client, connection, token, hasToken, hydrated } = useAuthenticatedApiClient();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [parties, setParties] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(false);
  const [quickRecord, setQuickRecord] = useState<Row>();
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const key = params.toString();
  const invoiceStatus = params.get("invoiceStatus") ?? "all";
  const current = config[kind];
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
      const sourceParams = new URLSearchParams(key);
      if (initialProjectId || initialPartyId) {
        sourceParams.delete("startsOn");
        sourceParams.delete("endsOn");
      }
      if (initialProjectId && !sourceParams.has("projectId")) {
        sourceParams.set("projectId", initialProjectId);
      }
      if (initialPartyId && !sourceParams.has("partyId")) {
        sourceParams.set("partyId", initialPartyId);
      }
      const includePresent = invoiceStatus !== "missing";
      const includeMissing = invoiceStatus !== "present";
      const documentParams = new URLSearchParams(sourceParams);
      if (kind === "expenses") documentParams.set("type", "purchase_invoice");
      else if (!new Set(["sales_invoice", "credit_note"]).has(documentParams.get("type") ?? ""))
        documentParams.delete("type");
      const recognitionQuery = new URLSearchParams();
      for (const name of ["projectId", "state"]) {
        const value = sourceParams.get(name);
        if (value) recognitionQuery.set(name, value);
      }
      const [documentsResult, expensesResult, recognitionResult, partiesRes] = await Promise.all([
        includePresent
          ? client.data<{ items?: Row[] } | Row[]>(
              `commercial-documents?${queryFor("documents", documentParams)}`,
            )
          : Promise.resolve([] as Row[]),
        kind === "expenses" && includeMissing
          ? client.data<{ items?: Row[] } | Row[]>(`expenses?${queryFor("expenses", sourceParams)}`)
          : Promise.resolve([] as Row[]),
        kind === "documents" && includeMissing
          ? client.data<{ items?: Row[] } | Row[]>(`revenue-recognition-events?${recognitionQuery}`)
          : Promise.resolve([] as Row[]),
        client.data<{ items?: Row[] } | Row[]>("master-data/parties?limit=500").catch(() => []),
      ]);
      const listedDocuments = (
        Array.isArray(documentsResult) ? documentsResult : (documentsResult.items ?? [])
      ).filter((row) =>
        kind === "expenses"
          ? text(row, "type") === "purchase_invoice"
          : ["sales_invoice", "credit_note"].includes(text(row, "type")),
      );
      const listedExpenses = Array.isArray(expensesResult)
        ? expensesResult
        : (expensesResult.items ?? []);
      const listedRecognitions = Array.isArray(recognitionResult)
        ? recognitionResult
        : (recognitionResult.items ?? []);
      let rawItems: TaggedRow[] = [
        ...listedDocuments.map((row) => tagRow(row, "documents", "present", "invoiced")),
        ...listedExpenses.map((row) => tagRow(row, "expenses", "missing")),
        ...listedRecognitions.map((row) => tagRow(row, "recognition", "missing", "recognized")),
      ];

      const startsOn = sourceParams.get("startsOn");
      const endsOn = sourceParams.get("endsOn");
      // Do not filter out raw records by time when explicitly looking at a specific Project or Customer profile
      if ((startsOn || endsOn) && !initialProjectId && !initialPartyId) {
        rawItems = rawItems.filter((row) => {
          const dateVal = text(row, "documentDate", "expenseDate", "issueDate", "createdAt");
          if (!dateVal) return true;
          if (startsOn && dateVal < startsOn) return false;
          if (endsOn && dateVal > endsOn) return false;
          return true;
        });
      }
      // Commercial documents are already filtered canonically by the API, including
      // project links stored on allocations that are intentionally omitted from list rows.
      if (initialProjectId) {
        rawItems = rawItems.filter(
          (row) =>
            String(row.projectId ?? row.project_id ?? "").trim() === initialProjectId.trim() ||
            (Array.isArray(row.lines) &&
              (row.lines as Row[]).some((l) => {
                const dims = (l.dimensions as Record<string, unknown> | undefined) ?? {};
                return (
                  String(
                    l.projectId ?? l.project_id ?? dims.projectId ?? dims.project_id ?? "",
                  ).trim() === initialProjectId.trim()
                );
              })),
        );
      }
      if (initialPartyId) {
        rawItems = rawItems.filter(
          (row) =>
            String(
              row.partyId ?? row.party_id ?? row.payeePartyId ?? row.payee_party_id ?? "",
            ).trim() === initialPartyId.trim(),
        );
      }
      rawItems.sort((left, right) =>
        text(right, "documentDate", "expenseDate", "effectiveOn", "createdAt").localeCompare(
          text(left, "documentDate", "expenseDate", "effectiveOn", "createdAt"),
        ),
      );
      setRows(rawItems);
      setParties(Array.isArray(partiesRes) ? partiesRes : (partiesRes.items ?? []));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Không thể tải ${current.singular}.`);
    } finally {
      setLoading(false);
    }
  }, [
    client,
    current,
    hasToken,
    hydrated,
    initialPartyId,
    initialProjectId,
    invoiceStatus,
    key,
    kind,
  ]);
  useEffect(() => void load(), [load]);
  function apply(form: FormData) {
    const query = new URLSearchParams();
    for (const name of kind === "documents"
      ? ["invoiceStatus", "type", "state", "partyId", "projectId", "startsOn", "endsOn"]
      : ["invoiceStatus", "class", "state", "payeePartyId", "startsOn", "endsOn"]) {
      const value = String(form.get(name) ?? "").trim();
      if (value && value !== "all") query.set(name, value);
    }
    router.replace(`${pathname}?${query}`);
    setFilters(false);
  }
  async function exportWorkbook() {
    setExporting(true);
    setExportError("");
    try {
      const currentParams = new URLSearchParams(key);
      const query = new URLSearchParams();
      for (const name of ["startsOn", "endsOn", "state", "projectId"]) {
        const value = currentParams.get(name);
        if (value) query.set(name, value);
      }
      const partyKey = kind === "documents" ? "partyId" : "payeePartyId";
      const partyValue = currentParams.get(partyKey);
      if (partyValue) query.set(partyKey, partyValue);
      const presence = currentParams.get("invoiceStatus");
      if (presence && presence !== "all") query.set("invoicePresence", presence);
      if (initialProjectId && !query.has("projectId")) query.set("projectId", initialProjectId);
      if (initialPartyId) {
        if (!query.has(partyKey)) query.set(partyKey, initialPartyId);
      }
      const exportPath =
        kind === "documents"
          ? "accounting-list-exports/sales-invoices"
          : "accounting-list-exports/purchase-invoices-expenses";
      const response = await fetch(
        `${connection.baseUrl}/api/v1/organizations/${encodeURIComponent(connection.organizationId)}/${exportPath}?${query}`,
        {
          headers: {
            accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            authorization: `Bearer ${token}`,
            "x-correlation-id": crypto.randomUUID(),
          },
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => undefined)) as
          { error?: { message?: string } } | undefined;
        throw new Error(
          payload?.error?.message ?? `Không thể export XLSX (HTTP ${response.status}).`,
        );
      }
      const disposition = response.headers.get("content-disposition");
      const serverFilename = disposition?.match(/filename="?([^";]+)"?/i)?.[1];
      const range = [query.get("startsOn"), query.get("endsOn")].filter(Boolean).join("_");
      const fallbackFilename = `naai-erp-${kind === "documents" ? "doanh-thu" : "chi-phi"}${range ? `-${range}` : ""}.xlsx`;
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = serverFilename ?? fallbackFilename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "Không thể export workbook.");
    } finally {
      setExporting(false);
    }
  }
  async function openQuickView(row: Row) {
    const id = text(row, "id");
    setQuickRecord(row);
    setQuickLoading(true);
    try {
      const source = sourceKind(row);
      setQuickRecord({
        ...(await client.data<Row>(`${sourceEndpoint(source)}/${encodeURIComponent(id)}`)),
        __sourceKind: source,
        __invoicePresence: row.__invoicePresence,
        __revenueAxis: row.__revenueAxis,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Không thể tải ${current.singular}.`);
    } finally {
      setQuickLoading(false);
    }
  }
  async function updateQuickRecord(body: Row) {
    if (!quickRecord) return;
    const id = text(quickRecord, "id");
    setQuickBusy(true);
    setError("");
    try {
      const source = sourceKind(quickRecord);
      if (source === "recognition") return;
      const updated = await client.data<Row>(
        `${sourceEndpoint(source)}/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          expectedVersion: text(quickRecord, "resourceVersion", "version"),
          body,
        },
      );
      setQuickRecord({ ...quickRecord, ...body, ...updated });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Không thể sửa ${current.singular}.`);
    } finally {
      setQuickBusy(false);
    }
  }
  const stackedPoints = useCallback((): readonly StackedCategoryPoint[] => {
    const monthlyMap = new Map<string, Map<string, bigint>>();
    for (const row of rows) {
      const rowSource = sourceKind(row);
      const dateStr = text(row, "documentDate", "expenseDate", "issueDate", "createdAt");
      const monthKey = dateStr && /^\d{4}-\d{2}/.test(dateStr) ? dateStr.substring(0, 7) : "Khác";

      let groupName = "";
      const linesArray = Array.isArray(row.lines) ? (row.lines as Record<string, unknown>[]) : [];
      const lineCategory =
        linesArray[0]?.category ||
        (linesArray[0]?.dimensions as Record<string, unknown> | undefined)?.category;
      const categoryCode =
        text(row, "category", "expenseClass", "categoryCode") || String(lineCategory || "");
      if (categoryCode) {
        groupName = getCategoryName(categoryCode);
      }
      if (!groupName) {
        if (rowSource === "documents") {
          const type = text(row, "type");
          if (type === "sales_invoice") groupName = "Doanh thu dịch vụ/bán hàng";
          else if (type === "purchase_invoice") groupName = "Chi phí mua hàng/dịch vụ";
          else if (type === "credit_note") groupName = "Giảm trừ hóa đơn";
          else groupName = "Chứng từ khác";
        } else if (rowSource === "recognition") {
          groupName = "Doanh thu đã ghi nhận";
        } else {
          groupName = "Chi phí khác";
        }
      }

      const amountStr = text(row, "grossMinor", "totalAmountMinor", "amountMinor", "totalMinor");
      const amount = BigInt(amountStr || "0");

      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, new Map<string, bigint>());
      }
      const catMap = monthlyMap.get(monthKey)!;
      catMap.set(groupName, (catMap.get(groupName) ?? 0n) + amount);
    }

    const sortedMonths = [...monthlyMap.keys()].sort();
    return sortedMonths.map((month) => {
      const catMap = monthlyMap.get(month)!;
      const categories: Record<string, bigint> = {};
      for (const [catName, valMinor] of catMap.entries()) {
        categories[catName] = valMinor;
      }
      return {
        month: month === "Khác" ? "Khác" : `Tháng ${month.substring(5)}/${month.substring(0, 4)}`,
        categories,
      };
    });
  }, [rows]);

  const points = stackedPoints();

  return (
    <div className="flex flex-col gap-6">
      {!loading && rows.length > 0 ? (
        <MonthlyCategoryStackedChart
          title={
            kind === "documents"
              ? "Hoạt động doanh thu theo tháng"
              : "Tỷ trọng chi phí từng danh mục theo tháng"
          }
          description={
            kind === "documents"
              ? "Các trục đã xuất hóa đơn và đã ghi nhận được trình bày riêng, không cộng gộp thành một chỉ tiêu."
              : "Biểu đồ cột chồng (Stacked Bar) biểu diễn biến động tỷ trọng chi phí ăn uống, máy chủ, vận hành... theo tháng"
          }
          points={points}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="text-xs font-normal">
            {rows.length} bản ghi
          </Badge>
          {!initialProjectId && !initialPartyId ? <PeriodRangeNavigator /> : null}
        </div>
        <div className="flex max-w-full flex-wrap justify-end gap-2">
          <FilterPopover
            kind={kind}
            open={filters}
            onOpenChange={setFilters}
            params={new URLSearchParams(key)}
            onApply={apply}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!hasToken || exporting}
            onClick={exportWorkbook}
          >
            {exporting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Download data-icon="inline-start" />
            )}
            {exporting ? "Đang export..." : "Xuất danh sách XLSX"}
          </Button>
          <Button asChild size="sm">
            <Link href={`/${kind}/new`}>
              <Plus data-icon="inline-start" />
              {kind === "documents" ? "Tạo hóa đơn bán ra" : "Tạo chi phí"}
            </Link>
          </Button>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Không thể tải dữ liệu</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {exportError ? (
        <Alert variant="destructive">
          <AlertTitle>Không thể export dữ liệu</AlertTitle>
          <AlertDescription>{exportError}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : rows.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Mã bản ghi</TableHead>
                  <TableHead className="w-[110px]">Ngày chứng từ</TableHead>
                  <TableHead className="w-[140px]">Nguồn / Trục</TableHead>
                  <TableHead className="w-[160px]">Danh mục nghiệp vụ</TableHead>
                  <TableHead>Đối tượng</TableHead>
                  <TableHead>Nội dung / Diễn giải</TableHead>
                  <TableHead className="w-[140px] text-right">Tổng tiền</TableHead>
                  <TableHead className="w-[120px]">Trạng thái</TableHead>
                  <TableHead className="w-[110px] text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const id = text(row, "id");
                  const rowSource = sourceKind(row);
                  const dateVal = text(row, "documentDate", "expenseDate", "effectiveOn");
                  const rawParty =
                    text(row, rowSource === "expenses" ? "payeePartyId" : "partyId") ||
                    text(row, "employeePartyId");
                  const partyMatch = parties.find((p) => String(p.id) === rawParty);
                  const partyName = partyMatch
                    ? text(partyMatch, "displayName") || text(partyMatch, "name") || rawParty
                    : rawParty || "—";
                  const docNumber = text(row, "documentNumber") || id;
                  const lines = Array.isArray(row.lines)
                    ? (row.lines[0] as Row | undefined)
                    : undefined;
                  const lineDims = (lines?.dimensions as Record<string, string> | undefined) ?? {};
                  const catCode = text(row, "category") || lineDims.category || "";
                  const catName = getCategoryName(catCode);

                  return (
                    <TableRow key={id}>
                      <TableCell className="font-semibold text-foreground">{docNumber}</TableCell>
                      <TableCell className="font-medium text-foreground tabular-nums">
                        {dateVal || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {rowSource === "recognition"
                            ? "Đã ghi nhận · Chưa có hóa đơn"
                            : rowSource === "expenses"
                              ? `${human(text(row, "expenseClass"))} · Chưa có hóa đơn`
                              : `${human(text(row, "type"))} · Có hóa đơn`}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {catName ? <Badge variant="secondary">{catName}</Badge> : "—"}
                      </TableCell>
                      <TableCell className="font-medium">{partyName}</TableCell>
                      <TableCell
                        className="max-w-[200px] truncate text-muted-foreground"
                        title={text(row, "businessPurpose", "reason")}
                      >
                        {text(row, "businessPurpose", "reason") || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-foreground">
                        {money(text(row, "grossMinor", "amountMinor"))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{human(text(row, "state"))}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => void openQuickView(row)}>
                          <Eye data-icon="inline-start" />
                          Xem
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Chưa có {current.singular}</EmptyTitle>
                <EmptyDescription>Tạo bản ghi mới hoặc thay đổi bộ lọc.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(quickRecord)}
        onOpenChange={(open) => !open && setQuickRecord(undefined)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Chi tiết & Chỉnh sửa {current.singular}</DialogTitle>
            <DialogDescription>
              Xem toàn bộ thông tin chứng từ và cập nhật trực tiếp tại đây nếu dữ liệu ghi nhận chưa
              chính xác.
            </DialogDescription>
          </DialogHeader>
          {quickLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : quickRecord ? (
            <div className="grid gap-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardDescription>
                      {sourceKind(quickRecord) === "documents"
                        ? "Số hóa đơn"
                        : sourceKind(quickRecord) === "recognition"
                          ? "Mã ghi nhận doanh thu"
                          : "Ngày chi phí"}
                    </CardDescription>
                    <CardTitle>
                      {text(
                        quickRecord,
                        sourceKind(quickRecord) === "documents"
                          ? "documentNumber"
                          : sourceKind(quickRecord) === "recognition"
                            ? "id"
                            : "expenseDate",
                      ) || text(quickRecord, "id")}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardDescription>Tổng tiền</CardDescription>
                    <CardTitle>{money(text(quickRecord, "grossMinor", "amountMinor"))}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardDescription>Trạng thái</CardDescription>
                    <CardTitle>
                      <Badge variant="outline">{human(text(quickRecord, "state"))}</Badge>
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>
              {sourceKind(quickRecord) === "documents" ? (
                <DocumentForm
                  key={`quick-document-${text(quickRecord, "id")}-${text(quickRecord, "resourceVersion", "version")}`}
                  busy={quickBusy}
                  initial={quickRecord}
                  parties={parties}
                  submitLabel="Cập nhật thông tin hóa đơn"
                  onSubmit={(body: Row) => void updateQuickRecord(body)}
                />
              ) : sourceKind(quickRecord) === "expenses" ? (
                <ExpenseForm
                  key={`quick-expense-${text(quickRecord, "id")}-${text(quickRecord, "resourceVersion", "version")}`}
                  busy={quickBusy}
                  initial={quickRecord}
                  parties={parties}
                  submitLabel="Cập nhật thông tin chi phí"
                  onSubmit={(body: Row) => void updateQuickRecord(body)}
                />
              ) : (
                <div className="grid gap-3 rounded-lg border p-4">
                  <p className="font-medium">Trục doanh thu: Đã ghi nhận</p>
                  <p className="text-sm text-muted-foreground">
                    Đây là nghiệp vụ ghi nhận doanh thu chưa có quan hệ hóa đơn rõ ràng. Hệ thống
                    không suy đoán liên kết từ số tiền, ngày hoặc dự án.
                  </p>
                  <Button asChild variant="outline" className="w-fit">
                    <Link
                      href={`/revenue-recognition/${encodeURIComponent(text(quickRecord, "id"))}`}
                    >
                      Mở trang chi tiết
                    </Link>
                  </Button>
                </div>
              )}
              <DialogFooter>
                <Button asChild variant="outline">
                  <Link
                    href={
                      sourceKind(quickRecord) === "documents"
                        ? `/documents/${encodeURIComponent(text(quickRecord, "id"))}`
                        : sourceKind(quickRecord) === "expenses"
                          ? `/expenses/${encodeURIComponent(text(quickRecord, "id"))}`
                          : `/revenue-recognition/${encodeURIComponent(text(quickRecord, "id"))}`
                    }
                  >
                    Mở trang chi tiết
                  </Link>
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterPopover({
  kind,
  open,
  onOpenChange,
  params,
  onApply,
}: {
  kind: Kind;
  open: boolean;
  onOpenChange(open: boolean): void;
  params: URLSearchParams;
  onApply(data: FormData): void;
}) {
  const [invoiceStatus, setInvoiceStatus] = useState(params.get("invoiceStatus") ?? "all");
  const [startsOn, setStartsOn] = useState(params.get("startsOn") ?? params.get("from") ?? "");
  const [endsOn, setEndsOn] = useState(params.get("endsOn") ?? params.get("to") ?? "");

  useEffect(() => {
    if (open) {
      setInvoiceStatus(params.get("invoiceStatus") ?? "all");
      setStartsOn(params.get("startsOn") ?? params.get("from") ?? "");
      setEndsOn(params.get("endsOn") ?? params.get("to") ?? "");
    }
  }, [open, params]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Filter data-icon="inline-start" />
          Bộ lọc
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(70vh,36rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-0"
      >
        <form action={onApply} className="flex flex-col">
          <div className="border-b p-4">
            <h3 className="font-medium">Bộ lọc {config[kind].singular}</h3>
            <p className="text-sm text-muted-foreground">
              Bộ lọc được giữ trên URL để có thể chia sẻ và tải lại.
            </p>
          </div>
          <FieldGroup className="p-4">
            <QuickDatePresetButtons
              onSelectRange={(start, end) => {
                setStartsOn(start);
                setEndsOn(end);
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <FieldLabel htmlFor="filter-starts-on">Từ ngày</FieldLabel>
                <Input
                  id="filter-starts-on"
                  name="startsOn"
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="filter-ends-on">Đến ngày</FieldLabel>
                <Input
                  id="filter-ends-on"
                  name="endsOn"
                  type="date"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>Trạng thái</FieldLabel>
              <Select name="state" defaultValue={params.get("state") ?? "all"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Tất cả</SelectItem>
                    {[
                      "draft",
                      "validated",
                      "issued",
                      "captured",
                      "verified",
                      "approved",
                      "submitted",
                      "evidence_pending",
                      "posted",
                      "paid",
                      "cancelled",
                      "rejected",
                    ].map((state) => (
                      <SelectItem key={state} value={state}>
                        {human(state)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Tình trạng hóa đơn</FieldLabel>
              <Select name="invoiceStatus" value={invoiceStatus} onValueChange={setInvoiceStatus}>
                <SelectTrigger aria-label="Tình trạng hóa đơn">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="present">Có hóa đơn</SelectItem>
                    <SelectItem value="missing">Chưa có hóa đơn</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {kind === "documents" ? (
              <>
                {invoiceStatus !== "missing" ? (
                  <>
                    <Field>
                      <FieldLabel>Loại</FieldLabel>
                      <Select name="type" defaultValue={params.get("type") ?? "all"}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="all">Tất cả</SelectItem>
                            <SelectItem value="sales_invoice">Hóa đơn bán ra</SelectItem>
                            <SelectItem value="purchase_invoice">Hóa đơn mua vào</SelectItem>
                            <SelectItem value="credit_note">Credit note</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="filter-party">Party ID</FieldLabel>
                      <Input
                        id="filter-party"
                        name="partyId"
                        defaultValue={params.get("partyId") ?? ""}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="filter-project">Dự án ID</FieldLabel>
                      <Input
                        id="filter-project"
                        name="projectId"
                        defaultValue={params.get("projectId") ?? ""}
                      />
                    </Field>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <Field>
                  <FieldLabel>Nhóm chi phí</FieldLabel>
                  <Select name="class" defaultValue={params.get("class") ?? "all"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">Tất cả</SelectItem>
                        <SelectItem value="non_documented">Không có hóa đơn</SelectItem>
                        <SelectItem value="receipt_backed">Có biên nhận</SelectItem>
                        <SelectItem value="contract_backed">Theo hợp đồng</SelectItem>
                        <SelectItem value="employee_reimbursement">Hoàn ứng</SelectItem>
                        <SelectItem value="bank_fee">Phí ngân hàng</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="filter-payee">Payee ID</FieldLabel>
                  <Input
                    id="filter-payee"
                    name="payeePartyId"
                    defaultValue={params.get("payeePartyId") ?? ""}
                  />
                </Field>
              </>
            )}
          </FieldGroup>
          <div className="flex justify-end border-t bg-muted/50 p-4">
            <Button type="submit">Áp dụng</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function FocusedRecordCreateWorkspace({ kind }: { kind: Kind }) {
  const { client, hasToken, hydrated } = useAuthenticatedApiClient();
  const router = useRouter();
  const current = config[kind];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [parties, setParties] = useState<readonly Row[]>([]);

  useEffect(() => {
    if (hydrated && hasToken) {
      client
        .data<readonly Row[] | { items: readonly Row[] }>("master-data/parties?limit=500")
        .then((res) => {
          if (Array.isArray(res)) {
            setParties(res);
          } else if (res && typeof res === "object" && "items" in res && Array.isArray(res.items)) {
            setParties(res.items);
          }
        })
        .catch(() => setParties([]));
    }
  }, [client, hasToken, hydrated]);

  async function create(body: Row) {
    if (!hydrated || !hasToken) {
      setError("AUTH_REQUIRED");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await client.data<Row>(current.endpoint, { method: "POST", body });
      const id = text(result, "id");
      if (!id) throw new Error("API không trả về ID bản ghi.");
      router.push(`/${kind}/${encodeURIComponent(id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Không thể tạo ${current.singular}.`);
      setBusy(false);
    }
  }
  return (
    <ModulePage
      title={current.newTitle}
      description={`Nhập dữ liệu ${current.singular} theo form nghiệp vụ và lưu qua REST API.`}
      section={current.title}
    >
      <div className="flex max-w-4xl flex-col gap-6">
        <Button variant="ghost" asChild className="w-fit">
          <Link href={`/${kind}`}>
            <ArrowLeft data-icon="inline-start" />
            Quay lại danh sách
          </Link>
        </Button>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Không thể lưu bản ghi</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>{current.newTitle}</CardTitle>
            <CardDescription>
              Danh mục tài khoản hiện vẫn theo form compatibility; backend master-data selector sẽ
              thay thế khi contract UI được công bố.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {kind === "documents" ? (
              <DocumentForm busy={busy} parties={parties} onSubmit={(body) => void create(body)} />
            ) : (
              <ExpenseForm busy={busy} parties={parties} onSubmit={(body) => void create(body)} />
            )}
          </CardContent>
        </Card>
      </div>
    </ModulePage>
  );
}

function externalReference(record?: Row) {
  const single = record?.externalReference ?? record?.external_reference;
  if (single && typeof single === "object") return single as Row;
  const list = record?.externalReferences ?? record?.external_references;
  return Array.isArray(list) && list[0] && typeof list[0] === "object"
    ? (list[0] as Row)
    : undefined;
}

export function FocusedRecordDetailWorkspace({ kind, recordId }: { kind: Kind; recordId: string }) {
  const { client, hasToken, hydrated } = useAuthenticatedApiClient();
  const current = config[kind];
  const [record, setRecord] = useState<Row>();
  const [parties, setParties] = useState<readonly Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState<string>();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [axis, setAxis] = useState("management");
  const [reviewState, setReviewState] = useState("valid");
  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setError("");
    if (!hasToken) {
      setRecord(undefined);
      setError("AUTH_REQUIRED");
      setLoading(false);
      return;
    }
    try {
      const [resRecord, partiesRes] = await Promise.all([
        client.data<Row>(`${current.endpoint}/${encodeURIComponent(recordId)}`),
        client.data<readonly Row[] | { items: readonly Row[] }>("master-data/parties?limit=500"),
      ]);
      setRecord(resRecord);
      if (Array.isArray(partiesRes)) {
        setParties(partiesRes);
      } else if (
        partiesRes &&
        typeof partiesRes === "object" &&
        "items" in partiesRes &&
        Array.isArray(partiesRes.items)
      ) {
        setParties(partiesRes.items);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Không thể tải ${current.singular}.`);
    } finally {
      setLoading(false);
    }
  }, [client, current, hasToken, hydrated, recordId]);
  useEffect(() => void load(), [load]);
  const state = text(record, "state");
  const type = text(record, "type");
  const actions =
    kind === "documents" ? (documentActions[type]?.[state] ?? []) : (expenseActions[state] ?? []);
  const source = externalReference(record);
  async function transition() {
    if (!action || !reason.trim()) return;
    setBusy(true);
    setError("");
    try {
      await client.data(`${current.endpoint}/${encodeURIComponent(recordId)}/${action}`, {
        method: "POST",
        body: {
          reason,
          ...(action === "mark-evidence-pending" ? { missingEvidenceTypes: ["invoice"] } : {}),
        },
      });
      setAction(undefined);
      setReason("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể thực hiện thao tác.");
    } finally {
      setBusy(false);
    }
  }
  async function review() {
    if (!reason.trim()) return;
    setBusy(true);
    setError("");
    try {
      await client.data(`${current.endpoint}/${encodeURIComponent(recordId)}/review`, {
        method: "POST",
        body: { axis, lineNumber: 1, state: reviewState, reason },
      });
      setReviewOpen(false);
      setReason("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu review.");
    } finally {
      setBusy(false);
    }
  }
  async function update(body: Row) {
    if (!record) return;
    setBusy(true);
    setError("");
    try {
      await client.data(`${current.endpoint}/${encodeURIComponent(recordId)}`, {
        method: "PATCH",
        expectedVersion: text(record, "resourceVersion", "version"),
        body,
      });
      setEditOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Không thể sửa ${current.singular}.`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModulePage
      title={current.detailTitle}
      description={`URL ổn định cho ${current.singular} ${recordId}.`}
      section={current.title}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" asChild>
            <Link href={`/${kind}`}>
              <ArrowLeft data-icon="inline-start" />
              Danh sách {current.singular}
            </Link>
          </Button>
          <div className="flex flex-wrap gap-2">
            {state === "draft" ? (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                Sửa draft
              </Button>
            ) : null}
            {actions.map((name) => (
              <Button
                key={name}
                variant={name === "cancel" || name === "reject" ? "destructive" : "outline"}
                onClick={() => setAction(name)}
              >
                {human(name)}
              </Button>
            ))}
            {kind === "expenses" && record ? (
              <Button variant="outline" onClick={() => setReviewOpen(true)}>
                Review quản trị / thuế
              </Button>
            ) : null}
          </div>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Không thể hoàn tất thao tác</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <Skeleton className="h-96 w-full" />
        ) : record ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardDescription>
                    {kind === "documents" ? "Số hóa đơn" : "Ngày chi phí"}
                  </CardDescription>
                  <CardTitle>
                    {text(record, kind === "documents" ? "documentNumber" : "expenseDate") ||
                      recordId}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline">{human(state)}</Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Tổng tiền</CardDescription>
                  <CardTitle>{money(text(record, "grossMinor"))}</CardTitle>
                </CardHeader>
                <CardContent>{text(record, "currency") || "VND"}</CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Đối tượng</CardDescription>
                  <CardTitle>
                    {text(record, kind === "documents" ? "partyId" : "payeePartyId") || "—"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {human(text(record, kind === "documents" ? "type" : "expenseClass"))}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Dòng hạch toán nguồn</CardTitle>
                <CardDescription>
                  Giá trị từ resource API; posting vẫn tuân theo lifecycle hiện có.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mô tả</TableHead>
                      <TableHead>Tài khoản</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(record.lines) ? (record.lines as Row[]) : []).map(
                      (line, index) => (
                        <TableRow key={text(line, "id") || index}>
                          <TableCell>{text(line, "description") || "—"}</TableCell>
                          <TableCell>
                            {text(
                              line,
                              kind === "documents" ? "primaryAccountCode" : "postingAccountCode",
                            ) || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {money(text(line, "netMinor"))}
                          </TableCell>
                          <TableCell className="text-right">
                            {money(text(line, kind === "documents" ? "taxMinor" : "vatMinor"))}
                          </TableCell>
                          <TableCell className="text-right">
                            {money(text(line, "grossMinor"))}
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <SourceCard source={source} record={record} />
          </>
        ) : null}
      </div>
      <ActionDialog
        action={action}
        reason={reason}
        setReason={setReason}
        busy={busy}
        onClose={() => setAction(undefined)}
        onConfirm={() => void transition()}
      />
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Sửa draft {current.singular}</DialogTitle>
            <DialogDescription>
              Lưu bằng PATCH với phiên bản {text(record, "resourceVersion", "version") || "—"}. Nếu
              bản ghi đã thay đổi hoặc không còn draft, API sẽ từ chối cập nhật.
            </DialogDescription>
          </DialogHeader>
          {record ? (
            kind === "documents" ? (
              <DocumentForm
                key={`document-${recordId}-${text(record, "resourceVersion", "version")}`}
                busy={busy}
                initial={record}
                parties={parties}
                submitLabel="Lưu thay đổi hóa đơn"
                onSubmit={(body: Row) => void update(body)}
              />
            ) : (
              <ExpenseForm
                key={`expense-${recordId}-${text(record, "resourceVersion", "version")}`}
                busy={busy}
                initial={record}
                parties={parties}
                submitLabel="Lưu thay đổi chi phí"
                onSubmit={(body) => void update(body)}
              />
            )
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review chi phí</DialogTitle>
            <DialogDescription>Trạng thái quản trị, CIT và VAT độc lập.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>Trục review</FieldLabel>
              <Select
                value={axis}
                onValueChange={(value) => {
                  setAxis(value);
                  setReviewState(value === "management" ? "valid" : "eligible");
                }}
              >
                <SelectTrigger>
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
            <Field>
              <FieldLabel>Kết quả</FieldLabel>
              <Select value={reviewState} onValueChange={setReviewState}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(axis === "management"
                      ? ["valid", "invalid", "accountant_override"]
                      : ["eligible", "partially_eligible", "ineligible", "accountant_override"]
                    ).map((value) => (
                      <SelectItem key={value} value={value}>
                        {human(value)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="review-reason">Lý do</FieldLabel>
              <Input
                id="review-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>
              Hủy
            </Button>
            <Button disabled={busy || !reason.trim()} onClick={() => void review()}>
              Lưu review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModulePage>
  );
}

function ActionDialog({
  action,
  reason,
  setReason,
  busy,
  onClose,
  onConfirm,
}: {
  action?: string;
  reason: string;
  setReason(value: string): void;
  busy: boolean;
  onClose(): void;
  onConfirm(): void;
}) {
  return (
    <Dialog
      open={Boolean(action)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Xác nhận {human(action ?? "")}</DialogTitle>
          <DialogDescription>
            Thao tác lifecycle được gửi qua cùng REST service với CLI/AI và có idempotency.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="action-reason">Lý do</FieldLabel>
          <Input
            id="action-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={busy || !reason.trim()} onClick={onConfirm}>
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceCard({ source, record }: { source?: Row; record: Row }) {
  const url = text(source, "canonicalUrl", "url");
  const journalId = text(record, "journalId", "postingJournalId");
  const reconciliationIds = Array.isArray(record.reconciliationIds)
    ? record.reconciliationIds.map(String)
    : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nguồn và liên kết kế toán</CardTitle>
        <CardDescription>
          Paperless chỉ được hiển thị khi API trả external-reference metadata chính thức.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm text-muted-foreground">Nguồn ngoài</p>
          {source ? (
            <div className="flex flex-col gap-1">
              <strong>{text(source, "system") || "External"}</strong>
              <span className="font-mono text-xs">{text(source, "externalId")}</span>
              {url ? (
                <Button variant="link" className="w-fit px-0" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    Mở nguồn canonical <ExternalLink data-icon="inline-end" />
                  </a>
                </Button>
              ) : null}
            </div>
          ) : (
            <p>Chưa có external reference.</p>
          )}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Journal / reconciliation</p>
          <div className="flex flex-wrap gap-2">
            {journalId ? <Badge variant="outline">Journal {journalId}</Badge> : null}
            {reconciliationIds.map((id) => (
              <Button key={id} variant="outline" size="sm" asChild>
                <Link href={`/banking/reconciliation/${encodeURIComponent(id)}`}>
                  Reconciliation {id}
                </Link>
              </Button>
            ))}
            {!journalId && !reconciliationIds.length ? (
              <span>Chưa có liên kết đã post/đối soát.</span>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
