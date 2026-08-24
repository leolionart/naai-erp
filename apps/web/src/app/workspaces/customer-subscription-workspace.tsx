"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Pencil, Plus, RefreshCw, Settings2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuthenticatedApiClient } from "@/lib/api";
import { formatMinorVnd } from "@/lib/format/money";

type Row = Record<string, unknown>;
type SubscriptionStatus = "draft" | "active" | "paused" | "cancelled" | "expired";
type BillingInterval = "month" | "quarter" | "year";

type Party = Readonly<{ id: string; name: string }>;
type Project = Readonly<{ id: string; name: string; customerPartyId: string }>;
type ServicePlan = Readonly<{
  id: string;
  code: string;
  name: string;
  serviceLineCode?: string;
  defaultPriceMinor: string;
  currency: string;
  billingInterval: BillingInterval;
  intervalCount: string;
  billingDay: string;
  isActive: boolean;
  version?: string;
}>;
type Subscription = Readonly<{
  id: string;
  customerPartyId: string;
  servicePlanId: string;
  projectId?: string;
  quantity: string;
  unitPriceMinor: string;
  currency: string;
  billingInterval: BillingInterval;
  intervalCount: string;
  startsOn: string;
  endsOn?: string;
  status: SubscriptionStatus;
  version?: string;
  permittedNextActions: readonly string[];
}>;

const statusOptions = [
  { value: "all", label: "Tất cả trạng thái" },
  { value: "draft", label: "Bản nháp" },
  { value: "active", label: "Đang sử dụng" },
  { value: "paused", label: "Tạm dừng" },
  { value: "cancelled", label: "Đã hủy" },
  { value: "expired", label: "Hết hạn" },
] as const;

const intervalOptions = [
  { value: "month", label: "Tháng" },
  { value: "quarter", label: "Quý" },
  { value: "year", label: "Năm" },
] as const;

const value = (row: Row, ...keys: string[]) => {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return String(row[key]);
  return "";
};
const bool = (row: Row, ...keys: string[]) => {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return Boolean(row[key]);
  return false;
};
const items = (payload: readonly Row[] | { items?: readonly Row[] }) =>
  Array.isArray(payload) ? payload : ((payload as { items?: readonly Row[] }).items ?? []);
const labelFor = (options: readonly { value: string; label: string }[], selected: string) =>
  options.find((option) => option.value === selected)?.label ?? selected;
const dateLabel = (date?: string) =>
  date ? new Date(`${date}T00:00:00`).toLocaleDateString("vi-VN") : "—";
const digitsOnly = (input: string) => input.replace(/[^0-9]/g, "");
const formatInputMoney = (input: string) => {
  const digits = digitsOnly(input);
  return digits ? new Intl.NumberFormat("vi-VN").format(BigInt(digits)) : "";
};

function normalizePlan(row: Row): ServicePlan {
  return {
    id: value(row, "id"),
    code: value(row, "code"),
    name: value(row, "name"),
    serviceLineCode: value(row, "serviceLineCode", "service_line_code") || undefined,
    defaultPriceMinor: value(row, "defaultUnitPriceMinor", "default_unit_price_minor") || "0",
    currency: value(row, "currency") || "VND",
    billingInterval: (value((row.recurrence as Row | undefined) ?? {}, "frequency") ||
      "month") as BillingInterval,
    intervalCount: value((row.recurrence as Row | undefined) ?? {}, "interval") || "1",
    billingDay: value((row.recurrence as Row | undefined) ?? {}, "billingDay") || "1",
    isActive: bool(row, "active"),
    version: value(row, "version", "resourceVersion", "resource_version") || undefined,
  };
}

function normalizeSubscription(row: Row): Subscription {
  return {
    id: value(row, "id"),
    customerPartyId: value(row, "customerPartyId", "customer_party_id"),
    servicePlanId: value(row, "servicePlanId", "service_plan_id"),
    projectId: value(row, "projectId", "project_id") || undefined,
    quantity: value(row, "quantity") || "1",
    unitPriceMinor: value(row, "unitPriceMinor", "unit_price_minor") || "0",
    currency: value(row, "currency") || "VND",
    billingInterval: (value((row.recurrenceSnapshot as Row | undefined) ?? {}, "frequency") ||
      "month") as BillingInterval,
    intervalCount: value((row.recurrenceSnapshot as Row | undefined) ?? {}, "interval") || "1",
    startsOn: value(row, "startsOn", "starts_on"),
    endsOn: value(row, "endsOn", "ends_on") || undefined,
    status: (value(row, "lifecycle") || "draft") as SubscriptionStatus,
    version: value(row, "version", "resourceVersion", "resource_version") || undefined,
    permittedNextActions: Array.isArray(row.nextActions)
      ? row.nextActions.map(String)
      : Array.isArray(row.next_actions)
        ? row.next_actions.map(String)
        : [],
  };
}

export function CustomerSubscriptionWorkspace() {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [subscriptions, setSubscriptions] = useState<readonly Subscription[]>([]);
  const [plans, setPlans] = useState<readonly ServicePlan[]>([]);
  const [parties, setParties] = useState<readonly Party[]>([]);
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<Subscription | null | undefined>();
  const [planEditor, setPlanEditor] = useState<ServicePlan | null | undefined>();
  const [actionEditor, setActionEditor] = useState<{
    subscription: Subscription;
    action: string;
  }>();
  const [scheduleSubscription, setScheduleSubscription] = useState<Subscription>();

  const status = searchParams.get("status") ?? "all";
  const customerId = searchParams.get("customerId") ?? "all";
  const planId = searchParams.get("servicePlanId") ?? "all";
  const projectId = searchParams.get("projectId") ?? "all";

  const load = useCallback(async () => {
    if (!hydrated) return;
    if (!hasToken) {
      setError("Cần đăng nhập để quản lý dịch vụ định kỳ.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ limit: "500" });
      if (status !== "all") query.set("status", status);
      if (customerId !== "all") query.set("customerPartyId", customerId);
      if (planId !== "all") query.set("servicePlanId", planId);
      if (projectId !== "all") query.set("projectId", projectId);
      const [subscriptionResult, planResult, partyResult, roleResult, projectResult] =
        await Promise.all([
          client.data<readonly Row[] | { items?: readonly Row[] }>(
            `customer-service-subscriptions?${query}`,
          ),
          client.data<readonly Row[] | { items?: readonly Row[] }>("service-plans?limit=500"),
          client.data<readonly Row[] | { items?: readonly Row[] }>("master-data/parties?limit=500"),
          client.data<readonly Row[] | { items?: readonly Row[] }>(
            "master-data/party-roles?limit=500",
          ),
          client.data<readonly Row[] | { items?: readonly Row[] }>(
            "master-data/projects?limit=500",
          ),
        ]);
      const roles = items(roleResult);
      const clientIds = new Set(
        roles
          .filter((role) => value(role, "role") === "client")
          .map((role) => value(role, "partyId", "party_id")),
      );
      setSubscriptions(items(subscriptionResult).map(normalizeSubscription));
      setPlans(items(planResult).map(normalizePlan));
      setParties(
        items(partyResult)
          .filter((party) => clientIds.has(value(party, "id")))
          .map((party) => ({
            id: value(party, "id"),
            name: value(party, "businessName", "business_name", "name"),
          })),
      );
      setProjects(
        items(projectResult).map((project) => ({
          id: value(project, "id"),
          name: value(project, "name"),
          customerPartyId: value(project, "clientPartyId", "client_party_id"),
        })),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải dịch vụ định kỳ.");
    } finally {
      setLoading(false);
    }
  }, [client, customerId, hasToken, hydrated, planId, projectId, status]);

  useEffect(() => void load(), [load]);

  const partyNames = useMemo(
    () => new Map(parties.map((party) => [party.id, party.name])),
    [parties],
  );
  const planNames = useMemo(() => new Map(plans.map((plan) => [plan.id, plan.name])), [plans]);
  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const active = subscriptions.filter((item) => item.status === "active");
  const scheduledValue = active.reduce(
    (sum, item) => sum + BigInt(item.unitPriceMinor) * BigInt(item.quantity),
    0n,
  );
  const paused = subscriptions.filter((item) => item.status === "paused").length;

  function setFilter(name: string, selected: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (selected === "all") next.delete(name);
    else next.set(name, selected);
    if (name === "customerId") next.delete("projectId");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <CalendarClock />
        <AlertTitle>Lịch dịch vụ không phải doanh thu kế toán</AlertTitle>
        <AlertDescription>
          Giá trị dưới đây là lịch thương mại dự kiến; không tự xuất hóa đơn, ghi nhận doanh thu,
          công nợ hay thu tiền.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Tổng subscription"
          value={String(subscriptions.length)}
          description="Bao gồm cả lịch sử"
        />
        <MetricCard
          title="Đang sử dụng"
          value={String(active.length)}
          description="Subscription đang active"
        />
        <MetricCard
          title="Giá trị kỳ dự kiến"
          value={formatMinorVnd(scheduledValue)}
          description="Tổng giá trị của kỳ hiện tại"
        />
        <MetricCard
          title="Đang tạm dừng"
          value={String(paused)}
          description="Có thể tiếp tục khi khách dùng lại"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách dịch vụ khách hàng</CardTitle>
          <CardDescription>
            Lọc theo dữ liệu chuẩn của khách hàng, gói dịch vụ và dự án/hợp đồng.
          </CardDescription>
          <CardAction className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setEditor(null)}>
              <Plus data-icon="inline-start" /> Thêm subscription
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Select value={status} onValueChange={(next) => setFilter("status", next)}>
              <SelectTrigger aria-label="Lọc trạng thái">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select value={customerId} onValueChange={(next) => setFilter("customerId", next)}>
              <SelectTrigger aria-label="Lọc khách hàng">
                <SelectValue placeholder="Tất cả khách hàng" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Tất cả khách hàng</SelectItem>
                  {parties.map((party) => (
                    <SelectItem key={party.id} value={party.id}>
                      {party.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select value={planId} onValueChange={(next) => setFilter("servicePlanId", next)}>
              <SelectTrigger aria-label="Lọc gói dịch vụ">
                <SelectValue placeholder="Tất cả gói dịch vụ" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Tất cả gói dịch vụ</SelectItem>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select value={projectId} onValueChange={(next) => setFilter("projectId", next)}>
              <SelectTrigger aria-label="Lọc dự án">
                <SelectValue placeholder="Tất cả dự án" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Tất cả dự án</SelectItem>
                  {projects
                    .filter(
                      (project) => customerId === "all" || project.customerPartyId === customerId,
                    )
                    .map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw data-icon="inline-start" /> Làm mới
            </Button>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Không thể tải dữ liệu</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : subscriptions.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Chưa có dịch vụ định kỳ</EmptyTitle>
                <EmptyDescription>
                  Thêm subscription đầu tiên hoặc đổi bộ lọc để xem dữ liệu lịch sử.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>Dịch vụ</TableHead>
                    <TableHead>Dự án</TableHead>
                    <TableHead>Giá trị kỳ</TableHead>
                    <TableHead>Chu kỳ</TableHead>
                    <TableHead>Kỳ kế tiếp</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptions.map((subscription) => (
                    <TableRow key={subscription.id}>
                      <TableCell className="font-medium">
                        {partyNames.get(subscription.customerPartyId) ??
                          subscription.customerPartyId}
                      </TableCell>
                      <TableCell>
                        {planNames.get(subscription.servicePlanId) ?? subscription.servicePlanId}
                      </TableCell>
                      <TableCell>
                        {subscription.projectId
                          ? (projectNames.get(subscription.projectId) ?? subscription.projectId)
                          : "Không gắn dự án"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatMinorVnd(
                          BigInt(subscription.unitPriceMinor) * BigInt(subscription.quantity),
                        )}
                      </TableCell>
                      <TableCell>
                        Mỗi{" "}
                        {subscription.intervalCount !== "1" ? `${subscription.intervalCount} ` : ""}
                        {labelFor(intervalOptions, subscription.billingInterval).toLocaleLowerCase(
                          "vi",
                        )}
                      </TableCell>
                      <TableCell>
                        {["active", "draft"].includes(subscription.status) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setScheduleSubscription(subscription)}
                          >
                            Xem lịch
                          </Button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={subscription.status === "active" ? "secondary" : "outline"}>
                          {labelFor(statusOptions, subscription.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditor(subscription)}
                          >
                            <Pencil data-icon="inline-start" /> Sửa
                          </Button>
                          {actionsFor(subscription).map((action) => (
                            <Button
                              key={action}
                              variant="outline"
                              size="sm"
                              onClick={() => setActionEditor({ subscription, action })}
                            >
                              {actionLabel(action)}
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh mục gói dịch vụ</CardTitle>
          <CardDescription>
            Giá và chu kỳ mặc định; ngừng dùng vẫn giữ nguyên các subscription lịch sử.
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setPlanEditor(null)}>
              <Settings2 data-icon="inline-start" /> Thêm loại dịch vụ
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {plans.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Chưa có gói dịch vụ</EmptyTitle>
                <EmptyDescription>
                  Tạo gói để dùng làm mẫu khi đăng ký dịch vụ cho khách hàng.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã</TableHead>
                  <TableHead>Tên dịch vụ</TableHead>
                  <TableHead>Giá mặc định</TableHead>
                  <TableHead>Chu kỳ</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-mono">{plan.code}</TableCell>
                    <TableCell>{plan.name}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatMinorVnd(plan.defaultPriceMinor)}
                    </TableCell>
                    <TableCell>
                      Mỗi {plan.intervalCount !== "1" ? `${plan.intervalCount} ` : ""}
                      {labelFor(intervalOptions, plan.billingInterval).toLocaleLowerCase("vi")},
                      ngày {plan.billingDay}
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.isActive ? "secondary" : "outline"}>
                        {plan.isActive ? "Đang dùng" : "Ngừng dùng"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPlanEditor(plan)}>
                          <Pencil data-icon="inline-start" /> Sửa
                        </Button>
                        {plan.isActive ? <DeactivatePlanButton plan={plan} onSaved={load} /> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SubscriptionDialog
        initial={editor}
        open={editor !== undefined}
        parties={parties}
        plans={plans}
        projects={projects}
        onOpenChange={(open) => !open && setEditor(undefined)}
        onSaved={load}
      />
      <ServicePlanDialog
        initial={planEditor}
        open={planEditor !== undefined}
        onOpenChange={(open) => !open && setPlanEditor(undefined)}
        onSaved={load}
      />
      <LifecycleDialog
        selection={actionEditor}
        onOpenChange={(open) => !open && setActionEditor(undefined)}
        onSaved={load}
      />
      <SchedulePreviewDialog
        subscription={scheduleSubscription}
        onOpenChange={(open) => !open && setScheduleSubscription(undefined)}
      />
    </div>
  );
}

function DeactivatePlanButton({ plan, onSaved }: { plan: ServicePlan; onSaved(): Promise<void> }) {
  const { client } = useAuthenticatedApiClient();
  const [busy, setBusy] = useState(false);
  async function deactivate() {
    setBusy(true);
    try {
      await client.data(`service-plans/${encodeURIComponent(plan.id)}/deactivate`, {
        method: "POST",
        body: { schemaVersion: 1, reason: "Ngừng sử dụng gói dịch vụ từ giao diện quản trị" },
        ...(plan.version ? { expectedVersion: plan.version } : {}),
      });
      await onSaved();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={() => void deactivate()}>
      {busy ? "Đang xử lý…" : "Ngừng dùng"}
    </Button>
  );
}

function SchedulePreviewDialog({
  subscription,
  onOpenChange,
}: {
  subscription?: Subscription;
  onOpenChange(open: boolean): void;
}) {
  const { client } = useAuthenticatedApiClient();
  const [through, setThrough] = useState("");
  const [periods, setPeriods] = useState<readonly Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (subscription) {
      const date = new Date();
      date.setFullYear(date.getFullYear() + 1);
      setThrough(date.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }));
      setPeriods([]);
      setError("");
    }
  }, [subscription]);
  async function preview() {
    if (!subscription || !through) return;
    setLoading(true);
    setError("");
    try {
      const result = await client.data<{ accountingNeutral: true; periods: readonly Row[] }>(
        `customer-service-subscriptions/${encodeURIComponent(subscription.id)}/schedule-preview?through=${encodeURIComponent(through)}`,
      );
      setPeriods(result.periods ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tạo lịch dự kiến.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Dialog open={Boolean(subscription)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Lịch dịch vụ dự kiến</DialogTitle>
          <DialogDescription>
            Lịch thương mại để theo dõi; không phải hóa đơn, doanh thu, công nợ hoặc dòng tiền.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="schedule-through">Tạo lịch đến ngày</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="schedule-through"
                type="date"
                value={through}
                onChange={(event) => setThrough(event.target.value)}
              />
              <Button type="button" onClick={() => void preview()} disabled={loading}>
                {loading ? "Đang tạo…" : "Xem lịch"}
              </Button>
            </div>
          </Field>
        </FieldGroup>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {periods.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kỳ</TableHead>
                  <TableHead>Thời gian dịch vụ</TableHead>
                  <TableHead>Ngày tính phí</TableHead>
                  <TableHead className="text-right">Giá trị dự kiến</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((period) => (
                  <TableRow key={value(period, "sequence")}>
                    <TableCell>{value(period, "sequence")}</TableCell>
                    <TableCell>
                      {dateLabel(value(period, "serviceStartsOn"))} –{" "}
                      {dateLabel(value(period, "serviceEndsOn"))}
                    </TableCell>
                    <TableCell>{dateLabel(value(period, "billingOn"))}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMinorVnd(value(period, "scheduledValueMinor"))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Chưa tạo lịch</EmptyTitle>
              <EmptyDescription>Chọn ngày giới hạn rồi bấm Xem lịch.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({
  title,
  value: metricValue,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{metricValue}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
    </Card>
  );
}

function actionsFor(subscription: Subscription) {
  if (subscription.permittedNextActions.length)
    return subscription.permittedNextActions.filter(
      (action) => !["update", "schedule-preview", "expire"].includes(action),
    );
  if (subscription.status === "draft") return ["activate"];
  if (subscription.status === "active") return ["pause", "cancel"];
  if (subscription.status === "paused") return ["resume", "cancel"];
  return [];
}
const actionLabel = (action: string) =>
  ({ activate: "Kích hoạt", pause: "Tạm dừng", resume: "Tiếp tục", cancel: "Hủy" })[action] ??
  action;

function SubscriptionDialog({
  initial,
  open,
  parties,
  plans,
  projects,
  onOpenChange,
  onSaved,
}: {
  initial: Subscription | null | undefined;
  open: boolean;
  parties: readonly Party[];
  plans: readonly ServicePlan[];
  projects: readonly Project[];
  onOpenChange(open: boolean): void;
  onSaved(): Promise<void>;
}) {
  const { client } = useAuthenticatedApiClient();
  const [customerId, setCustomerId] = useState(initial?.customerPartyId ?? "");
  const [planId, setPlanId] = useState(initial?.servicePlanId ?? "");
  const [price, setPrice] = useState(formatInputMoney(initial?.unitPriceMinor ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setCustomerId(initial?.customerPartyId ?? "");
      setPlanId(initial?.servicePlanId ?? "");
      setPrice(formatInputMoney(initial?.unitPriceMinor ?? ""));
      setError("");
    }
  }, [initial, open]);
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const availableProjects = projects.filter((project) => project.customerPartyId === customerId);

  function choosePlan(next: string) {
    setPlanId(next);
    const plan = plans.find((item) => item.id === next);
    if (!initial && plan) setPrice(formatInputMoney(plan.defaultPriceMinor));
  }
  async function submit(formData: FormData) {
    const data = {
      schemaVersion: 1,
      customerPartyId: customerId,
      servicePlanId: planId,
      projectId:
        String(formData.get("project_id") ?? "none") === "none"
          ? null
          : String(formData.get("project_id")),
      quantity: String(formData.get("quantity") ?? "1"),
      unitPriceMinor: digitsOnly(price),
      currency: selectedPlan?.currency ?? initial?.currency ?? "VND",
      recurrence: {
        frequency: String(formData.get("billing_interval") ?? "month"),
        interval: Number(formData.get("interval_count") ?? "1"),
        billingDay: Number(formData.get("billing_day") ?? "1"),
      },
      startsOn: String(formData.get("starts_on") ?? ""),
      endsOn: String(formData.get("ends_on") ?? "") || null,
      reason: String(formData.get("reason") ?? "").trim(),
    };
    setBusy(true);
    setError("");
    try {
      await client.data(
        initial
          ? `customer-service-subscriptions/${encodeURIComponent(initial.id)}`
          : "customer-service-subscriptions",
        {
          method: initial ? "PATCH" : "POST",
          body: data,
          ...(initial?.version ? { expectedVersion: initial.version } : {}),
        },
      );
      await onSaved();
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu subscription.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Chỉnh sửa subscription" : "Thêm subscription"}</DialogTitle>
          <DialogDescription>
            Liên kết khách hàng, gói dịch vụ và dự án chuẩn. Subscription không tự tạo doanh thu.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel>Khách hàng</FieldLabel>
              <Select
                name="customer_party_id"
                value={customerId}
                onValueChange={setCustomerId}
                disabled={Boolean(initial)}
                required
              >
                <SelectTrigger aria-label="Khách hàng">
                  <SelectValue placeholder="Chọn khách hàng" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {parties.map((party) => (
                      <SelectItem key={party.id} value={party.id}>
                        {party.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Gói dịch vụ</FieldLabel>
              <Select
                name="service_plan_id"
                value={planId}
                onValueChange={choosePlan}
                disabled={Boolean(initial)}
                required
              >
                <SelectTrigger aria-label="Gói dịch vụ">
                  <SelectValue placeholder="Chọn gói dịch vụ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {plans
                      .filter((plan) => plan.isActive || plan.id === initial?.servicePlanId)
                      .map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Dự án / hợp đồng</FieldLabel>
              <Select
                name="project_id"
                defaultValue={initial?.projectId ?? "none"}
                disabled={!customerId}
              >
                <SelectTrigger aria-label="Dự án / hợp đồng">
                  <SelectValue placeholder="Không gắn dự án" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">Không gắn dự án</SelectItem>
                    {availableProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>Chỉ hiển thị dự án thuộc đúng khách hàng đã chọn.</FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="subscription-price">Đơn giá mỗi kỳ</FieldLabel>
                <Input
                  id="subscription-price"
                  inputMode="numeric"
                  value={price}
                  onChange={(event) => setPrice(formatInputMoney(event.target.value))}
                  required
                />
                <FieldDescription>VND, lưu chính xác theo đơn vị đồng.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="subscription-quantity">Số lượng</FieldLabel>
                <Input
                  id="subscription-quantity"
                  name="quantity"
                  inputMode="numeric"
                  defaultValue={initial?.quantity ?? "1"}
                  required
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel>Chu kỳ</FieldLabel>
                <Select
                  name="billing_interval"
                  defaultValue={
                    initial?.billingInterval ?? selectedPlan?.billingInterval ?? "month"
                  }
                >
                  <SelectTrigger aria-label="Chu kỳ">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {intervalOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="subscription-interval-count">Mỗi bao nhiêu chu kỳ</FieldLabel>
                <Input
                  id="subscription-interval-count"
                  name="interval_count"
                  inputMode="numeric"
                  defaultValue={initial?.intervalCount ?? selectedPlan?.intervalCount ?? "1"}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="subscription-billing-day">Ngày tính phí</FieldLabel>
                <Input
                  id="subscription-billing-day"
                  name="billing_day"
                  inputMode="numeric"
                  defaultValue={selectedPlan?.billingDay ?? "1"}
                  required
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="subscription-starts-on">Ngày bắt đầu</FieldLabel>
                <Input
                  id="subscription-starts-on"
                  name="starts_on"
                  type="date"
                  defaultValue={initial?.startsOn}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="subscription-ends-on">Ngày kết thúc</FieldLabel>
                <Input
                  id="subscription-ends-on"
                  name="ends_on"
                  type="date"
                  defaultValue={initial?.endsOn}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="subscription-reason">Lý do tạo/chỉnh sửa</FieldLabel>
              <Textarea id="subscription-reason" name="reason" required />
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
            <Button type="submit" disabled={busy || !customerId || !planId || !digitsOnly(price)}>
              {busy ? "Đang lưu…" : "Lưu subscription"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ServicePlanDialog({
  initial,
  open,
  onOpenChange,
  onSaved,
}: {
  initial: ServicePlan | null | undefined;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSaved(): Promise<void>;
}) {
  const { client } = useAuthenticatedApiClient();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setPrice(formatInputMoney(initial?.defaultPriceMinor ?? ""));
      setError("");
    }
  }, [initial, open]);
  async function submit() {
    const data = {
      schemaVersion: 1,
      name: name.trim(),
      defaultUnitPriceMinor: digitsOnly(price),
      ...(initial ? { reason: "Cập nhật gói dịch vụ từ giao diện quản trị" } : {}),
    };
    setBusy(true);
    setError("");
    try {
      await client.data(
        initial ? `service-plans/${encodeURIComponent(initial.id)}` : "service-plans",
        {
          method: initial ? "PATCH" : "POST",
          body: data,
          ...(initial?.version ? { expectedVersion: initial.version } : {}),
        },
      );
      await onSaved();
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu gói dịch vụ.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Sửa gói dịch vụ" : "Thêm gói dịch vụ"}</DialogTitle>
          <DialogDescription>
            {initial
              ? "Cập nhật tên và giá; mã, dòng dịch vụ và chu kỳ hiện có được giữ nguyên."
              : "Chỉ cần tên và giá. Mã gói được tự sinh; chu kỳ mặc định là hàng tháng."}
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="plan-name">Tên dịch vụ</FieldLabel>
              <Input
                id="plan-name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-price">Giá mặc định mỗi kỳ</FieldLabel>
              <Input
                id="plan-price"
                inputMode="numeric"
                value={price}
                onChange={(event) => setPrice(formatInputMoney(event.target.value))}
                required
              />
              <FieldDescription>
                Đơn vị VND, áp dụng cho mỗi {initial ? "kỳ hiện có" : "tháng"}.
              </FieldDescription>
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
            <Button type="submit" disabled={busy || !name.trim() || !digitsOnly(price)}>
              {busy ? "Đang lưu…" : "Lưu gói dịch vụ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LifecycleDialog({
  selection,
  onOpenChange,
  onSaved,
}: {
  selection?: { subscription: Subscription; action: string };
  onOpenChange(open: boolean): void;
  onSaved(): Promise<void>;
}) {
  const { client } = useAuthenticatedApiClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(formData: FormData) {
    if (!selection) return;
    setBusy(true);
    setError("");
    try {
      await client.data(
        `customer-service-subscriptions/${encodeURIComponent(selection.subscription.id)}/${selection.action}`,
        {
          method: "POST",
          body: {
            schemaVersion: 1,
            effectiveOn: String(formData.get("effective_on") ?? ""),
            reason: String(formData.get("reason") ?? "").trim(),
          },
          ...(selection.subscription.version
            ? { expectedVersion: selection.subscription.version }
            : {}),
        },
      );
      await onSaved();
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể đổi trạng thái.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={Boolean(selection)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {selection ? actionLabel(selection.action) : "Cập nhật trạng thái"} subscription
          </DialogTitle>
          <DialogDescription>
            Thay đổi có ngày hiệu lực và được lưu vào lịch sử kiểm toán; không tạo bút toán hay
            doanh thu.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="lifecycle-effective-on">Ngày hiệu lực</FieldLabel>
              <Input
                id="lifecycle-effective-on"
                name="effective_on"
                type="date"
                defaultValue={new Date().toLocaleDateString("en-CA", {
                  timeZone: "Asia/Ho_Chi_Minh",
                })}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="lifecycle-reason">Lý do</FieldLabel>
              <Textarea id="lifecycle-reason" name="reason" required />
            </Field>
          </FieldGroup>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Đang xử lý…" : "Xác nhận"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
