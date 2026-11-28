"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Download, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PeriodRangeNavigator } from "@/components/layout/period-range-navigator";
import { Spinner } from "@/components/ui/spinner";
import { TableHead } from "@/components/ui/table";
import { FilterPopover } from "./focused-record-filter-popover";
import {
  EXPENSE_COST_MODE_OPTIONS,
  type ExpenseCostMode,
  type FilteredExpenseSummary,
} from "./focused-record-cost-mode";
import { money, type Kind } from "./focused-record-shared";

export function FocusedRecordToolbar({
  kind,
  totalCount,
  unfilteredCount,
  visibleCount,
  paramsKey,
  costMode = "all",
  onCostModeChange,
  expenseSummary,
  filtersOpen,
  onFiltersOpenChange,
  onApplyFilters,
  onSearch,
  hasToken,
  exporting,
  onExport,
  onOpenCreate,
}: {
  kind: Kind;
  totalCount: number;
  unfilteredCount?: number;
  visibleCount: number;
  paramsKey: string;
  costMode?: ExpenseCostMode;
  onCostModeChange?(mode: ExpenseCostMode): void;
  expenseSummary?: FilteredExpenseSummary;
  filtersOpen: boolean;
  onFiltersOpenChange(open: boolean): void;
  onApplyFilters(data: FormData): void;
  onSearch(query: string): void;
  hasToken: boolean;
  exporting: boolean;
  onExport(): void;
  onOpenCreate(): void;
}) {
  const urlQuery = new URLSearchParams(paramsKey).get("q") ?? "";
  const [searchValue, setSearchValue] = useState(urlQuery);

  useEffect(() => {
    setSearchValue(urlQuery);
  }, [urlQuery]);

  const countText =
    visibleCount < totalCount
      ? `${visibleCount} / ${totalCount}`
      : unfilteredCount !== undefined && totalCount < unfilteredCount
        ? `${totalCount} / ${unfilteredCount}`
        : `${totalCount}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge variant="secondary" className="text-xs font-normal tabular-nums">
          {countText} bản ghi
        </Badge>
        {kind === "expenses" && expenseSummary ? (
          <Badge
            variant="outline"
            className="text-xs font-medium tabular-nums"
            title={
              expenseSummary.postedMinor !== expenseSummary.totalMinor
                ? `Tổng gồm bản chưa ghi sổ: ${money(expenseSummary.totalMinor.toString())}`
                : undefined
            }
          >
            {expenseSummary.postedMinor === expenseSummary.totalMinor
              ? `Tổng: ${money(expenseSummary.totalMinor.toString())}`
              : `Đã ghi sổ: ${money(expenseSummary.postedMinor.toString())}`}
          </Badge>
        ) : null}
        <PeriodRangeNavigator />
        {kind === "expenses" && onCostModeChange ? (
          <div
            role="group"
            aria-label="Chế độ xem chi phí"
            className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5"
          >
            {EXPENSE_COST_MODE_OPTIONS.map((option) => {
              const active = costMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onCostModeChange(option.value)}
                  className="min-h-7 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&[aria-pressed=true]]:bg-background [&[aria-pressed=true]]:text-foreground [&[aria-pressed=true]]:shadow-xs"
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSearch(searchValue.trim());
          }}
          className="relative flex items-center"
        >
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
          <Input
            aria-label="Tìm kiếm bản ghi"
            placeholder="Tìm mã, nội dung..."
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            className="h-8 w-44 pl-8 pr-7 text-xs sm:w-56"
          />
          {searchValue ? (
            <button
              type="button"
              aria-label="Xóa tìm kiếm"
              onClick={() => {
                setSearchValue("");
                if (urlQuery) onSearch("");
              }}
              className="absolute right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </form>
        <FilterPopover
          kind={kind}
          open={filtersOpen}
          onOpenChange={onFiltersOpenChange}
          params={new URLSearchParams(paramsKey)}
          onApply={onApplyFilters}
        />
        <Button variant="outline" size="sm" disabled={!hasToken || exporting} onClick={onExport}>
          {exporting ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
          {exporting ? "Đang export..." : "Xuất danh sách XLSX"}
        </Button>
        <Button size="sm" onClick={onOpenCreate}>
          <Plus data-icon="inline-start" />
          {kind === "documents" ? "Tạo hóa đơn bán ra" : "Tạo chi phí"}
        </Button>
      </div>
    </div>
  );
}

export function FocusedRecordLoadMoreFooter({
  totalCount,
  visibleLimit,
  pageSize = 50,
  onLoadMore,
}: {
  totalCount: number;
  visibleLimit: number;
  pageSize?: number;
  onLoadMore(): void;
}) {
  if (totalCount <= visibleLimit) return null;
  const remaining = totalCount - visibleLimit;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
      <span>
        Đang hiển thị {visibleLimit} / {totalCount} bản ghi
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onLoadMore}>
        Tải thêm ({Math.min(pageSize, remaining)} bản ghi)
      </Button>
    </div>
  );
}

export type FocusedRecordSortKey = "date" | "id" | "party" | "category" | "amount" | "state";

export function FocusedRecordSortHead({
  label,
  value,
  sortKey,
  sortDirection,
  onToggle,
  className,
}: {
  label: string;
  value: FocusedRecordSortKey;
  sortKey: FocusedRecordSortKey;
  sortDirection: "asc" | "desc";
  onToggle(next: FocusedRecordSortKey): void;
  className?: string;
}) {
  return (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:underline"
        onClick={() => onToggle(value)}
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
}
