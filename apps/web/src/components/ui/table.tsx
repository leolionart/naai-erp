"use client";

import * as React from "react";
import { Columns3 } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX = "naai-erp-table-columns-v1";

function Table({
  className,
  columnVisibilityKey,
  ...props
}: React.ComponentProps<"table"> & { columnVisibilityKey?: string }) {
  const tableRef = React.useRef<HTMLTableElement>(null);
  const pathname = usePathname();
  const [columns, setColumns] = React.useState<readonly string[]>([]);
  const [hidden, setHidden] = React.useState<ReadonlySet<number>>(new Set());
  const [loadedKey, setLoadedKey] = React.useState("");
  const storageKey = React.useMemo(() => {
    if (!columns.length) return "";
    const identity = columnVisibilityKey ?? `${pathname}:${columns.join("|")}`;
    return `${STORAGE_PREFIX}:${identity}`;
  }, [columnVisibilityKey, columns, pathname]);

  React.useEffect(() => {
    const labels = Array.from(tableRef.current?.querySelectorAll("thead th") ?? []).map(
      (cell, index) => cell.textContent?.trim() || `Cột ${index + 1}`,
    );
    setColumns(labels);
  }, [props.children]);

  React.useEffect(() => {
    if (!storageKey) return;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as unknown;
      setHidden(
        new Set(
          Array.isArray(parsed)
            ? parsed.filter((value): value is number => Number.isInteger(value) && value >= 0)
            : [],
        ),
      );
    } catch {
      setHidden(new Set());
    }
    setLoadedKey(storageKey);
  }, [storageKey]);

  React.useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    for (const row of table.rows) {
      Array.from(row.cells).forEach((cell, index) => {
        cell.style.display = hidden.has(index) ? "none" : "";
      });
    }
    if (storageKey && loadedKey === storageKey)
      window.localStorage.setItem(storageKey, JSON.stringify([...hidden]));
  }, [hidden, loadedKey, props.children, storageKey]);

  function setColumn(index: number, visible: boolean) {
    setHidden((current) => {
      const next = new Set(current);
      if (visible) next.delete(index);
      else if (columns.length - next.size > 1) next.add(index);
      return next;
    });
  }

  return (
    <div data-slot="configurable-table" className="w-full space-y-2">
      {columns.length > 1 ? (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 data-icon="inline-start" /> Cột hiển thị
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuLabel>Bật/tắt cột</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map((label, index) => (
                <DropdownMenuCheckboxItem
                  key={`${label}-${index}`}
                  checked={!hidden.has(index)}
                  onCheckedChange={(checked) => setColumn(index, checked === true)}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
      <div data-slot="table-container" className="relative w-full overflow-x-auto">
        <table
          ref={tableRef}
          data-slot="table"
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-4 py-3 text-left align-middle font-medium whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-4 py-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
