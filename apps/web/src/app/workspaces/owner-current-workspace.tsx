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
  "owner_paid_company_cost" | "owner_funding" | "company_payment_to_owner" | "adjustment";

type OwnerCurrentMovement = Readonly<{
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
  }>;
  items: readonly OwnerCurrentMovement[];
}>;

const labels: Record<MovementType, string> = {
  owner_paid_company_cost: "Chủ trả chi phí công ty",
  owner_funding: "Chủ đưa tiền vào công ty",
  company_payment_to_owner: "Công ty chuyển/rút tiền cho chủ",
  adjustment: "Điều chỉnh công nợ chủ",
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

  useEffect(() => {
    if (!hydrated || !hasToken) return;
    void client
      .data<OwnerCurrentResponse>("banking/owner-current-movements")
      .then(setData)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Không thể tải công nợ chủ."),
      );
  }, [client, hasToken, hydrated]);

  const rows = useMemo(
    () => filterOwnerCurrentMovements(data?.items ?? [], type, query),
    [data?.items, query, type],
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
            ) : (
              <>
                <span className="text-xs font-medium text-amber-700">Chưa liên kết chi phí</span>
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
      cell: (row) => <Badge variant="outline">{labels[row.movementType]}</Badge>,
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
      cell: (row) => <MoneyCell minor={row.runningOwnerBalanceMinor} />,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Tăng công nợ chủ</CardDescription>
            <CardTitle>
              <MoneyCell minor={data?.summary.increaseMinor ?? "0"} />
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Tiền đã trả/rút cho chủ</CardDescription>
            <CardTitle>
              <MoneyCell minor={data?.summary.decreaseMinor ?? "0"} />
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
      </div>

      {data && data.summary.decreaseMinor === "0" && data.summary.closingBalanceMinor !== "0" ? (
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
                  <SelectItem value="company_payment_to_owner">
                    Công ty chuyển/rút tiền cho chủ
                  </SelectItem>
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
