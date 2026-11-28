"use client";

import { RecordVoidControl } from "./focused-record-void-control";
import { DraftReasonsAlert, DraftReasonsBadge } from "./draft-reasons-banner";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatApiErrorMessage, useAuthenticatedApiClient } from "@/lib/api";
import {
  DocumentForm,
  ExpenseForm,
  getCategoryName,
  getFundingSourceLabel,
} from "@/components/forms/document-expense-forms";
import { createSubmitLabel, type WorkflowCreateCapabilities } from "./solopreneur-create-policy";
import {
  MonthlyCategoryStackedChart,
  type StackedCategoryPoint,
} from "@/components/dashboard/monthly-category-stacked-chart";
import { ExpenseOverviewChart } from "@/components/dashboard/expense-overview-chart";
import { buildFocusedRecordChartPoints } from "./focused-record-chart";
import { recordPartyId, relationshipIdList } from "./focused-record-relationships";
import { presentRevenueRecord } from "./focused-record-presentation";
import { presentExpenseRecord } from "./focused-expense-presentation";
import { recordCategory } from "@/lib/records/category";
import { sortRecordsNewestFirst } from "./focused-record-sorting";
import type { Kind, Row, TaggedRow } from "./focused-record-shared";
import {
  CATEGORY_LOOKUP_ENDPOINTS,
  FOCUSED_RECORD_MASTER_DATA_ENDPOINTS,
  nonNullRow,
  config,
  text,
  items,
  money,
  human,
  partiesByRole,
  findFundingOption,
  fundingLabel,
  fundingOptionValue,
  fundingTarget,
  isCurrentFunding,
  sourceKind,
  sourceEndpoint,
  fundingCode,
  tagRow,
  queryFor,
} from "./focused-record-shared";
import {
  buildReclassifyFundingOptions,
  downloadFocusedWorkbook,
  extractCategoryCatalog,
  matchesExpenseCostMode,
  parseExpenseCostMode,
  summarizeFilteredExpenseAmounts,
} from "./focused-record-cost-mode";
import { FocusedRecordErrorAlert } from "./focused-record-alerts";
import { QuickViewOneClickRecordBar } from "./focused-record-action-bar";
import { canRecordInOneClick, formatRecordActionError } from "./focused-record-actions";
import {
  FocusedRecordLoadMoreFooter,
  FocusedRecordSortHead,
  FocusedRecordToolbar,
  type FocusedRecordSortKey,
} from "./focused-record-toolbar";
import {
  DeleteDraftPurchaseInvoiceDialog,
  RecognitionQuickViewSummary,
  ReclassifyFundingDialog,
} from "./focused-record-quick-view-dialogs";

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
  const [visibleLimit, setVisibleLimit] = useState(50);
  const [sortKey, setSortKey] = useState<"date" | "id" | "party" | "category" | "amount" | "state">(
    "date",
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [parties, setParties] = useState<Row[]>([]);
  const [clients, setClients] = useState<Row[]>([]);
  const [payees, setPayees] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Row[]>([]);
  const [freelancers, setFreelancers] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Row[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<Row[] | undefined>();
  const [categoryNames, setCategoryNames] = useState<Readonly<Record<string, string>>>({});
  const [categoryTreatments, setCategoryTreatments] = useState<Readonly<Record<string, string>>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [filters, setFilters] = useState(false);
  const [quickRecord, setQuickRecord] = useState<Row>();
  const [deleteInvoiceOpen, setDeleteInvoiceOpen] = useState(false);
  const [deleteInvoiceReason, setDeleteInvoiceReason] = useState("");
  const [reclassifyOpen, setReclassifyOpen] = useState(false);
  const [reclassifyReason, setReclassifyReason] = useState("");
  const [reclassifyTargetAccount, setReclassifyTargetAccount] = useState("111-CASH");
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [workflowCapabilities, setWorkflowCapabilities] = useState<WorkflowCreateCapabilities>();
  const reclassifyFundingOptions = useMemo(
    () => buildReclassifyFundingOptions(financialAccounts),
    [financialAccounts],
  );
  const key = params.toString();
  const invoiceStatus = params.get("invoiceStatus") ?? "all";
  const costMode = kind === "expenses" ? parseExpenseCostMode(params.get("costMode")) : "all";
  const current = config[kind];
  const filteredRows = useMemo(
    () =>
      kind === "expenses" && costMode !== "all"
        ? rows.filter((row) => matchesExpenseCostMode(row, costMode, categoryTreatments))
        : rows,
    [categoryTreatments, costMode, kind, rows],
  );
  const expenseSummary = useMemo(
    () => (kind === "expenses" ? summarizeFilteredExpenseAmounts(filteredRows) : undefined),
    [filteredRows, kind],
  );
  const sortedRows = useMemo(() => {
    const valueFor = (row: Row, key: typeof sortKey): string => {
      if (key === "date") {
        return kind === "documents"
          ? presentRevenueRecord(
              row,
              sourceKind(row) === "recognition" ? "recognition" : "documents",
              projects,
              parties,
            ).activityDate
          : presentExpenseRecord(row).activityDate;
      }
      if (key === "id") return text(row, "documentNumber", "id");
      if (key === "party")
        return text(
          row,
          kind === "documents" ? "customerName" : "payeeName",
          kind === "documents" ? "partyId" : "payeePartyId",
        );
      if (key === "category") return recordCategory(row);
      if (key === "amount") return text(row, "grossMinor", "amountMinor", "amount");
      return text(row, "state");
    };
    return [...filteredRows].sort((left, right) => {
      const a = valueFor(left, sortKey);
      const b = valueFor(right, sortKey);
      let comparison: number;
      if (sortKey === "date") {
        const leftTime = a ? Date.parse(a) : Number.NaN;
        const rightTime = b ? Date.parse(b) : Number.NaN;
        if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
          return Number.isNaN(leftTime) === Number.isNaN(rightTime)
            ? 0
            : Number.isNaN(leftTime)
              ? 1
              : -1;
        } else comparison = leftTime - rightTime;
      } else {
        comparison = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredRows, kind, parties, projects, sortDirection, sortKey]);
  const toggleSort = (next: typeof sortKey) => {
    if (sortKey === next) setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortKey(next);
      setSortDirection(next === "date" ? "desc" : "asc");
    }
  };
  const SortHead = ({
    label,
    value,
    className,
  }: {
    label: string;
    value: FocusedRecordSortKey;
    className?: string;
  }) => (
    <FocusedRecordSortHead
      label={label}
      value={value}
      sortKey={sortKey}
      sortDirection={sortDirection}
      onToggle={toggleSort}
      className={className}
    />
  );
  const load = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setVisibleLimit(50);
    setLoadError("");
    if (!hasToken) {
      setRows([]);
      setLoadError(formatApiErrorMessage("AUTH_REQUIRED"));
      setLoading(false);
      return;
    }
    try {
      const sourceParams = new URLSearchParams(key);
      // The period navigator defaults to the current calendar year even when
      // the URL has not been materialized yet. Keep the data query in sync so
      // the initial view never mixes records from prior years.
      if (
        !sourceParams.has("startsOn") &&
        !sourceParams.has("endsOn") &&
        !initialProjectId &&
        !initialPartyId
      ) {
        const year = new Date().getFullYear();
        sourceParams.set("startsOn", `${year}-01-01`);
        sourceParams.set("endsOn", `${year}-12-31`);
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
      if (kind === "expenses") {
        documentParams.set("type", "purchase_invoice");
        const payeePartyId = sourceParams.get("payeePartyId");
        if (payeePartyId && payeePartyId !== "unclassified")
          documentParams.set("partyId", payeePartyId);
      } else if (!new Set(["sales_invoice", "credit_note"]).has(documentParams.get("type") ?? ""))
        documentParams.delete("type");
      const recognitionQuery = new URLSearchParams();
      for (const name of ["projectId", "state", "startsOn", "endsOn"]) {
        const value = sourceParams.get(name);
        if (value) recognitionQuery.set(name, value);
      }
      const [
        documentsResult,
        expensesResult,
        recognitionResult,
        partiesRes,
        rolesRes,
        projectsRes,
        workflowResult,
        categoryPayloads,
      ] = await Promise.all([
        includePresent
          ? client.dataAll<Row>(`commercial-documents?${queryFor("documents", documentParams)}`)
          : Promise.resolve([] as Row[]),
        kind === "expenses" && includeMissing
          ? client.dataAll<Row>(`expenses?${queryFor("expenses", sourceParams)}`)
          : Promise.resolve([] as Row[]),
        kind === "documents" && includeMissing
          ? client.data<{ items?: Row[] } | Row[]>(`revenue-recognition-events?${recognitionQuery}`)
          : Promise.resolve([] as Row[]),
        client
          .data<{ items?: Row[] } | Row[]>(FOCUSED_RECORD_MASTER_DATA_ENDPOINTS.parties)
          .catch(() => []),
        client
          .data<{ items?: Row[] } | Row[]>(FOCUSED_RECORD_MASTER_DATA_ENDPOINTS.partyRoles)
          .catch(() => []),
        client
          .data<{ items?: Row[] } | Row[]>(FOCUSED_RECORD_MASTER_DATA_ENDPOINTS.projects)
          .catch(() => []),
        client.data<WorkflowCreateCapabilities>("organization-workflow-policy").catch(() => ({})),
        Promise.all(
          CATEGORY_LOOKUP_ENDPOINTS.map((endpoint) =>
            client.data<readonly Row[] | { items?: readonly Row[] }>(endpoint).catch(() => []),
          ),
        ),
      ]);
      setWorkflowCapabilities(workflowResult);
      const catalog = extractCategoryCatalog(categoryPayloads);
      setCategoryNames(catalog.names);
      setCategoryTreatments(catalog.treatments);
      const listedDocuments = documentsResult.filter((row) =>
        kind === "expenses"
          ? text(row, "type") === "purchase_invoice"
          : ["sales_invoice", "credit_note"].includes(text(row, "type")),
      );
      // The list projection already carries the category, so no per-row detail request is needed.
      const listedExpenses = expensesResult;
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
      if (startsOn || endsOn) {
        rawItems = rawItems.filter((row) => {
          const dateVal =
            kind === "documents"
              ? presentRevenueRecord(
                  row,
                  sourceKind(row) === "recognition" ? "recognition" : "documents",
                  Array.isArray(projectsRes) ? projectsRes : (projectsRes.items ?? []),
                  Array.isArray(partiesRes) ? partiesRes : (partiesRes.items ?? []),
                ).activityDate
              : presentExpenseRecord(row).activityDate || text(row, "createdAt");
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
              (row.lines as (Row | null | undefined)[]).filter(nonNullRow).some((l) => {
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
        rawItems = rawItems.filter((row) => {
          if (kind !== "documents")
            return String(row.payeePartyId ?? row.payee_party_id ?? "").trim() === initialPartyId;
          return (
            presentRevenueRecord(
              row,
              sourceKind(row) === "recognition" ? "recognition" : "documents",
              Array.isArray(projectsRes) ? projectsRes : (projectsRes.items ?? []),
              Array.isArray(partiesRes) ? partiesRes : (partiesRes.items ?? []),
            ).customerId === initialPartyId.trim()
          );
        });
      }
      const payeePartyId = sourceParams.get("payeePartyId");
      if (kind === "expenses" && payeePartyId) {
        rawItems = rawItems.filter((row) => {
          const resolvedPayee = text(
            row,
            sourceKind(row) === "expenses" ? "payeePartyId" : "partyId",
          );
          return payeePartyId === "unclassified" ? !resolvedPayee : resolvedPayee === payeePartyId;
        });
      }
      const categoryId = sourceParams.get("categoryId");
      if (categoryId) {
        rawItems = rawItems.filter((row) => {
          if (Array.isArray(row.lines)) {
            const lineCategories = (row.lines as (Row | null | undefined)[])
              .filter(nonNullRow)
              .map((l) => {
                const dims = (l.dimensions as Record<string, unknown> | undefined) ?? {};
                return String(
                  l.expenseCategoryCode ?? l.expense_category_code ?? dims.category ?? "",
                ).trim();
              });
            return categoryId === "unclassified"
              ? lineCategories.every((value) => !value)
              : lineCategories.some((value) => value === categoryId.trim());
          }
          const rowCategory = String(row.category ?? "").trim();
          return categoryId === "unclassified" ? !rowCategory : rowCategory === categoryId.trim();
        });
      }
      const accountCode = sourceParams.get("accountCode")?.trim();
      if (kind === "expenses" && accountCode) {
        rawItems = rawItems.filter((row) => {
          const resolvedAccount = text(
            row,
            "counterAccountCode",
            "counter_account_code",
            "controlAccountCode",
            "control_account_code",
          );
          return resolvedAccount === accountCode;
        });
      }
      const presentationDate = (row: TaggedRow) =>
        kind === "documents"
          ? presentRevenueRecord(
              row,
              sourceKind(row) === "recognition" ? "recognition" : "documents",
              Array.isArray(projectsRes) ? projectsRes : (projectsRes.items ?? []),
              Array.isArray(partiesRes) ? partiesRes : (partiesRes.items ?? []),
            ).activityDate
          : presentExpenseRecord(row).activityDate || text(row, "createdAt");
      rawItems = sortRecordsNewestFirst(rawItems, presentationDate);
      setRows(rawItems);
      const listedParties = [...items(partiesRes)];
      const listedRoles = [...items(rolesRes)];
      setParties(listedParties);
      setClients(partiesByRole(listedParties, listedRoles, "client"));
      setProjects([...items(projectsRes)].filter((project) => text(project, "state") !== "closed"));
      if (kind === "expenses") {
        setPayees(partiesByRole(listedParties, listedRoles, "supplier"));
        setFreelancers(partiesByRole(listedParties, listedRoles, "freelancer"));
        setEmployees(partiesByRole(listedParties, listedRoles, "employee"));
      }
    } catch (cause) {
      setLoadError(formatApiErrorMessage(cause, `Không thể tải ${current.singular}.`));
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
  useEffect(() => {
    if (!hydrated || !hasToken) return;
    let cancelled = false;
    void client
      .data<readonly Row[] | { items?: readonly Row[] }>("banking/accounts")
      .then((payload) => {
        if (!cancelled) setFinancialAccounts([...items(payload)]);
      })
      .catch(() => {
        if (!cancelled) setFinancialAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, hasToken, hydrated]);
  useEffect(() => {
    if (params.get("create") === "1") setCreateOpen(true);
  }, [params]);

  function setCreateDialogOpen(open: boolean) {
    setCreateOpen(open);
    if (!open) setActionError("");
    if (!open && params.get("create") === "1") {
      const next = new URLSearchParams(params.toString());
      next.delete("create");
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
    }
  }

  async function createRecord(body: Row) {
    setCreateBusy(true);
    setActionError("");
    try {
      await client.data<Row>(current.endpoint, { method: "POST", body });
      setCreateDialogOpen(false);
      await load();
      router.refresh();
    } catch (cause) {
      setActionError(formatApiErrorMessage(cause, `Không thể tạo ${current.singular}.`));
    } finally {
      setCreateBusy(false);
    }
  }
  function apply(form: FormData) {
    const query = new URLSearchParams();
    for (const name of kind === "documents"
      ? ["invoiceStatus", "type", "state", "startsOn", "endsOn", "categoryId"]
      : ["invoiceStatus", "class", "state", "startsOn", "endsOn", "categoryId", "accountCode"]) {
      const value = String(form.get(name) ?? "").trim();
      if (value && value !== "all") query.set(name, value);
    }
    if (kind === "expenses" && costMode !== "all") query.set("costMode", costMode);
    const currentQ = params.get("q")?.trim();
    if (currentQ) query.set("q", currentQ);
    const nextQuery = query.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    setFilters(false);
  }
  async function exportWorkbook() {
    setExporting(true);
    setExportError("");
    try {
      await downloadFocusedWorkbook({
        kind,
        paramsKey: key,
        initialProjectId,
        initialPartyId,
        baseUrl: connection.baseUrl,
        organizationId: connection.organizationId,
        token,
      });
    } catch (cause) {
      setExportError(formatApiErrorMessage(cause, "Không thể export workbook."));
    } finally {
      setExporting(false);
    }
  }
  async function openQuickView(row: Row) {
    const id = text(row, "id");
    setActionError("");
    setQuickRecord(row);
    setQuickLoading(true);
    try {
      const source = sourceKind(row);
      const detail: Row = {
        ...(await client.data<Row>(`${sourceEndpoint(source)}/${encodeURIComponent(id)}`)),
        __sourceKind: source,
        __invoicePresence: row.__invoicePresence,
        __revenueAxis: row.__revenueAxis,
      };
      setQuickRecord(detail);
    } catch (cause) {
      setLoadError(formatApiErrorMessage(cause, `Không thể tải ${current.singular}.`));
    } finally {
      setQuickLoading(false);
    }
  }
  async function updateQuickRecord(body: Row) {
    if (!quickRecord) return;
    const id = text(quickRecord, "id");
    setQuickBusy(true);
    setActionError("");
    try {
      const source = sourceKind(quickRecord);
      if (source === "recognition") return;
      const state = text(quickRecord, "state");
      const isPostedCorrection =
        (source === "expenses" && state === "posted") ||
        (source === "documents" && ["issued", "posted", "partially_paid", "paid"].includes(state));
      const updated = await client.data<Row>(
        `${sourceEndpoint(source)}/${encodeURIComponent(id)}${isPostedCorrection ? "/metadata" : ""}`,
        {
          method: "PATCH",
          expectedVersion: text(quickRecord, "resourceVersion", "version"),
          ...(isPostedCorrection
            ? { idempotencyKey: `metadata-correction-${id}-${crypto.randomUUID()}` }
            : {}),
          body,
        },
      );
      setQuickRecord({ ...quickRecord, ...body, ...updated });
      await openQuickView({ ...quickRecord, ...body, ...updated });
      await load();
    } catch (cause) {
      setActionError(formatApiErrorMessage(cause, `Không thể sửa ${current.singular}.`));
    } finally {
      setQuickBusy(false);
    }
  }
  const canDeleteQuickPurchaseInvoice =
    quickRecord !== undefined &&
    sourceKind(quickRecord) === "documents" &&
    text(quickRecord, "type") === "purchase_invoice" &&
    text(quickRecord, "state") === "draft" &&
    !text(quickRecord, "journalId");
  const canOneClickRecordQuick =
    quickRecord !== undefined &&
    canRecordInOneClick(sourceKind(quickRecord), quickRecord, workflowCapabilities);

  async function recordQuickDraft(recordReason: string) {
    if (!quickRecord || !canOneClickRecordQuick) return;
    const id = text(quickRecord, "id");
    const source = sourceKind(quickRecord);
    if (source === "recognition") return;
    setQuickBusy(true);
    setActionError("");
    try {
      await client.data(`${sourceEndpoint(source)}/${encodeURIComponent(id)}/record`, {
        method: "POST",
        idempotencyKey: `record-${source}-${id}-${crypto.randomUUID()}`,
        body: { reason: recordReason },
      });
      toast.success("Đã ghi sổ thành công.");
      setQuickRecord(undefined);
      await load();
    } catch (cause) {
      const message = formatRecordActionError(cause);
      setActionError(message);
      toast.error(message);
    } finally {
      setQuickBusy(false);
    }
  }

  async function deleteQuickPurchaseInvoice() {
    if (!quickRecord || !canDeleteQuickPurchaseInvoice || !deleteInvoiceReason.trim()) return;
    const id = text(quickRecord, "id");
    setQuickBusy(true);
    setActionError("");
    try {
      await client.data(`commercial-documents/${encodeURIComponent(id)}`, {
        method: "DELETE",
        expectedVersion: text(quickRecord, "resourceVersion", "version"),
        idempotencyKey: `discard-purchase-invoice-${id}-${crypto.randomUUID()}`,
        body: { reason: deleteInvoiceReason.trim() },
      });
      setDeleteInvoiceOpen(false);
      setDeleteInvoiceReason("");
      setQuickRecord(undefined);
      await load();
      toast.success("Đã xóa hóa đơn mua vào bản nháp.");
    } catch (cause) {
      const message = formatApiErrorMessage(cause, "Không thể xóa hóa đơn mua vào bản nháp.");
      setActionError(message);
      toast.error(message);
    } finally {
      setQuickBusy(false);
    }
  }
  const canReclassifyFunding =
    quickRecord !== undefined &&
    (sourceKind(quickRecord) === "expenses" ||
      (sourceKind(quickRecord) === "documents" &&
        text(quickRecord, "type") === "purchase_invoice")) &&
    ["posted", "issued", "partially_paid", "paid"].includes(text(quickRecord, "state"));

  async function reclassifyFunding() {
    if (
      !quickRecord ||
      !canReclassifyFunding ||
      !reclassifyReason.trim() ||
      !reclassifyTargetAccount
    )
      return;
    const id = text(quickRecord, "id");
    const source = sourceKind(quickRecord);
    const targetOption = findFundingOption(reclassifyTargetAccount, reclassifyFundingOptions);
    const targetLedgerCode = targetOption?.code ?? reclassifyTargetAccount;
    setQuickBusy(true);
    setActionError("");
    try {
      // The server rebuilds the replacement from the stored record, so only the target is sent.
      const endpoint =
        source === "expenses"
          ? `expenses/${encodeURIComponent(id)}/reclassify-funding`
          : `commercial-documents/${encodeURIComponent(id)}/reclassify-funding`;
      const requestBody =
        source === "expenses"
          ? {
              ...fundingTarget(reclassifyTargetAccount, reclassifyFundingOptions),
              reason: reclassifyReason.trim(),
            }
          : { targetControlAccountCode: targetLedgerCode, reason: reclassifyReason.trim() };
      const result = await client.data<Row>(endpoint, {
        method: "POST",
        expectedVersion: text(quickRecord, "resourceVersion", "version"),
        idempotencyKey: `funding-reclassify-${id}-${crypto.randomUUID()}`,
        body: requestBody,
      });
      setReclassifyOpen(false);
      setReclassifyReason("");
      await load();
      if (result?.replacementExpenseId || result?.replacementDocumentId) {
        toast.success(
          `Đã đảo bút toán cũ và tạo bản thay thế với nguồn ${fundingLabel(reclassifyTargetAccount, reclassifyFundingOptions)}.`,
        );
      }
      setQuickRecord(undefined);
    } catch (cause) {
      const message = formatApiErrorMessage(cause, "Không thể đổi nguồn thanh toán.");
      setActionError(message);
      toast.error(message);
    } finally {
      setQuickBusy(false);
    }
  }
  const resolveCategoryName = useCallback(
    (code?: string) => {
      if (!code) return "";
      return categoryNames[code] || getCategoryName(code);
    },
    [categoryNames],
  );
  const points: readonly StackedCategoryPoint[] = buildFocusedRecordChartPoints(
    filteredRows,
    resolveCategoryName,
  );

  return (
    <div className="flex flex-col gap-6">
      {!loading && filteredRows.length > 0 ? (
        kind === "expenses" ? (
          <ExpenseOverviewChart rows={filteredRows} resolveCategoryName={resolveCategoryName} />
        ) : (
          <MonthlyCategoryStackedChart
            title="Hoạt động doanh thu theo tháng"
            description="Các trục đã xuất hóa đơn và đã ghi nhận được trình bày riêng, không cộng gộp thành một chỉ tiêu."
            points={points}
          />
        )
      ) : null}

      <FocusedRecordToolbar
        kind={kind}
        totalCount={filteredRows.length}
        unfilteredCount={rows.length}
        visibleCount={Math.min(visibleLimit, sortedRows.length)}
        paramsKey={key}
        costMode={costMode}
        onCostModeChange={(nextMode) => {
          const next = new URLSearchParams(key);
          if (nextMode === "all") next.delete("costMode");
          else next.set("costMode", nextMode);
          const query = next.toString();
          router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        }}
        expenseSummary={expenseSummary}
        filtersOpen={filters}
        onFiltersOpenChange={setFilters}
        onApplyFilters={apply}
        onSearch={(q) => {
          const next = new URLSearchParams(key);
          if (q) next.set("q", q);
          else next.delete("q");
          const query = next.toString();
          router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        }}
        hasToken={hasToken}
        exporting={exporting}
        onExport={exportWorkbook}
        onOpenCreate={() => setCreateDialogOpen(true)}
      />
      <FocusedRecordErrorAlert kind="load" message={loadError} />
      {!createOpen && !quickRecord && !deleteInvoiceOpen && !reclassifyOpen ? (
        <FocusedRecordErrorAlert kind="action" message={actionError} />
      ) : null}
      <FocusedRecordErrorAlert kind="export" message={exportError} />
      <Dialog open={createOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{current.newTitle}</DialogTitle>
            <DialogDescription>
              {kind === "documents"
                ? "Chọn khách hàng theo tên hiển thị; hệ thống vẫn lưu đúng ID liên kết."
                : "Chọn đối tác và nhân viên theo tên hiển thị; hệ thống vẫn lưu đúng ID liên kết."}
            </DialogDescription>
          </DialogHeader>
          <FocusedRecordErrorAlert kind="action" message={actionError} />
          {kind === "documents" ? (
            <DocumentForm
              busy={createBusy}
              parties={clients}
              purchaseParties={payees}
              projects={projects}
              submitLabel={createSubmitLabel(workflowCapabilities)}
              onSubmit={(body) => void createRecord(body)}
            />
          ) : (
            <ExpenseForm
              busy={createBusy}
              parties={parties}
              payees={payees}
              employees={employees}
              freelancers={freelancers}
              projects={projects}
              submitLabel={createSubmitLabel(workflowCapabilities)}
              onSubmit={(body) => void createRecord(body)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : sortedRows.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead className="w-[140px]" label="Mã bản ghi" value="id" />
                    <SortHead className="w-[110px]" label="Ngày chứng từ" value="date" />
                    <TableHead className="w-[180px]">Nguồn thanh toán / Trục</TableHead>
                    <SortHead className="w-[160px]" label="Danh mục nghiệp vụ" value="category" />
                    <SortHead
                      label={kind === "documents" ? "Khách hàng" : "Chi cho ai"}
                      value="party"
                    />
                    {kind === "documents" ? <TableHead>Dự án</TableHead> : null}
                    <TableHead>Nội dung / Diễn giải</TableHead>
                    <SortHead className="w-[140px] text-right" label="Tổng tiền" value="amount" />
                    <SortHead className="w-[120px]" label="Trạng thái" value="state" />
                    <TableHead className="w-[110px] text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.slice(0, visibleLimit).map((row) => {
                    const id = text(row, "id");
                    const rowSource = sourceKind(row);
                    const revenuePresentation =
                      kind === "documents"
                        ? presentRevenueRecord(
                            row,
                            rowSource === "recognition" ? "recognition" : "documents",
                            projects,
                            parties,
                          )
                        : undefined;
                    const expensePresentation =
                      kind === "expenses" ? presentExpenseRecord(row) : undefined;
                    const dateVal =
                      revenuePresentation?.activityDate ??
                      expensePresentation?.activityDate ??
                      text(row, "expenseDate", "effectiveOn");
                    const rawParty =
                      revenuePresentation?.customerId ??
                      expensePresentation?.payeePartyId ??
                      recordPartyId(row, projects);
                    const partyMatch = parties.find((p) => String(p.id) === rawParty);
                    const partyName = partyMatch
                      ? text(partyMatch, "displayName") || text(partyMatch, "name") || rawParty
                      : rawParty || "—";
                    const docNumber = text(row, "documentNumber") || id;
                    const catCode = expensePresentation?.category || recordCategory(row);
                    const catName = resolveCategoryName(catCode);
                    const projectIds =
                      revenuePresentation?.projectIds ?? relationshipIdList(row, "projectId");
                    const projectNames =
                      revenuePresentation?.projectNames ??
                      projectIds.map((projectId) => {
                        const project = projects.find(
                          (candidate) => text(candidate, "id") === projectId,
                        );
                        return project ? text(project, "name", "code") || projectId : projectId;
                      });
                    const relationshipTitle = [
                      projectNames.length ? `Dự án: ${projectNames.join(", ")}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ");

                    return (
                      <TableRow key={id}>
                        <TableCell className="font-semibold text-foreground">{docNumber}</TableCell>
                        <TableCell className="font-medium text-foreground tabular-nums">
                          {dateVal || "—"}
                        </TableCell>
                        <TableCell>
                          {rowSource === "recognition" ? (
                            <Badge variant="outline">Doanh thu ghi nhận · Không hóa đơn</Badge>
                          ) : kind === "expenses" || text(row, "type") === "purchase_invoice" ? (
                            <span className="text-sm">
                              {getFundingSourceLabel(
                                expensePresentation?.counterAccountCode ||
                                  text(row, "counterAccountCode", "controlAccountCode"),
                              )}
                            </span>
                          ) : (
                            <Badge variant="outline">{human(text(row, "type"))} · Có hóa đơn</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {catName ? <Badge variant="secondary">{catName}</Badge> : "—"}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate font-medium" title={partyName}>
                          {partyName}
                        </TableCell>
                        {kind === "documents" ? (
                          <TableCell
                            className="max-w-[260px]"
                            title={relationshipTitle || undefined}
                          >
                            {projectNames.length ? (
                              <div className="text-sm">
                                <span className="truncate font-medium">
                                  {projectNames.join(", ")}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Chưa phân bổ</span>
                            )}
                          </TableCell>
                        ) : null}
                        <TableCell
                          className="max-w-[200px] truncate text-muted-foreground"
                          title={
                            expensePresentation?.description ||
                            text(row, "businessPurpose", "reason")
                          }
                        >
                          {expensePresentation?.description ||
                            text(row, "businessPurpose", "reason") ||
                            "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-foreground">
                          {money(
                            revenuePresentation?.amountMinor ??
                              expensePresentation?.amountMinor ??
                              text(row, "grossMinor", "amountMinor"),
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{human(text(row, "state"))}</Badge>
                          <DraftReasonsBadge record={row} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void openQuickView(row)}
                          >
                            <Eye data-icon="inline-start" />
                            Xem
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <FocusedRecordLoadMoreFooter
                totalCount={sortedRows.length}
                visibleLimit={visibleLimit}
                onLoadMore={() => setVisibleLimit((currentLimit) => currentLimit + 50)}
              />
            </>
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
        onOpenChange={(open) => {
          if (!open) {
            setQuickRecord(undefined);
            setActionError("");
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Chi tiết & Chỉnh sửa {current.singular}</DialogTitle>
            <DialogDescription>
              Xem toàn bộ thông tin chứng từ và cập nhật trực tiếp tại đây nếu dữ liệu ghi nhận chưa
              chính xác.
            </DialogDescription>
          </DialogHeader>
          {!deleteInvoiceOpen && !reclassifyOpen ? (
            <FocusedRecordErrorAlert kind="action" message={actionError} />
          ) : null}
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
              <DraftReasonsAlert record={quickRecord} />
              {sourceKind(quickRecord) !== "recognition" &&
              (kind === "expenses" || text(quickRecord, "type") === "purchase_invoice") ? (
                <Card>
                  <CardHeader>
                    <CardDescription>Nguồn thanh toán</CardDescription>
                    <CardTitle>{getFundingSourceLabel(fundingCode(quickRecord))}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    TK 111/112 là tiền công ty và làm giảm số dư quỹ. TK 3388 là chủ doanh nghiệp
                    chi hộ, ghi nhận khoản phải trả chủ sở hữu và không làm giảm tiền mặt hay ngân
                    hàng công ty.
                  </CardContent>
                </Card>
              ) : null}
              {canOneClickRecordQuick ? (
                <QuickViewOneClickRecordBar
                  busy={quickBusy}
                  onRecord={(recordReason) => void recordQuickDraft(recordReason)}
                />
              ) : null}
              {canReclassifyFunding ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const alternative =
                        reclassifyFundingOptions.find(
                          (option) => !isCurrentFunding(option, quickRecord),
                        ) ?? reclassifyFundingOptions[0];
                      setReclassifyTargetAccount(
                        alternative ? fundingOptionValue(alternative) : "",
                      );
                      setReclassifyOpen(true);
                    }}
                  >
                    Đổi nguồn thanh toán
                  </Button>
                </div>
              ) : null}
              {sourceKind(quickRecord) !== "recognition" ? (
                <>
                  {sourceKind(quickRecord) === "documents" ? (
                    <div className="grid gap-4">
                      <DocumentForm
                        key={`quick-document-${text(quickRecord, "id")}-${text(quickRecord, "resourceVersion", "version")}`}
                        busy={quickBusy}
                        initial={quickRecord}
                        parties={
                          text(quickRecord, "type") === "purchase_invoice" ? payees : clients
                        }
                        purchaseParties={payees}
                        projects={projects}
                        metadataOnly={["issued", "posted", "partially_paid", "paid"].includes(
                          text(quickRecord, "state"),
                        )}
                        submitLabel="Cập nhật thông tin hóa đơn"
                        onSubmit={(body: Row) => void updateQuickRecord(body)}
                      />
                      {canDeleteQuickPurchaseInvoice ? (
                        <div className="flex justify-end border-t pt-4">
                          <Button
                            type="button"
                            variant="destructive"
                            disabled={quickBusy}
                            onClick={() => setDeleteInvoiceOpen(true)}
                          >
                            <Trash2 data-icon="inline-start" />
                            Xóa hóa đơn nháp
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <ExpenseForm
                      key={`quick-expense-${text(quickRecord, "id")}-${text(quickRecord, "resourceVersion", "version")}`}
                      busy={quickBusy}
                      initial={quickRecord}
                      parties={parties}
                      payees={payees}
                      employees={employees}
                      freelancers={freelancers}
                      projects={projects}
                      metadataOnly={text(quickRecord, "state") === "posted"}
                      submitLabel={
                        text(quickRecord, "state") === "posted"
                          ? "Lưu thay đổi"
                          : "Cập nhật thông tin chi phí"
                      }
                      onSubmit={(body: Row) => void updateQuickRecord(body)}
                    />
                  )}
                </>
              ) : (
                <RecognitionQuickViewSummary recordId={text(quickRecord, "id")} />
              )}
              {canDeleteQuickPurchaseInvoice ? null : (
                <RecordVoidControl
                  source={sourceKind(quickRecord)}
                  record={quickRecord}
                  onDone={async () => {
                    setQuickRecord(undefined);
                    await load();
                  }}
                />
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <DeleteDraftPurchaseInvoiceDialog
        open={deleteInvoiceOpen}
        onOpenChange={(open) => {
          setDeleteInvoiceOpen(open);
          if (!open) {
            setDeleteInvoiceReason("");
            setActionError("");
          }
        }}
        reason={deleteInvoiceReason}
        onReasonChange={setDeleteInvoiceReason}
        busy={quickBusy}
        error={actionError}
        onConfirm={() => void deleteQuickPurchaseInvoice()}
      />
      <ReclassifyFundingDialog
        open={reclassifyOpen}
        onOpenChange={(open) => {
          setReclassifyOpen(open);
          if (!open) {
            setReclassifyReason("");
            setActionError("");
          }
        }}
        quickRecord={quickRecord}
        options={reclassifyFundingOptions}
        targetAccount={reclassifyTargetAccount}
        onTargetAccountChange={setReclassifyTargetAccount}
        reason={reclassifyReason}
        onReasonChange={setReclassifyReason}
        busy={quickBusy}
        error={actionError}
        onConfirm={() => void reclassifyFunding()}
      />
    </div>
  );
}
