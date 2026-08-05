import Link from "next/link";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { MoneyCell } from "@/components/financial/money-cell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type JsonRow = Record<string, unknown>;

export function rowText(row: JsonRow | undefined, ...names: string[]): string {
  if (!row) return "";
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "";
}

export function CandidateConfidence({ bps }: Readonly<{ bps: number }>) {
  const tone = bps >= 9000 ? "default" : bps >= 7000 ? "secondary" : "outline";
  return <Badge variant={tone}>{(bps / 100).toFixed(2)}%</Badge>;
}

export function ExplainableFactors({ factors }: Readonly<{ factors: unknown }>) {
  const entries =
    factors && typeof factors === "object" && !Array.isArray(factors)
      ? Object.entries(factors as Record<string, unknown>)
      : [];
  if (!entries.length)
    return <span className="text-sm text-muted-foreground">Không có factor.</span>;
  return (
    <div className="flex flex-wrap gap-2" aria-label="Các yếu tố confidence">
      {entries.map(([name, value]) => (
        <Badge variant="outline" key={name}>
          {name.replaceAll("_", " ")}:{" "}
          {typeof value === "object" ? JSON.stringify(value) : String(value)}
        </Badge>
      ))}
    </div>
  );
}

export function ReconciliationControlTotals({ detail }: Readonly<{ detail?: JsonRow }>) {
  const totals = (detail?.controlTotals ?? detail?.control_totals ?? detail) as JsonRow | undefined;
  const items = [
    ["Bank base amount", rowText(totals, "bankBaseAmountMinor", "transactionAmountMinor")],
    ["Đã phân bổ", rowText(totals, "allocatedBaseMinor", "allocationTotalMinor")],
    ["Phí ngân hàng", rowText(totals, "feeBaseMinor", "bankFeeMinor")],
    ["Chênh lệch FX", rowText(totals, "fxBaseMinor", "fxAdjustmentMinor")],
    ["Suspense", rowText(totals, "suspenseBaseMinor")],
    ["Còn lại", rowText(totals, "remainingBaseMinor", "unallocatedBaseMinor")],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Control totals từ API</CardTitle>
        <CardDescription>
          Frontend không tự tính lại số dư hoặc chênh lệch tài chính.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(([label, value]) => (
          <div className="flex flex-col gap-1 rounded-md border p-3" key={label}>
            <span className="text-xs text-muted-foreground">{label}</span>
            {value ? (
              <MoneyCell minor={value} className="text-left font-medium" />
            ) : (
              <span className="font-medium">—</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ReconciliationJournalPreview({ detail }: Readonly<{ detail?: JsonRow }>) {
  const journal = (detail?.journalPreview ?? detail?.journal_preview ?? detail?.journal) as
    JsonRow | undefined;
  const linesValue = journal?.lines;
  const lines = Array.isArray(linesValue) ? (linesValue as JsonRow[]) : [];
  const columns: readonly FinancialColumn<JsonRow>[] = [
    {
      id: "account",
      header: "Tài khoản",
      cell: (row) => rowText(row, "accountCode", "accountId") || "—",
    },
    { id: "description", header: "Diễn giải", cell: (row) => rowText(row, "description") || "—" },
    {
      id: "debit",
      header: "Nợ",
      align: "right",
      cell: (row) => <MoneyCell minor={rowText(row, "debitMinor") || "0"} />,
    },
    {
      id: "credit",
      header: "Có",
      align: "right",
      cell: (row) => <MoneyCell minor={rowText(row, "creditMinor") || "0"} />,
    },
  ];
  const drilldown = detail?.drilldown as JsonRow | undefined;
  const journalId =
    rowText(detail, "journalId") || rowText(journal, "id") || rowText(drilldown, "journalId");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Journal preview và drill-down</CardTitle>
        <CardDescription>
          {journalId ? (
            <Link
              className="underline underline-offset-4"
              href={`/accounting/journals?journalId=${encodeURIComponent(journalId)}`}
            >
              Journal {journalId}
            </Link>
          ) : (
            "Journal ID xuất hiện sau khi API tạo hoặc ghi sổ đối soát."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FinancialDataTable
          rows={lines}
          columns={columns}
          rowKey={(row) => rowText(row, "id") || JSON.stringify(row)}
          emptyTitle="Chưa có journal preview"
          emptyDescription="Chạy match hoặc tải reconciliation để xem bút toán do API sinh."
        />
      </CardContent>
    </Card>
  );
}
