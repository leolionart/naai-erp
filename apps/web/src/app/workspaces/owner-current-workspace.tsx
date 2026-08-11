"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { MoneyCell } from "@/components/financial/money-cell";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAuthenticatedApiClient } from "@/lib/api";
import { formatIsoDate } from "@/lib/format";

type MovementType =
  "owner_paid_company_cost" | "owner_custody_cash" | "owner_personal_withdrawal" | "owner_funding";

type OwnerCurrentMovement = Readonly<{
  journalId: string;
  date: string;
  description: string;
  currency: string;
  state: string;
  movementType?: MovementType;
  proposedMovementType?: "company_repayment_to_owner" | null;
  reviewReason?: string;
  ownerDeltaMinor: string;
  companyFundsDeltaMinor: string;
  runningOwnerBalanceMinor?: string;
  ownerAccountCodes: readonly string[];
  needsReview: boolean;
  classificationBasis?: string | null;
  settlementDeltaMinor?: string;
  runningConfirmedSettlementBalanceMinor?: string;
  sources: readonly Readonly<{
    sourceType: "expense" | "purchase_invoice";
    sourceId: string;
    title: string;
    detail: string | null;
    sourceHref: string;
    expenseClass: string | null;
    category: string | null;
    citState: string | null;
    vatState: string | null;
    grossMinor: string;
    payeeName: string | null;
  }>[];
}>;

type OwnerCurrentResponse = Readonly<{
  summary: Readonly<{
    statutoryOwnerCurrentBalanceMinor: string;
    confirmedSettlementBalanceMinor: string;
    companyOwesOwnerMinor: string;
    ownerHoldsCompanyFundsMinor: string;
    ownerPaidCompanyCostMinor: string;
    ownerCustodyCashMinor: string;
    ownerPersonalWithdrawalMinor: string;
    ownerFundingMinor: string;
    reviewMinor: string;
    reviewCount: number;
  }>;
  confirmedTimeline: readonly OwnerCurrentMovement[];
  reviewItems: readonly OwnerCurrentMovement[];
}>;

type FinancialAccount = Readonly<{
  id: string;
  display_name?: string;
  displayName?: string;
  currency: string;
  status: "active" | "inactive";
}>;

function accountItems(payload: unknown): FinancialAccount[] {
  if (Array.isArray(payload)) return payload as FinancialAccount[];
  if (!payload || typeof payload !== "object") return [];
  const items = (payload as { items?: unknown }).items;
  return Array.isArray(items) ? (items as FinancialAccount[]) : [];
}

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formattedVndInput(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits ? new Intl.NumberFormat("vi-VN").format(BigInt(digits)) : "";
}

const labels: Record<MovementType, string> = {
  owner_paid_company_cost: "Chủ trả chi phí công ty",
  owner_custody_cash: "Tiền công ty chủ đang giữ",
  owner_personal_withdrawal: "Chủ rút tiền dùng cá nhân",
  owner_funding: "Chủ đưa tiền vào công ty",
};

const classificationLabels: Record<string, string> = {
  canonical_owner_paid_expense: "Chi phí xác nhận chủ đã thanh toán",
  canonical_owner_custody_receipt: "Tiền công ty được giao cho chủ giữ",
  company_funds_withdrawn_by_owner: "Chủ đã rút tiền công ty dùng cá nhân",
  owner_funding_to_company_funds: "Chủ chuyển tiền vào quỹ/tài khoản công ty",
};

export function filterOwnerCurrentMovements(
  rows: readonly OwnerCurrentMovement[],
  type: MovementType | "all",
  query: string,
) {
  const normalized = query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (type === "all" || row.movementType === type) &&
      (!normalized || JSON.stringify(row).toLowerCase().includes(normalized)),
  );
}

export function OwnerCurrentWorkspace() {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [data, setData] = useState<OwnerCurrentResponse>();
  const [error, setError] = useState("");
  const [type, setType] = useState<MovementType | "all">("all");
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [withdrawalDialog, setWithdrawalDialog] = useState(false);
  const [withdrawalBusy, setWithdrawalBusy] = useState(false);
  const [withdrawalNotice, setWithdrawalNotice] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");

  const load = useCallback(async () => {
    if (!hydrated || !hasToken) return;
    try {
      const [position, accountPayload] = await Promise.all([
        client.data<OwnerCurrentResponse>("banking/owner-current-movements"),
        client.data<unknown>("banking/accounts"),
      ]);
      setData(position);
      setAccounts(accountItems(accountPayload).filter((account) => account.status === "active"));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tải công nợ chủ.");
    }
  }, [client, hasToken, hydrated]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createOwnerWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const financialAccountId = String(form.get("financialAccountId") ?? "");
    const account = accounts.find((item) => item.id === financialAccountId);
    const amountMinor = withdrawalAmount.replace(/\D/g, "");
    if (!account || !amountMinor || BigInt(amountMinor) <= 0n) {
      setError("Vui lòng chọn tài khoản nguồn và nhập số tiền rút lớn hơn 0.");
      return;
    }
    setWithdrawalBusy(true);
    setError("");
    try {
      await client.data("banking/owner-cash-withdrawals", {
        method: "POST",
        body: {
          schemaVersion: 1,
          movementType: "owner_personal_withdrawal",
          financialAccountId,
          bookingDate: form.get("bookingDate"),
          amountMinor,
          currency: account.currency,
          description: form.get("description"),
          reason: "Chủ doanh nghiệp xác nhận khoản rút tiền thực tế",
        },
      });
      setWithdrawalDialog(false);
      setWithdrawalAmount("");
      setWithdrawalNotice("Đã ghi nhận khoản chủ rút tiền và cập nhật công nợ chủ.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể ghi nhận khoản rút tiền.");
    } finally {
      setWithdrawalBusy(false);
    }
  }

  const rows = useMemo(
    () => filterOwnerCurrentMovements(data?.confirmedTimeline ?? [], type, query),
    [data?.confirmedTimeline, query, type],
  );
  const columns: readonly FinancialColumn<OwnerCurrentMovement>[] = [
    { id: "date", header: "Ngày", cell: (row) => formatIsoDate(row.date) },
    {
      id: "description",
      header: "Bút toán / cơ sở",
      cell: (row) => {
        const sources = row.sources ?? [];
        return (
          <div className="flex min-w-72 flex-col gap-1.5">
            {sources.length ? (
              <>
                {sources.map((source) => (
                  <div
                    className="flex flex-col gap-1"
                    key={`${source.sourceType}:${source.sourceId}`}
                  >
                    <Link className="font-medium hover:underline" href={source.sourceHref}>
                      {source.title || row.description}
                    </Link>
                    {source.detail && source.detail !== source.title ? (
                      <span className="text-xs text-muted-foreground">{source.detail}</span>
                    ) : null}
                    {source.payeeName ? (
                      <span className="text-xs text-muted-foreground">{source.payeeName}</span>
                    ) : null}
                  </div>
                ))}
                <Link
                  className="text-xs text-muted-foreground hover:underline"
                  href={`/accounting/journals?journalId=${encodeURIComponent(row.journalId)}`}
                >
                  Xem bút toán {row.journalId}
                </Link>
              </>
            ) : row.movementType === "owner_paid_company_cost" ? (
              <>
                <span className="text-xs font-medium text-amber-700">
                  Chưa liên kết nguồn chi phí
                </span>
                <Link
                  className="font-medium hover:underline"
                  href={`/accounting/journals?journalId=${encodeURIComponent(row.journalId)}`}
                >
                  {row.description}
                </Link>
                <span className="font-mono text-xs text-muted-foreground">{row.journalId}</span>
              </>
            ) : (
              <>
                <Link
                  className="font-medium hover:underline"
                  href={`/accounting/journals?journalId=${encodeURIComponent(row.journalId)}`}
                >
                  {row.description}
                </Link>
                <span className="font-mono text-xs text-muted-foreground">{row.journalId}</span>
              </>
            )}
          </div>
        );
      },
    },
    {
      id: "type",
      header: "Phân loại",
      cell: (row) => (
        <div className="flex min-w-48 flex-col items-start gap-1">
          <Badge variant={row.needsReview ? "destructive" : "outline"}>
            {row.movementType
              ? labels[row.movementType]
              : row.proposedMovementType === "company_repayment_to_owner"
                ? "Đề xuất hoàn trả cho chủ"
                : "Chưa phân loại"}
          </Badge>
          {row.classificationBasis ? (
            <span className="text-xs text-muted-foreground">
              {classificationLabels[row.classificationBasis] ?? row.classificationBasis}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: "delta",
      header: "Tăng/(giảm) quyết toán với chủ",
      align: "right",
      cell: (row) => <MoneyCell minor={row.settlementDeltaMinor ?? row.ownerDeltaMinor} />,
    },
    {
      id: "cash",
      header: "Tăng/(giảm) tiền công ty",
      align: "right",
      cell: (row) => <MoneyCell minor={row.companyFundsDeltaMinor} />,
    },
    {
      id: "balance",
      header: "Dư quyết toán xác nhận",
      align: "right",
      cell: (row) =>
        row.needsReview ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <MoneyCell
            minor={
              row.runningConfirmedSettlementBalanceMinor ?? row.runningOwnerBalanceMinor ?? "0"
            }
          />
        ),
    },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 text-sm text-muted-foreground">
          {withdrawalNotice || "Các khoản bên dưới chỉ gồm biến động tiền với chủ đã xác nhận."}
        </p>
        <Button
          className="w-full sm:w-auto"
          onClick={() => setWithdrawalDialog(true)}
          disabled={!accounts.length}
        >
          <PlusIcon data-icon="inline-start" />
          Ghi nhận chủ rút tiền
        </Button>
      </div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader>
            <CardDescription>Công ty đang nợ chủ</CardDescription>
            <CardTitle>
              <MoneyCell minor={data?.summary.companyOwesOwnerMinor ?? "0"} />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardDescription>Tiền công ty chủ đang giữ</CardDescription>
            <CardTitle>
              <MoneyCell minor={data?.summary.ownerHoldsCompanyFundsMinor ?? "0"} />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="min-w-0 sm:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardDescription>Chủ đã chi phí cho công ty</CardDescription>
            <CardTitle>
              <MoneyCell minor={data?.summary.ownerPaidCompanyCostMinor ?? "0"} />
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="min-w-0" data-testid="confirmed-owner-current">
        <CardHeader className="min-w-0">
          <CardTitle>Dòng quyết toán tiền giữa công ty và chủ đã xác nhận</CardTitle>
          <CardDescription>
            Phân biệt chi phí chủ đã trả, tiền công ty giao chủ giữ, tiền chủ rút dùng cá nhân và
            tiền chủ đưa vào công ty. Số dư dương là công ty nợ chủ; số dư âm là chủ đang giữ tiền
            công ty.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-4">
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="owner-current-type">Loại biến động</FieldLabel>
              <Select
                value={type}
                onValueChange={(value) => setType(value as MovementType | "all")}
              >
                <SelectTrigger id="owner-current-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả biến động</SelectItem>
                  <SelectItem value="owner_paid_company_cost">Chủ trả chi phí công ty</SelectItem>
                  <SelectItem value="owner_custody_cash">Tiền công ty chủ đang giữ</SelectItem>
                  <SelectItem value="owner_personal_withdrawal">
                    Chủ rút tiền dùng cá nhân
                  </SelectItem>
                  <SelectItem value="owner_funding">Chủ đưa tiền vào công ty</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="owner-current-query">Tìm bút toán</FieldLabel>
              <Input
                id="owner-current-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nội dung hoặc journal ID"
              />
            </Field>
          </div>
          <div className="min-w-0" data-testid="owner-current-table-scroll">
            <FinancialDataTable
              rows={rows}
              columns={columns}
              rowKey={(row) => row.journalId}
              error={error || undefined}
              loading={!data && !error}
              emptyTitle="Không có khoản phù hợp"
              emptyDescription="Không có bút toán đã ghi sổ phù hợp với bộ lọc. Nếu nguồn tiền có thật nhưng không xuất hiện, cần kiểm tra lại việc ghi nhận hoặc mapping tài khoản Owner Current."
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={withdrawalDialog} onOpenChange={setWithdrawalDialog}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <form className="flex flex-col gap-6" onSubmit={createOwnerWithdrawal}>
            <DialogHeader>
              <DialogTitle>Ghi nhận chủ rút tiền</DialogTitle>
              <DialogDescription>
                Ghi nhận khoản tiền công ty đã giao cho chủ dùng cá nhân. Hệ thống tự tạo giao dịch
                tiền và bút toán Owner Current cân bằng.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="owner-withdrawal-date">Ngày rút</FieldLabel>
                <Input
                  id="owner-withdrawal-date"
                  name="bookingDate"
                  type="date"
                  defaultValue={todayLocal()}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="owner-withdrawal-account">Rút từ tài khoản</FieldLabel>
                <Select name="financialAccountId" required>
                  <SelectTrigger id="owner-withdrawal-account">
                    <SelectValue placeholder="Chọn tài khoản ngân hàng hoặc quỹ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.displayName ?? account.display_name ?? account.id} ·{" "}
                          {account.currency}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="owner-withdrawal-amount">Số tiền</FieldLabel>
                <Input
                  id="owner-withdrawal-amount"
                  inputMode="numeric"
                  value={withdrawalAmount}
                  onChange={(event) => setWithdrawalAmount(formattedVndInput(event.target.value))}
                  placeholder="0 ₫"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="owner-withdrawal-description">Ghi chú</FieldLabel>
                <Textarea
                  id="owner-withdrawal-description"
                  name="description"
                  placeholder="Ví dụ: Chủ rút tiền dùng cá nhân"
                  required
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setWithdrawalDialog(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={withdrawalBusy}>
                {withdrawalBusy ? <Spinner /> : null}
                Ghi nhận khoản rút
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
