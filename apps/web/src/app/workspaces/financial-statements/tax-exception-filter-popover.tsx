"use client";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverActiveAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverFooter,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { monthStart, today } from "./statement-period-queries";

export function TaxExceptionFilterPopover({
  open,
  onOpenChange,
  query,
  onApply,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: URLSearchParams;
  onApply: (data: FormData) => void;
}>) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverActiveAnchor open={Boolean(open)} />
      <PopoverContent
        align="end"
        sideOffset={8}
        className="max-h-[min(80vh,40rem)] w-[min(92vw,30rem)] overflow-y-auto"
      >
        <form action={onApply} className="flex flex-col">
          <PopoverHeader>
            <PopoverTitle>Bộ lọc tax exception</PopoverTitle>
            <PopoverDescription>
              Lọc theo trạng thái review, evidence và khoảng ngày.
            </PopoverDescription>
          </PopoverHeader>
          <FieldGroup className="px-4">
            <Field>
              <FieldLabel htmlFor="tax-from">Từ ngày</FieldLabel>
              <Input
                id="tax-from"
                name="startsOn"
                type="date"
                defaultValue={query.get("startsOn") ?? monthStart()}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tax-to">Đến ngày</FieldLabel>
              <Input
                id="tax-to"
                name="endsOn"
                type="date"
                defaultValue={query.get("endsOn") ?? today()}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tax-state">Review state</FieldLabel>
              <Select name="state" defaultValue={query.get("state") ?? "all"}>
                <SelectTrigger id="tax-state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Tất cả exception</SelectItem>
                    <SelectItem value="unreviewed">Chưa review</SelectItem>
                    <SelectItem value="ineligible">Không đủ điều kiện</SelectItem>
                    <SelectItem value="partially_eligible">Đủ điều kiện một phần</SelectItem>
                    <SelectItem value="accountant_override">Accountant override</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <PopoverFooter className="sticky bottom-0 bg-popover py-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit">Áp dụng</Button>
          </PopoverFooter>
        </form>
      </PopoverContent>
    </Popover>
  );
}
