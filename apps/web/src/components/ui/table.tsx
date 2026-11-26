"use client";

import * as React from "react";
import { ChevronDown, Columns3 } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  columnStorageKey,
  hiddenIndexes,
  parseHiddenLabels,
  serializeHiddenLabels,
  toggleLabel,
} from "@/lib/table-columns";
import { cn } from "@/lib/utils";

function Table({
  className,
  columnVisibilityKey,
  ...props
}: React.ComponentProps<"table"> & { columnVisibilityKey?: string }) {
  const tableRef = React.useRef<HTMLTableElement>(null);
  const pathname = usePathname();
  const [columns, setColumns] = React.useState<readonly string[]>([]);
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search);
  const storageKey = columnStorageKey(columnVisibilityKey ?? pathname);

  React.useEffect(() => {
    const labels = Array.from(tableRef.current?.querySelectorAll("thead th") ?? []).map(
      (cell, index) => cell.textContent?.trim() || `Cột ${index + 1}`,
    );
    // Avoid re-rendering on every parent render when the header did not change.
    setColumns((current) =>
      current.length === labels.length && current.every((label, i) => label === labels[i])
        ? current
        : labels,
    );
  }, [props.children]);

  // Load the remembered choice before paint so hidden columns never flash back on screen.
  React.useLayoutEffect(() => {
    setHidden(parseHiddenLabels(window.localStorage.getItem(storageKey)));
  }, [storageKey]);

  React.useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const indexes = hiddenIndexes(columns, hidden);
    for (const row of table.rows) {
      Array.from(row.cells).forEach((cell, index) => {
        cell.style.display = indexes.has(index) ? "none" : "";
      });
    }
  }, [columns, hidden, props.children]);

  React.useEffect(() => {
    const query = deferredSearch.trim().toLocaleLowerCase("vi");
    const rows = tableRef.current?.tBodies[0]?.rows ?? [];
    for (const row of rows) {
      const content = row.textContent?.toLocaleLowerCase("vi") ?? "";
      row.style.display = !query || content.includes(query) ? "" : "none";
    }
  }, [deferredSearch, props.children]);

  function setColumn(label: string, visible: boolean) {
    const next = toggleLabel(columns, hidden, label, visible);
    setHidden(next);
    // Persist immediately on the user's action instead of from a render effect.
    try {
      window.localStorage.setItem(storageKey, serializeHiddenLabels(next));
    } catch {
      // Storage may be unavailable (private mode); the choice still applies for this session.
    }
  }

  return (
    <div data-slot="configurable-table" className="flex min-w-0 w-full flex-col gap-2">
      {columns.length > 1 ? (
        <div data-slot="table-toolbar" className="flex min-w-0 flex-wrap items-center gap-2 px-1">
          <Input
            aria-label="Tìm kiếm trong bảng"
            className="min-w-0 flex-1 sm:max-w-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm kiếm trong bảng..."
            type="search"
            value={search}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="ml-auto shrink-0" variant="outline" size="sm">
                <Columns3 data-icon="inline-start" />
                Cột hiển thị
                <ChevronDown data-icon="inline-end" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuLabel>Bật/tắt cột</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {columns.map((label, index) => (
                  <DropdownMenuCheckboxItem
                    key={`${label}-${index}`}
                    checked={!hidden.has(label)}
                    onCheckedChange={(checked) => setColumn(label, checked === true)}
                  >
                    {label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
      <div data-slot="table-container" className="relative w-full overflow-x-auto">
        <table
          ref={tableRef}
          data-slot="table"
          className={cn("w-full min-w-[700px] caption-bottom text-sm sm:min-w-full", className)}
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
