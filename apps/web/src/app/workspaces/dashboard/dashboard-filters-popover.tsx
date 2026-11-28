"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthenticatedApiClient } from "@/lib/api";
import type { DimensionValue } from "./dashboard-contracts";

export function DashboardFilters({
  open,
  onOpenChange,
  search,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  search: URLSearchParams;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { client, hydrated } = useAuthenticatedApiClient();
  const [serviceLines, setServiceLines] = useState<readonly DimensionValue[]>([]);
  const [selectedServiceLine, setSelectedServiceLine] = useState(
    search.get("serviceLineCode") ?? "",
  );

  useEffect(() => {
    if (!hydrated) return;
    client
      .data<{ items: DimensionValue[] }>("master-data/dimensions")
      .then((res) => {
        const items = Array.isArray(res)
          ? res
          : ((res as { items?: DimensionValue[] }).items ?? []);
        setServiceLines(items.filter((d) => d.kind === "service_line" && d.is_active));
      })
      .catch(() => setServiceLines([]));
  }, [client, hydrated]);

  // Sync when search changes (e.g. external URL update)
  useEffect(() => {
    setSelectedServiceLine(search.get("serviceLineCode") ?? "");
  }, [search]);

  function apply(formData: FormData) {
    const q = new URLSearchParams();
    for (const key of ["periodId", "actualBasis", "startsOn", "endsOn", "asOfDate"]) {
      const value = String(formData.get(key) ?? "").trim();
      if (value) q.set(key, value);
    }
    if (selectedServiceLine) q.set("serviceLineCode", selectedServiceLine);
    router.replace(`${pathname}?${q}`);
    onOpenChange(false);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Filter data-icon="inline-start" />
          Bộ lọc
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(70vh,36rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-0"
      >
        <form action={apply} className="flex flex-col">
          <div className="border-b p-4">
            <h3 className="font-medium">Bộ lọc dashboard</h3>
            <p className="text-sm text-muted-foreground">Chọn khoảng thời gian và mảng dịch vụ.</p>
          </div>
          <FieldGroup className="p-4">
            <Field>
              <FieldLabel htmlFor="dash-start">Từ ngày</FieldLabel>
              <Input
                id="dash-start"
                type="date"
                name="startsOn"
                defaultValue={search.get("startsOn") ?? "2025-01-01"}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dash-end">Đến ngày</FieldLabel>
              <Input
                id="dash-end"
                type="date"
                name="endsOn"
                defaultValue={search.get("endsOn") ?? "2025-12-31"}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="dash-service">Mảng dịch vụ</FieldLabel>
              <Select value={selectedServiceLine} onValueChange={setSelectedServiceLine}>
                <SelectTrigger id="dash-service" className="w-full">
                  <SelectValue placeholder="Tất cả mảng" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tất cả mảng</SelectItem>
                  {serviceLines.map((sl) => (
                    <SelectItem key={sl.code} value={sl.code}>
                      {sl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <div className="flex justify-end border-t bg-muted/50 p-4">
            <Button type="submit">Áp dụng</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
