"use client";

import Link from "next/link";
import { RecordVoidControl } from "./focused-record-void-control";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, Eye, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
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
  getFundingSourceLabel,
} from "@/components/forms/document-expense-forms";
import { createSubmitLabel, type WorkflowCreateCapabilities } from "./solopreneur-create-policy";
import {
  MonthlyCategoryStackedChart,
  type StackedCategoryPoint,
} from "@/components/dashboard/monthly-category-stacked-chart";
import { ExpenseOverviewChart } from "@/components/dashboard/expense-overview-chart";
import { PeriodRangeNavigator } from "@/components/layout/period-range-navigator";
import { buildFocusedRecordChartPoints } from "./focused-record-chart";
import { recordPartyId, relationshipIdList } from "./focused-record-relationships";
import { presentRevenueRecord } from "./focused-record-presentation";
import { presentExpenseRecord } from "./focused-expense-presentation";
import { recordCategory } from "@/lib/records/category";
import { sortRecordsNewestFirst } from "./focused-record-sorting";
import type { Kind, Row, TaggedRow, FundingOption } from "./focused-record-shared";
import {
  nonNullRow,
  config,
  text,
  items,
  money,
  human,
  FUNDING_OPTIONS,
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
import { FilterPopover } from "./focused-record-filter-popover";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  const reclassifyFundingOptions = useMemo<readonly FundingOption[]>(() => {
    // Keep the canonical choices visible while the account catalog is loading.
    // Once loaded, organization-scoped active accounts become the source of truth.
    if (financialAccounts === undefined) return FUNDING_OPTIONS;
    const options: FundingOption[] = [];
    const seenIds = new Set<string>();
    for (const account of financialAccounts) {
      const status = text(account, "status");
      if (status && status !== "active") continue;
      const code = text(account, "ledgerAccountCode", "ledger_account_code");
      const id = text(account, "id");
      if (!code || !id || seenIds.has(id)) continue;
      seenIds.add(id);
      const displayName = text(account, "displayName", "display_name", "name") || code;
      options.push({ code, label: `${displayName} (${code})`, financialAccountId: id });
    }
    // Owner-paid is a control source rather than a financial account, so it is
    // intentionally added separately from the organization account catalog.
    if (!options.some((option) => option.code === "3388-OWNER" && !option.financialAccountId))
      options.push({ code: "3388-OWNER", label: "Chủ doanh nghiệp chi hộ (TK 3388)" });
    return options;
  }, [financialAccounts]);
  const key = params.toString();
  const invoiceStatus = params.get("invoiceStatus") ?? "all";
  const current = config[kind];
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
    return [...rows].sort((left, right) => {
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
  }, [kind, parties, projects, rows, sortDirection, sortKey]);
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
    value: typeof sortKey;
    className?: string;
  }) => (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:underline"
        onClick={() => toggleSort(value)}
      >
        {label}
        {sortKey === value ? (
          sortDirection === "asc" ? (
            <ArrowUp className="size-3" />
          ) : (
            <ArrowDown className="size-3" />
          )
        ) : null}
      </button>
    </TableHead>
  );
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
        workersRes,
        projectsRes,
        workflowResult,
      ] = await Promise.all([
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
        client.data<{ items?: Row[] } | Row[]>("master-data/party-roles?limit=500").catch(() => []),
        kind === "expenses"
          ? client.data<{ items?: Row[] } | Row[]>("time/workers").catch(() => [])
          : Promise.resolve([] as Row[]),
        client.data<{ items?: Row[] } | Row[]>("master-data/projects?limit=500").catch(() => []),
        client.data<WorkflowCreateCapabilities>("organization-workflow-policy").catch(() => ({})),
      ]);
      setWorkflowCapabilities(workflowResult);
      const listedDocuments = (
        Array.isArray(documentsResult) ? documentsResult : (documentsResult.items ?? [])
      ).filter((row) =>
        kind === "expenses"
          ? text(row, "type") === "purchase_invoice"
          : ["sales_invoice", "credit_note"].includes(text(row, "type")),
      );
      const documentsWithCategory = await Promise.all(
        listedDocuments.map(async (row) => {
          if (recordCategory(row)) return row;
          const id = text(row, "id");
          if (!id) return row;
          try {
            const detail = await client.data<Row>(`commercial-documents/${encodeURIComponent(id)}`);
            return { ...row, ...detail };
          } catch {
            return row;
          }
        }),
      );
      const listedExpenses = Array.isArray(expensesResult)
        ? expensesResult
        : (expensesResult.items ?? []);
      const listedRecognitions = Array.isArray(recognitionResult)
        ? recognitionResult
        : (recognitionResult.items ?? []);
      let rawItems: TaggedRow[] = [
        ...documentsWithCategory.map((row) => tagRow(row, "documents", "present", "invoiced")),
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
              : text(row, "expenseDate", "createdAt");
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
      const presentationDate = (row: TaggedRow) =>
        kind === "documents"
          ? presentRevenueRecord(
              row,
              sourceKind(row) === "recognition" ? "recognition" : "documents",
              Array.isArray(projectsRes) ? projectsRes : (projectsRes.items ?? []),
              Array.isArray(partiesRes) ? partiesRes : (partiesRes.items ?? []),
            ).activityDate
          : text(row, "expenseDate", "createdAt");
      rawItems = sortRecordsNewestFirst(rawItems, presentationDate);
      setRows(rawItems);
      const listedParties = Array.isArray(partiesRes) ? partiesRes : (partiesRes.items ?? []);
      setParties(listedParties);
      const listedRoles = Array.isArray(rolesRes) ? rolesRes : (rolesRes.items ?? []);
      const clientIds = new Set(
        listedRoles
          .filter((role) => text(role, "role") === "client")
          .map((role) => text(role, "partyId", "party_id")),
      );
      const clientParties = listedParties.filter((party) => clientIds.has(text(party, "id")));
      setClients(clientParties);
      setProjects(
        (Array.isArray(projectsRes) ? projectsRes : (projectsRes.items ?? [])).filter(
          (project) => text(project, "state") !== "closed",
        ),
      );
      if (kind === "expenses") {
        const supplierIds = new Set(
          listedRoles
            .filter((role) => text(role, "role") === "supplier")
            .map((role) => text(role, "partyId", "party_id")),
        );
        const supplierParties = listedParties.filter((party) => supplierIds.has(text(party, "id")));
        setPayees(supplierParties);
        const freelancerIds = new Set(
          listedRoles
            .filter((role) => text(role, "role") === "freelancer")
            .map((role) => text(role, "partyId", "party_id")),
        );
        setFreelancers(listedParties.filter((party) => freelancerIds.has(text(party, "id"))));
        const listedWorkers = Array.isArray(workersRes) ? workersRes : (workersRes.items ?? []);
        const employeeIds = new Set(
          listedWorkers
            .filter((worker) => text(worker, "status") === "active")
            .map((worker) => text(worker, "workerPartyId", "worker_party_id")),
        );
        setEmployees(listedParties.filter((party) => employeeIds.has(text(party, "id"))));
      }
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
  useEffect(() => {
    if (!hydrated || !hasToken) return;
    let cancelled = false;
    void client
      .data<readonly Row[] | { items?: readonly Row[] }>("banking/accounts")
      .then((payload) => {
        if (cancelled) return;
        setFinancialAccounts([...items(payload)]);
      })
      .catch(() => {
        if (!cancelled) setFinancialAccounts([]);
      });
    void Promise.allSettled([
      client.data<readonly Row[] | { items?: readonly Row[] }>("master-data/categories"),
      client.data<readonly Row[] | { items?: readonly Row[] }>("expense-categories"),
    ]).then((results) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        for (const row of items(result.value)) {
          const code = text(row, "code");
          const name = text(row, "name");
          if (code && name) next[code] = name;
        }
      }
      setCategoryNames(next);
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
    if (!open && params.get("create") === "1") {
      const next = new URLSearchParams(params.toString());
      next.delete("create");
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
    }
  }

  async function createRecord(body: Row) {
    setCreateBusy(true);
    setError("");
    try {
      await client.data<Row>(current.endpoint, { method: "POST", body });
      setCreateDialogOpen(false);
      await load();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Không thể tạo ${current.singular}.`);
    } finally {
      setCreateBusy(false);
    }
  }
  function apply(form: FormData) {
    const query = new URLSearchParams();
    for (const name of kind === "documents"
      ? ["invoiceStatus", "type", "state", "startsOn", "endsOn", "categoryId"]
      : ["invoiceStatus", "class", "state", "startsOn", "endsOn", "categoryId"]) {
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
      const detail: Row = {
        ...(await client.data<Row>(`${sourceEndpoint(source)}/${encodeURIComponent(id)}`)),
        __sourceKind: source,
        __invoicePresence: row.__invoicePresence,
        __revenueAxis: row.__revenueAxis,
      };
      setQuickRecord(detail);
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
      setError(cause instanceof Error ? cause.message : `Không thể sửa ${current.singular}.`);
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

  async function deleteQuickPurchaseInvoice() {
    if (!quickRecord || !canDeleteQuickPurchaseInvoice || !deleteInvoiceReason.trim()) return;
    const id = text(quickRecord, "id");
    setQuickBusy(true);
    setError("");
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
      const message =
        cause instanceof Error ? cause.message : "Không thể xóa hóa đơn mua vào bản nháp.";
      setError(message);
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
    setError("");
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
      const message = cause instanceof Error ? cause.message : "Không thể đổi nguồn thanh toán.";
      setError(message);
      toast.error(message);
    } finally {
      setQuickBusy(false);
    }
  }
  const resolveCategoryName = (code?: string) => {
    if (!code) return "";
    return categoryNames[code] || getCategoryName(code);
  };
  const points: readonly StackedCategoryPoint[] = buildFocusedRecordChartPoints(
    rows,
    resolveCategoryName,
  );

  return (
    <div className="flex flex-col gap-6">
      {!loading && rows.length > 0 ? (
        kind === "expenses" ? (
          <ExpenseOverviewChart rows={rows} />
        ) : (
          <MonthlyCategoryStackedChart
            title="Hoạt động doanh thu theo tháng"
            description="Các trục đã xuất hóa đơn và đã ghi nhận được trình bày riêng, không cộng gộp thành một chỉ tiêu."
            points={points}
          />
        )
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="text-xs font-normal">
            {rows.length} bản ghi
          </Badge>
          <PeriodRangeNavigator />
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
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus data-icon="inline-start" />
            {kind === "documents" ? "Tạo hóa đơn bán ra" : "Tạo chi phí"}
          </Button>
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Không thực hiện được</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {exportError ? (
        <Alert variant="destructive">
          <AlertTitle>Không thể export dữ liệu</AlertTitle>
          <AlertDescription>{exportError}</AlertDescription>
        </Alert>
      ) : null}
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
          ) : rows.length ? (
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
                {sortedRows.map((row) => {
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
                        <TableCell className="max-w-[260px]" title={relationshipTitle || undefined}>
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
                          expensePresentation?.description || text(row, "businessPurpose", "reason")
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
      <Dialog
        open={deleteInvoiceOpen}
        onOpenChange={(open) => {
          setDeleteInvoiceOpen(open);
          if (!open) setDeleteInvoiceReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa hóa đơn mua vào bản nháp?</DialogTitle>
            <DialogDescription>
              Chỉ bản nháp chưa có journal mới được xóa. Thao tác được ghi audit và không thể hoàn
              tác.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={deleteInvoiceReason.length > 0 && !deleteInvoiceReason.trim()}>
            <FieldLabel htmlFor="delete-purchase-invoice-reason">Lý do xóa</FieldLabel>
            <Textarea
              id="delete-purchase-invoice-reason"
              value={deleteInvoiceReason}
              onChange={(event) => setDeleteInvoiceReason(event.target.value)}
              placeholder="Ví dụ: Hóa đơn nhập nhầm hoặc bị trùng"
              aria-invalid={deleteInvoiceReason.length > 0 && !deleteInvoiceReason.trim()}
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={quickBusy}
              onClick={() => setDeleteInvoiceOpen(false)}
            >
              Giữ lại
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={quickBusy || !deleteInvoiceReason.trim()}
              onClick={() => void deleteQuickPurchaseInvoice()}
            >
              {quickBusy ? "Đang xóa…" : "Xác nhận xóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={reclassifyOpen}
        onOpenChange={(open) => {
          setReclassifyOpen(open);
          if (!open) setReclassifyReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đổi sang nguồn thanh toán khác?</DialogTitle>
            <DialogDescription>
              Bút toán đã ghi sổ sẽ được đảo và tạo bản thay thế ở trạng thái nháp. Lịch sử và đối
              soát cũ được giữ nguyên; bản thay thế sẽ ghi nhận theo nguồn bạn chọn.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="reclassify-funding-target">Nguồn thanh toán mới</FieldLabel>
            <Select value={reclassifyTargetAccount} onValueChange={setReclassifyTargetAccount}>
              <SelectTrigger id="reclassify-funding-target" className="w-full min-w-0">
                <SelectValue placeholder="Chọn nguồn thanh toán" />
              </SelectTrigger>
              <SelectContent>
                {reclassifyFundingOptions
                  .filter((option) => !isCurrentFunding(option, quickRecord))
                  .map((option) => (
                    <SelectItem key={fundingOptionValue(option)} value={fundingOptionValue(option)}>
                      {option.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Sẽ chuyển sang: {fundingLabel(reclassifyTargetAccount, reclassifyFundingOptions)}
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor="reclassify-funding-reason">Lý do điều chỉnh</FieldLabel>
            <Textarea
              id="reclassify-funding-reason"
              value={reclassifyReason}
              onChange={(event) => setReclassifyReason(event.target.value)}
              placeholder="Ví dụ: Hóa đơn do chủ doanh nghiệp thanh toán bằng tiền cá nhân"
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={quickBusy}
              onClick={() => setReclassifyOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              disabled={quickBusy || !reclassifyReason.trim()}
              onClick={() => void reclassifyFunding()}
            >
              {quickBusy ? "Đang xử lý…" : "Xác nhận đổi nguồn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
