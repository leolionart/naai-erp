"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { MoneyCell } from "@/components/financial/money-cell";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthenticatedApiClient } from "@/lib/api";
import { formatIsoDate } from "@/lib/format";

type MovementType =
  "owner_paid_company_cost" | "owner_funding" | "company_repayment_to_owner" | "adjustment";

type OwnerCurrentMovement = Readonly<{
  recordKind?: "ledger" | "expense";
  expenseId?: string;
  journalId: string;
  date: string;
  description: string;
  currency: string;
  state: string;
  movementType: MovementType;
  ownerDeltaMinor: string;
  companyFundsDeltaMinor: string;
  runningOwnerBalanceMinor: string;
  ownerAccountCodes: readonly string[];
  needsReview: boolean;
  classificationBasis: string | null;
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
    increaseMinor: string;
    decreaseMinor: string;
    closingBalanceMinor: string;
    ownerPaidCompanyCostMinor: string;
    companyRepaymentToOwnerMinor: string;
    ownerFundingMinor: string;
    adjustmentMinor: string;
    needsReviewCount: number;
  }>;
  items: readonly OwnerCurrentMovement[];
}>;

type OwnerPaidExpense = Readonly<Record<string, unknown>>;

const labels: Record<MovementType, string> = {
  owner_paid_company_cost: "Chủ trả chi phí công ty",
  owner_funding: "Chủ đưa tiền vào công ty",
  company_repayment_to_owner: "Công ty trả nợ chủ",
  adjustment: "Điều chỉnh công nợ chủ",
};

const classificationLabels: Record<string, string> = {
  canonical_owner_paid_source: "Nguồn chi phí xác nhận chủ chi hộ",
  owner_funding_to_company_funds: "Chủ chuyển tiền vào quỹ/tài khoản công ty",
  company_funds_repayment_to_owner: "Tiền công ty giảm đồng thời công nợ chủ giảm",
  unresolved_owner_current_movement: "Chưa đủ đối ứng để phân loại",
};

function field(row: OwnerPaidExpense, ...names: string[]) {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null) return String(value);
  }
  return "";
}

export function toOwnerPaidMovement(expense: OwnerPaidExpense): OwnerCurrentMovement {
  const expenseId = field(expense, "id");
  const grossMinor = field(expense, "grossMinor", "gross_minor") || "0";
  const purpose = field(expense, "businessPurpose", "business_purpose") || `Chi phí ${expenseId}`;
  return {
    recordKind: "expense",
    expenseId,
    journalId: field(expense, "journalId", "journal_id") || expenseId,
    date: field(expense, "expenseDate", "expense_date"),
    description: purpose,
    currency: field(expense, "currency") || "VND",
    state: field(expense, "state"),
    movementType: "owner_paid_company_cost",
    ownerDeltaMinor: grossMinor,
    companyFundsDeltaMinor: "0",
    runningOwnerBalanceMinor: "0",
    ownerAccountCodes: [],
    needsReview: false,
    classificationBasis: "canonical_owner_paid_source",
    sources: [
      {
        sourceType: "expense",
        sourceId: expenseId,
        title: purpose,
        detail: null,
        sourceHref: `/expenses/${expenseId}`,
        expenseClass: field(expense, "expenseClass", "expense_class") || null,
        category: field(expense, "category") || null,
        citState: field(expense, "citState", "cit_state") || null,
        vatState: field(expense, "vatState", "vat_state") || null,
        grossMinor,
        payeeName: null,
      },
    ],
  };
}

export function totalOwnerPaidExpenses(expenses: readonly OwnerPaidExpense[]) {
  return expenses
    .reduce(
      (total, expense) => total + BigInt(field(expense, "grossMinor", "gross_minor") || "0"),
      0n,
    )
    .toString();
}

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
  const [ownerPaidExpenses, setOwnerPaidExpenses] = useState<readonly OwnerPaidExpense[]>([]);
  const [error, setError] = useState("");
  const [type, setType] = useState<MovementType | "all">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!hydrated || !hasToken) return;
    void Promise.all([
      client.data<OwnerCurrentResponse>("banking/owner-current-movements"),
      client.data<{ items?: readonly OwnerPaidExpense[] } | readonly OwnerPaidExpense[]>(
        "expenses?state=posted&fundingTreatment=owner_paid_company_cost",
      ),
    ])
      .then(([ledger, expenses]) => {
        setData(ledger);
        setOwnerPaidExpenses(
          Array.isArray(expenses)
            ? expenses
            : ((expenses as { items?: readonly OwnerPaidExpense[] }).items ?? []),
        );
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Không thể tải công nợ chủ."),
      );
  }, [client, hasToken, hydrated]);

  const canonicalOwnerPaidRows = useMemo(
    () => ownerPaidExpenses.map(toOwnerPaidMovement),
    [ownerPaidExpenses],
  );
  const rows = useMemo(() => {
    const ledgerRows = (data?.items ?? []).filter(
      (row) => row.movementType !== "owner_paid_company_cost",
    );
    return filterOwnerCurrentMovements([...canonicalOwnerPaidRows, ...ledgerRows], type, query);
  }, [canonicalOwnerPaidRows, data?.items, query, type]);
  const ownerPaidSubtotal = useMemo(
    () => totalOwnerPaidExpenses(ownerPaidExpenses),
    [ownerPaidExpenses],
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
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {source.payeeName ? <span>{source.payeeName}</span> : null}
                      {source.category ? (
                        <Badge variant="secondary">{source.category}</Badge>
                      ) : null}
                      {source.expenseClass ? (
                        <Badge variant="outline">{source.expenseClass}</Badge>
                      ) : null}
                      {source.citState ? (
                        <Badge variant="outline">TNDN: {source.citState}</Badge>
                      ) : null}
                      {source.vatState ? (
                        <Badge variant="outline">VAT: {source.vatState}</Badge>
                      ) : null}
                    </div>
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
            {labels[row.movementType]}
          </Badge>
          {row.classificationBasis ? (
            <span className="text-xs text-muted-foreground">
              {classificationLabels[row.classificationBasis] ?? row.classificationBasis}
            </span>
          ) : null}
          {row.needsReview ? (
            <span className="text-xs font-medium text-destructive">Cần kiểm tra phân loại</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "delta",
      header: "Tăng/(giảm) nợ chủ",
      align: "right",
      cell: (row) => <MoneyCell minor={row.ownerDeltaMinor} />,
    },
    {
      id: "cash",
      header: "Tăng/(giảm) tiền công ty",
      align: "right",
      cell: (row) => <MoneyCell minor={row.companyFundsDeltaMinor} />,
    },
    {
      id: "balance",
      header: "Dư nợ chủ sau bút toán",
      align: "right",
      cell: (row) =>
        row.recordKind === "expense" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <MoneyCell minor={row.runningOwnerBalanceMinor} />
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Chủ đã chi trả cho công ty</CardDescription>
            <CardTitle>
              <MoneyCell minor={ownerPaidSubtotal} />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Công ty đã trả nợ chủ</CardDescription>
            <CardTitle>
              <MoneyCell minor={data?.summary.companyRepaymentToOwnerMinor ?? "0"} />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Dư công nợ chủ hiện tại</CardDescription>
            <CardTitle>
              <MoneyCell minor={data?.summary.closingBalanceMinor ?? "0"} />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Khoản cần kiểm tra phân loại</CardDescription>
            <CardTitle>{data?.summary.needsReviewCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {data &&
      data.summary.companyRepaymentToOwnerMinor === "0" &&
      data.summary.closingBalanceMinor !== "0" ? (
        <Alert variant="destructive">
          <AlertTitle>Chưa có bút toán giảm công nợ chủ</AlertTitle>
          <AlertDescription>
            Sổ hiện chỉ có các khoản làm tăng số tiền công ty nợ chủ. Nếu chủ đã rút hoặc nhận tiền
            từ công ty, các khoản đó chưa được ghi nhận đúng đối ứng Owner Current và tài khoản
            tiền.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Cơ sở hình thành công nợ chủ doanh nghiệp</CardTitle>
          <CardDescription>
            Đọc từ sổ cái đã ghi sổ. Giá trị dương làm tăng số công ty nợ chủ; giá trị âm làm giảm
            số nợ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
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
                  <SelectItem value="company_repayment_to_owner">Công ty trả nợ chủ</SelectItem>
                  <SelectItem value="owner_paid_company_cost">Chủ trả chi phí công ty</SelectItem>
                  <SelectItem value="owner_funding">Chủ đưa tiền vào công ty</SelectItem>
                  <SelectItem value="adjustment">Điều chỉnh khác</SelectItem>
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
          <FinancialDataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.journalId}
            error={error || undefined}
            loading={!data && !error}
            emptyTitle="Không có khoản phù hợp"
            emptyDescription="Không có bút toán đã ghi sổ phù hợp với bộ lọc. Nếu nguồn tiền có thật nhưng không xuất hiện, cần kiểm tra lại việc ghi nhận hoặc mapping tài khoản Owner Current."
          />
        </CardContent>
      </Card>
    </div>
  );
}
