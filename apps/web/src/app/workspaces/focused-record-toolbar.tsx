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
import type { Kind } from "./focused-record-shared";

export function FocusedRecordToolbar({
  kind,
  totalCount,
  visibleCount,
  paramsKey,
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
  visibleCount: number;
  paramsKey: string;
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary" className="text-xs font-normal">
          {visibleCount < totalCount ? `${visibleCount} / ${totalCount}` : totalCount} bản ghi
        </Badge>
        <PeriodRangeNavigator />
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
