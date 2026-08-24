"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Columns3, Filter, LayoutGrid, Mail, Phone } from "lucide-react";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuthenticatedApiClient } from "@/lib/api";
import type { createApiClient } from "@/lib/api";
import { ProjectBudgetWorkspace } from "./project-revenue-workspaces";
import { ProjectCostsWorkspace } from "./project-cost-workspaces";
import { FocusedRecordListWorkspace } from "./focused-record-workspaces";
import { projectMatchesDirectoryFilters } from "./business-directory-filters";
import { PeriodRangeNavigator } from "@/components/layout/period-range-navigator";

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
const dateOnly = (input: string) => {
  if (!input) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const date = new Date(input);
  return Number.isNaN(date.getTime())
    ? input
    : date.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
};
const masterDataKey = (id: string) =>
  btoa(JSON.stringify({ id })).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

const PROJECT_STATES = [
  { value: "planned", label: "Dự kiến" },
  { value: "active", label: "Đang triển khai" },
  { value: "on_hold", label: "Tạm dừng" },
  { value: "completed", label: "Hoàn thành" },
  { value: "closed", label: "Đã đóng" },
] as const;

const projectStateLabel = (state: string) =>
  (PROJECT_STATES.find((item) => item.value === state)?.label ?? state) || "—";
export const directoryCardValue = (input: unknown, fallback = "Chưa cập nhật") => {
  const normalized = String(input ?? "").trim();
  return normalized || fallback;
};
export const projectPeriodLabel = (project: Row) => {
  const startsOn = value(project, "starts_on");
  const endsOn = value(project, "ends_on");
  if (!startsOn && !endsOn) return "Chưa xác định thời gian";
  return `${startsOn ? dateOnly(startsOn) : "Chưa rõ"} – ${endsOn ? dateOnly(endsOn) : "Đang tiếp diễn"}`;
};
const digitsOnly = (input: string) => input.replace(/[^0-9]/g, "");
const formatInteger = (input: string) => {
  const digits = digitsOnly(input);
  if (!digits) return "";
  try {
    return new Intl.NumberFormat("vi-VN").format(BigInt(digits));
  } catch {
    return input;
  }
};

export function BusinessDirectoryWorkspace({ kind }: Readonly<{ kind: DirectoryKind }>) {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<readonly Row[]>([]);
  const [relatedRows, setRelatedRows] = useState<readonly Row[]>([]);
  const [projectFinancials, setProjectFinancials] = useState<readonly Row[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [updatingProjectId, setUpdatingProjectId] = useState("");

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
        const today = new Date().toISOString().slice(0, 10);
        const [parties, dashboard] = await Promise.all([
          client.data<Page>("master-data/parties?limit=100"),
          client.data<{ backlog?: { projects?: readonly Row[] } }>(
            `reports/operating-dashboard?asOf=${today}&startsOn=1900-01-01&endsOn=${today}&limit=50`,
          ),
        ]);
        setRelatedRows(parties.items);
        setProjectFinancials(dashboard.backlog?.projects ?? []);
      } else {
        const [roles, projects] = await Promise.all([
          client.data<Page>("master-data/party-roles?limit=100"),
          client.data<Page>("master-data/projects?limit=100"),
        ]);
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
        setRelatedRows(projects.items);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tải dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, [client, hasToken, hydrated, kind]);
  useEffect(() => void load(), [load]);

  const projectState = searchParams.get("state") ?? "all";
  const viewMode = searchParams.get("view") === "kanban" ? "kanban" : "grid";
  const startsOn = searchParams.get("startsOn") ?? "";
  const endsOn = searchParams.get("endsOn") ?? "";
  const filtered = rows.filter((row) => {
    if (kind === "projects") {
      return projectMatchesDirectoryFilters(row, {
        query,
        state: projectState,
        startsOn,
        endsOn,
      });
    }
    const matchesQuery = Object.values(row).some((item) =>
      String(item ?? "")
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
    return matchesQuery;
  });
  const kanbanRows = rows.filter((row) =>
    projectMatchesDirectoryFilters(row, { query, state: "all", startsOn, endsOn }),
  );
  const partyNames = new Map(
    (kind === "projects" ? relatedRows : rows).map((row) => [
      value(row, "id"),
      directoryCardValue(row.display_name ?? row.legal_name),
    ]),
  );
  const projectCounts = new Map<string, number>();
  const projectFinancialsById = new Map(
    projectFinancials.map((row) => [value(row, "projectId"), row]),
  );
  if (kind === "customers") {
    for (const project of relatedRows) {
      const clientId = value(project, "client_party_id");
      if (clientId) projectCounts.set(clientId, (projectCounts.get(clientId) ?? 0) + 1);
    }
  }

  function changeView(nextView: string) {
    if (nextView !== "grid" && nextView !== "kanban") return;
    const next = new URLSearchParams(searchParams.toString());
    if (nextView === "kanban") next.set("view", "kanban");
    else next.delete("view");
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`);
  }

  async function updateProjectState(project: Row, state: string) {
    const id = value(project, "id");
    const previousState = value(project, "state");
    if (!id || state === previousState || updatingProjectId) return;
    setUpdatingProjectId(id);
    setError("");
    try {
      await client.data(`master-data/projects/${masterDataKey(id)}`, {
        method: "PATCH",
        body: { data: { state } },
        ...(value(project, "resource_version")
          ? { expectedVersion: value(project, "resource_version") }
          : {}),
      });
      await load();
    } catch (caught) {
      setRows((current) =>
        current.map((row) => (value(row, "id") === id ? { ...row, state: previousState } : row)),
      );
      setError(caught instanceof Error ? caught.message : "Không thể cập nhật trạng thái dự án.");
    } finally {
      setUpdatingProjectId("");
    }
  }

  function applyProjectFilters(data: FormData) {
    const next = new URLSearchParams(searchParams.toString());
    for (const name of ["state", "startsOn", "endsOn"]) {
      const selected = String(data.get(name) ?? "").trim();
      if (!selected || selected === "all") {
        next.delete(name);
      } else {
        next.set(name, selected);
      }
    }
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`);
    setFilterOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="text-xs font-normal">
            {kind === "projects" && viewMode === "kanban" ? kanbanRows.length : filtered.length} bản
            ghi
          </Badge>
          <PeriodRangeNavigator />
          <Input
            className="w-48 sm:w-64"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={kind === "customers" ? "Tìm khách hàng…" : "Tìm dự án…"}
            aria-label={kind === "customers" ? "Tìm khách hàng" : "Tìm dự án"}
          />
        </div>
        <div className="flex max-w-full flex-wrap justify-end gap-2">
          {kind === "projects" ? (
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={changeView}
              variant="outline"
              size="sm"
              spacing={0}
              aria-label="Chế độ hiển thị dự án"
            >
              <ToggleGroupItem value="grid" aria-label="Dạng thẻ">
                <LayoutGrid data-icon="inline-start" />
                Thẻ
              </ToggleGroupItem>
              <ToggleGroupItem value="kanban" aria-label="Kanban">
                <Columns3 data-icon="inline-start" />
                Kanban
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}
          {kind === "projects" ? (
            <ProjectFilterPopover
              open={filterOpen}
              onOpenChange={setFilterOpen}
              params={searchParams}
              onApply={applyProjectFilters}
            />
          ) : null}
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
      {kind === "projects" && viewMode === "kanban" ? (
        <ProjectKanban
          rows={kanbanRows}
          updatingProjectId={updatingProjectId}
          onStateChange={updateProjectState}
        />
      ) : (
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
            const financial = customer ? undefined : projectFinancialsById.get(id);
            const contractedMinor = BigInt(value(financial ?? {}, "contractedMinor") || "0");
            const invoicedMinor = BigInt(value(financial ?? {}, "invoicedMinor") || "0");
            const collectedMinor = BigInt(value(financial ?? {}, "collectedMinor") || "0");
            const progress = (part: bigint) =>
              contractedMinor > 0n
                ? Math.min(100, Number((part * 10_000n) / contractedMinor) / 100)
                : 0;

            return (
              <Card key={id} data-testid={`${kind}-card-${id}`} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-semibold leading-tight">{title}</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {customer
                        ? directoryCardValue(value(row, "normalized_tax_id"), "Chưa có MST")
                        : directoryCardValue(value(row, "code"), id)}
                    </CardDescription>
                  </div>
                  {note ? (
                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2 italic">{note}</p>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4 pt-0">
                  {customer ? (
                    <div className="grid gap-2 text-sm">
                      <p className="font-medium">{projectCounts.get(id) ?? 0} dự án đã liên kết</p>
                      <p className="flex min-w-0 items-center gap-2 text-muted-foreground">
                        <Mail className="size-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{directoryCardValue(value(row, "email"))}</span>
                      </p>
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="size-4 shrink-0" aria-hidden="true" />
                        {directoryCardValue(value(row, "phone"))}
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-2 text-sm">
                      <p className="font-medium">
                        {partyNames.get(value(row, "client_party_id")) ?? "Chưa gán khách hàng"}
                      </p>
                      <p className="text-muted-foreground">
                        {directoryCardValue(
                          value(row, "default_service_line_code"),
                          "Chưa phân loại dịch vụ",
                        )}
                        {value(row, "contract_type") ? ` · ${value(row, "contract_type")}` : ""}
                      </p>
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                        {projectPeriodLabel(row)}
                      </p>
                      <p className="font-medium">
                        Ngân sách{" "}
                        {money(value(row, "budget_minor"), value(row, "currency") || "VND")}
                      </p>
                      {financial ? (
                        <div className="space-y-2 border-t pt-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Tiến độ theo cam kết hợp đồng
                          </p>
                          {[
                            ["Đã xuất hóa đơn", invoicedMinor, progress(invoicedMinor)],
                            ["Đã thu tiền", collectedMinor, progress(collectedMinor)],
                          ].map(([label, amount, percent]) => (
                            <div key={String(label)} className="space-y-1">
                              <div className="flex items-center justify-between gap-3 text-xs">
                                <span>{String(label)}</span>
                                <span className="tabular-nums">
                                  {Number(percent).toLocaleString("vi-VN", {
                                    maximumFractionDigits: 1,
                                  })}
                                  %
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground tabular-nums">
                                {money(String(amount), value(row, "currency") || "VND")} /{" "}
                                {money(String(contractedMinor), value(row, "currency") || "VND")}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3">
                    <Badge variant="outline" className="shrink-0">
                      {customer ? value(row, "status") : projectStateLabel(value(row, "state"))}
                    </Badge>
                    <div className="flex flex-wrap justify-end gap-2">
                      {customer ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/receivables/customers/${encodeURIComponent(id)}`}>
                            Công nợ
                          </Link>
                        </Button>
                      ) : null}
                      <Button asChild size="sm">
                        <Link href={`/${kind}/${encodeURIComponent(id)}`}>Mở hồ sơ</Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {!loading &&
      (kind === "projects" && viewMode === "kanban" ? kanbanRows : filtered).length === 0 ? (
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

function ProjectKanban({
  rows,
  updatingProjectId,
  onStateChange,
}: Readonly<{
  rows: readonly Row[];
  updatingProjectId: string;
  onStateChange(project: Row, state: string): void | Promise<void>;
}>) {
  const [draggedProjectId, setDraggedProjectId] = useState("");
  const projectsById = new Map(rows.map((row) => [value(row, "id"), row]));

  return (
    <ScrollArea className="w-full pb-3">
      <div className="grid min-w-[78rem] grid-cols-5 gap-3 pb-3">
        {PROJECT_STATES.map((state) => {
          const projects = rows.filter((row) => value(row, "state") === state.value);
          return (
            <section
              key={state.value}
              data-testid={`project-kanban-column-${state.value}`}
              className="flex min-h-[32rem] flex-col gap-3 rounded-xl border bg-muted/20 p-3"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/project-id") || draggedProjectId;
                const project = projectsById.get(id);
                if (project) void onStateChange(project, state.value);
                setDraggedProjectId("");
              }}
            >
              <header className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{state.label}</h2>
                <Badge variant="secondary">{projects.length}</Badge>
              </header>
              <div className="flex flex-col gap-3">
                {projects.map((project) => {
                  const id = value(project, "id");
                  const rawName = value(project, "name");
                  const [title, ...nameNote] = rawName.split(" — ");
                  const note =
                    value(project, "notes") ||
                    value(project, "description") ||
                    nameNote.join(" — ");
                  return (
                    <Card
                      key={id}
                      data-testid={`project-kanban-card-${id}`}
                      draggable={!updatingProjectId}
                      aria-busy={updatingProjectId === id}
                      className="cursor-grab active:cursor-grabbing"
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/project-id", id);
                        setDraggedProjectId(id);
                      }}
                      onDragEnd={() => setDraggedProjectId("")}
                    >
                      <CardHeader className="gap-1 pb-3">
                        <CardTitle className="text-sm leading-snug">{title}</CardTitle>
                        <CardDescription className="font-mono text-xs">
                          {value(project, "code") || id}
                        </CardDescription>
                        {note ? (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{note}</p>
                        ) : null}
                      </CardHeader>
                      <CardContent className="pt-0">
                        <Button asChild size="sm" variant="outline" className="w-full">
                          <Link href={`/projects/${encodeURIComponent(id)}`}>Mở hồ sơ</Link>
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

function ProjectFilterPopover({
  open,
  onOpenChange,
  params,
  onApply,
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  params: URLSearchParams;
  onApply(data: FormData): void;
}>) {
  const [startsOn, setStartsOn] = useState(params.get("startsOn") ?? "");
  const [endsOn, setEndsOn] = useState(params.get("endsOn") ?? "");

  useEffect(() => {
    if (!open) return;
    setStartsOn(params.get("startsOn") ?? "");
    setEndsOn(params.get("endsOn") ?? "");
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
            <h3 className="font-medium">Bộ lọc dự án</h3>
            <p className="text-sm text-muted-foreground">
              Lọc theo trạng thái và thời gian thực hiện; lựa chọn được giữ trên URL.
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
                <FieldLabel htmlFor="project-filter-starts-on">Từ ngày</FieldLabel>
                <Input
                  id="project-filter-starts-on"
                  name="startsOn"
                  type="date"
                  value={startsOn}
                  onChange={(event) => setStartsOn(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="project-filter-ends-on">Đến ngày</FieldLabel>
                <Input
                  id="project-filter-ends-on"
                  name="endsOn"
                  type="date"
                  value={endsOn}
                  onChange={(event) => setEndsOn(event.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>Trạng thái</FieldLabel>
              <Select name="state" defaultValue={params.get("state") ?? "all"}>
                <SelectTrigger aria-label="Trạng thái dự án">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="active">Đang hoạt động</SelectItem>
                    <SelectItem value="planned">Dự kiến</SelectItem>
                    <SelectItem value="on_hold">Tạm dừng</SelectItem>
                    <SelectItem value="closed">Đã đóng</SelectItem>
                    <SelectItem value="completed">Hoàn thành</SelectItem>
                    <SelectItem value="all">Tất cả</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <div className="flex justify-end border-t bg-muted/50 p-4">
            <Button type="submit">Áp dụng</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function BusinessRecordWorkspace({
  kind,
  id,
}: Readonly<{ kind: DirectoryKind; id: string }>) {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const router = useRouter();
  const [record, setRecord] = useState<Row>();
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(false);
  const [clientParty, setClientParty] = useState<Row>();
  const [customerProjects, setCustomerProjects] = useState<readonly Row[]>([]);
  const [projectContracts, setProjectContracts] = useState<readonly Row[]>([]);
  const [projectMilestones, setProjectMilestones] = useState<readonly Row[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!hydrated || !hasToken || !id) return;
    const resource = kind === "customers" ? "parties" : "projects";
    setError("");
    void client
      .data<Row>(`master-data/${resource}/${masterDataKey(id)}`)
      .then((item) => {
        setRecord(item);
        setError("");
        if (kind === "customers") {
          client
            .data<Page>("master-data/projects?limit=200")
            .then((res) => {
              const items = Array.isArray(res) ? res : (res.items ?? []);
              setCustomerProjects(items.filter((p) => String(p.client_party_id || "") === id));
            })
            .catch(() => setCustomerProjects([]));
        } else {
          const clientId = String(item.client_party_id || "");
          if (clientId) {
            client
              .data<Row>(`master-data/parties/${masterDataKey(clientId)}`)
              .then(setClientParty)
              .catch(() => undefined);
          }
          void Promise.all([
            client.data<Page>("master-data/contracts?limit=200"),
            client.data<Page>("master-data/milestones?limit=500"),
          ])
            .then(([contractsPage, milestonesPage]) => {
              const contracts = contractsPage.items.filter(
                (contract) => value(contract, "project_id") === id,
              );
              const contractIds = new Set(contracts.map((contract) => value(contract, "id")));
              setProjectContracts(contracts);
              setProjectMilestones(
                milestonesPage.items.filter((milestone) =>
                  contractIds.has(value(milestone, "contract_id")),
                ),
              );
            })
            .catch(() => {
              setProjectContracts([]);
              setProjectMilestones([]);
            });
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
  const primaryContract = projectContracts.length === 1 ? projectContracts[0] : undefined;

  async function deleteProject() {
    if (customer || !deleteReason.trim()) return;
    setDeleting(true);
    setError("");
    try {
      await client.data(`master-data/projects/${masterDataKey(id)}`, {
        method: "DELETE",
        expectedVersion: value(record!, "resource_version"),
        idempotencyKey: `delete-project-${id}`,
        body: { reason: deleteReason.trim() },
      });
      router.push("/projects");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể xóa dự án.");
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }

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
              {!customer ? (
                <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                  Xóa dự án
                </Button>
              ) : null}
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
              <Fact
                label="Số hợp đồng"
                value={primaryContract ? value(primaryContract, "reference") : "Chưa cập nhật"}
              />
              <Fact
                label="Ngày ký"
                value={primaryContract ? dateOnly(value(primaryContract, "signed_on")) : "—"}
              />
              <Fact
                label="Giá trị hợp đồng"
                value={
                  primaryContract
                    ? money(
                        value(primaryContract, "value_minor"),
                        value(primaryContract, "currency"),
                      )
                    : "—"
                }
              />
              <Fact
                label="Mảng dịch vụ"
                value={value(record, "default_service_line_code") || "Chưa phân loại"}
              />
              <Fact label="Trạng thái" value={projectStateLabel(value(record, "state"))} />
              <Fact
                label="Ngân sách phê duyệt"
                value={money(value(record, "budget_minor"), value(record, "currency"))}
              />
              <Fact label="Ngày bắt đầu" value={dateOnly(value(record, "starts_on"))} />
              <Fact
                label="Ngày kết thúc"
                value={
                  value(record, "ends_on") ? dateOnly(value(record, "ends_on")) : "Chưa xác định"
                }
              />
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
              <CardTitle className="text-lg">1. Danh sách Dự án của Khách hàng</CardTitle>
              <CardDescription className="text-xs">
                Tất cả các dự án dịch vụ đã ký kết với khách hàng {projectName}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {customerProjects.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {customerProjects.map((proj) => {
                    const projId = value(proj, "id");
                    const rawPName = value(proj, "name");
                    let pTitle = rawPName;
                    let pNote = value(proj, "notes") || value(proj, "description");
                    if (rawPName.includes(" — ")) {
                      const parts = rawPName.split(" — ");
                      pTitle = parts[0]!.trim();
                      if (!pNote) pNote = parts.slice(1).join(" — ").trim();
                    }
                    return (
                      <Card key={projId} className="flex flex-col justify-between">
                        <CardHeader className="p-4 pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <CardTitle className="text-base font-semibold">{pTitle}</CardTitle>
                              <CardDescription className="font-mono text-xs mt-0.5">
                                {value(proj, "code")}
                              </CardDescription>
                            </div>
                            <Badge variant="outline">
                              {projectStateLabel(value(proj, "state"))}
                            </Badge>
                          </div>
                          {pNote ? (
                            <p className="mt-1 text-xs text-muted-foreground italic line-clamp-2">
                              {pNote}
                            </p>
                          ) : null}
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <Button asChild size="sm" variant="secondary" className="w-full">
                            <Link href={`/projects/${encodeURIComponent(projId)}`}>
                              Xem hồ sơ dự án
                            </Link>
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic py-2">
                  Chưa có dự án nào được gắn trực tiếp cho khách hàng này.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">
                    2. Hóa đơn Khách hàng (Đầu ra & Đã liên kết)
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
              <CardTitle className="text-lg">Tiến độ & mốc bàn giao</CardTitle>
              <CardDescription className="text-xs">
                Dự án đại diện cho hợp đồng thương mại; các mốc dùng cho backlog, nghiệm thu và ghi
                nhận doanh thu.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {projectContracts.length > 1 ? (
                <Alert variant="destructive">
                  <AlertTitle>Dữ liệu hợp đồng cần hợp nhất</AlertTitle>
                  <AlertDescription>
                    Dự án đang có {projectContracts.length} bản ghi hợp đồng cũ. Hãy hợp nhất về một
                    bản ghi trước khi dùng giá trị thương mại để quản trị.
                  </AlertDescription>
                </Alert>
              ) : null}
              {projectMilestones.length ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {projectMilestones.map((milestone) => (
                    <div
                      key={value(milestone, "id")}
                      className="rounded-md bg-muted/30 p-3 text-sm"
                    >
                      <p className="font-medium">{value(milestone, "name")}</p>
                      <p className="text-xs text-muted-foreground">
                        Hạn {dateOnly(value(milestone, "due_on"))} ·{" "}
                        {money(
                          value(milestone, "amount_minor"),
                          primaryContract
                            ? value(primaryContract, "currency")
                            : value(record, "currency"),
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {projectContracts.length
                    ? "Chưa cập nhật mốc thực hiện cho dự án."
                    : "Chưa cập nhật thông tin hợp đồng và mốc thực hiện cho dự án."}
                </p>
              )}
            </CardContent>
          </Card>

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
      {!customer ? (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa dự án vận hành?</AlertDialogTitle>
              <AlertDialogDescription>
                Dự án chỉ được xóa khi không có chứng từ, chi phí, phân bổ, ngân sách hoặc bút toán
                tham chiếu. Lịch sử audit của thao tác xóa vẫn được giữ lại.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Field>
              <FieldLabel htmlFor="project-delete-reason">Lý do xóa</FieldLabel>
              <Input
                id="project-delete-reason"
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder="Ví dụ: Bản ghi nhập trùng"
              />
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Giữ lại</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting || !deleteReason.trim()}
                onClick={(event) => {
                  event.preventDefault();
                  void deleteProject();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? "Đang xóa…" : "Xóa dự án"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
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
          default_service_line_code:
            String(form.get("default_service_line_code") ?? "").trim() || null,
          budget_minor: digitsOnly(String(form.get("budget_minor") ?? "0")) || "0",
          ends_on: String(form.get("ends_on") ?? "").trim() || null,
          notes: String(form.get("notes") ?? "").trim() || null,
          state: String(form.get("state") ?? "planned"),
        };
    const resource = customer ? "parties" : "projects";
    try {
      await client.data(
        initial
          ? `master-data/${resource}/${masterDataKey(value(initial, "id"))}`
          : `master-data/${resource}`,
        {
          method: initial ? "PATCH" : "POST",
          body: { data },
          ...(initial && value(initial, "resource_version")
            ? { expectedVersion: value(initial, "resource_version") }
            : {}),
        },
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
      <DialogContent className="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Chỉnh sửa" : "Tạo"} {customer ? "khách hàng" : "dự án"}
          </DialogTitle>
          <DialogDescription>
            Dữ liệu được ghi trực tiếp vào danh mục ERP và có audit phía server.
          </DialogDescription>
        </DialogHeader>
        <form action={(form) => void submit(form)}>
          <FieldGroup>
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
                <FieldSeparator>Thông tin vận hành</FieldSeparator>
                <ProjectStateField defaultValue={value(initial ?? {}, "state") || "planned"} />
                <MoneyEditorField
                  name="budget_minor"
                  label="Ngân sách phê duyệt"
                  defaultValue={value(initial ?? {}, "budget_minor") || "0"}
                  description="VND · Số tiền được lưu chính xác, dấu chấm chỉ dùng để dễ đọc."
                  required
                />
                {!initial ? (
                  <EditorField
                    name="starts_on"
                    label="Ngày bắt đầu"
                    type="date"
                    description="Ngày dự án chính thức bắt đầu triển khai."
                    required
                  />
                ) : null}
                <EditorField
                  name="ends_on"
                  label="Ngày kết thúc dự kiến"
                  type="date"
                  defaultValue={value(initial ?? {}, "ends_on")}
                  description="Có thể cập nhật thường xuyên khi kế hoạch bàn giao thay đổi."
                />
                <EditorTextareaField
                  name="notes"
                  label="Tình trạng / Ghi chú điều hành"
                  defaultValue={
                    value(initial ?? {}, "notes") || value(initial ?? {}, "description")
                  }
                  placeholder="Tiến độ hiện tại, việc đang chờ, rủi ro hoặc hành động tiếp theo…"
                  description="Thông tin ngắn để theo dõi tình hình dự án trong công việc hằng ngày."
                />
                <FieldSeparator>Thông tin định danh</FieldSeparator>
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
                <EditorField
                  name="default_service_line_code"
                  label="Mã mảng dịch vụ"
                  defaultValue={value(initial ?? {}, "default_service_line_code")}
                  placeholder="Ví dụ: SOFTWARE_DEV, WEB, CONSULTING"
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
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditorField({
  name,
  label,
  description,
  ...props
}: React.ComponentProps<typeof Input> & { name: string; label: string; description?: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={`directory-${name}`}>{label}</FieldLabel>
      <Input id={`directory-${name}`} name={name} {...props} />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function ProjectStateField({ defaultValue }: Readonly<{ defaultValue: string }>) {
  return (
    <Field>
      <FieldLabel>Trạng thái dự án</FieldLabel>
      <Select name="state" defaultValue={defaultValue}>
        <SelectTrigger aria-label="Trạng thái dự án">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {PROJECT_STATES.map((state) => (
              <SelectItem key={state.value} value={state.value}>
                {state.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>Cập nhật theo tình hình vận hành hiện tại của dự án.</FieldDescription>
    </Field>
  );
}

function MoneyEditorField({
  name,
  label,
  defaultValue,
  description,
  required,
}: Readonly<{
  name: string;
  label: string;
  defaultValue: string;
  description?: string;
  required?: boolean;
}>) {
  const [rawValue, setRawValue] = useState(() => digitsOnly(defaultValue));
  return (
    <Field>
      <FieldLabel htmlFor={`directory-${name}-display`}>{label}</FieldLabel>
      <Input
        id={`directory-${name}-display`}
        inputMode="numeric"
        value={formatInteger(rawValue)}
        onChange={(event) => setRawValue(digitsOnly(event.target.value))}
        required={required}
      />
      <input type="hidden" name={name} value={rawValue || "0"} />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function EditorTextareaField({
  name,
  label,
  description,
  ...props
}: React.ComponentProps<typeof Textarea> & {
  name: string;
  label: string;
  description?: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={`directory-${name}`}>{label}</FieldLabel>
      <Textarea id={`directory-${name}`} name={name} rows={4} {...props} />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}
