import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

export type FinancialColumn<Row> = Readonly<{
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right";
}>;

export function FinancialDataTable<Row>({
  rows,
  columns,
  rowKey,
  loading = false,
  error,
  emptyTitle = "Chưa có dữ liệu",
  emptyDescription = "Dữ liệu sẽ xuất hiện sau khi được ghi nhận.",
}: Readonly<{
  rows: readonly Row[];
  columns: readonly FinancialColumn<Row>[];
  rowKey: (row: Row) => string;
  loading?: boolean;
  error?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}>) {
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Không thể tải dữ liệu</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-label="Đang tải dữ liệu">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="h-10 w-full" key={index} />
        ))}
      </div>
    );
  }
  if (!rows.length) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                className={column.align === "right" ? "text-right" : undefined}
                key={column.id}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((column) => (
                <TableCell
                  className={column.align === "right" ? "text-right tabular-nums" : undefined}
                  key={column.id}
                >
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
