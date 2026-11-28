"use client";

import { QuickDatePresetButtons } from "@/components/ui/quick-date-range-picker";
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
import type { FinancialStatementKind } from "@/lib/api";
import { monthStart, today } from "./statement-period-queries";

export function ReportFilterSheet({
  open,
  onOpenChange,
  query,
  kind,
  onApply,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: URLSearchParams;
  kind: FinancialStatementKind;
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
            <PopoverTitle>Bộ lọc báo cáo</PopoverTitle>
            <PopoverDescription>
              Kỳ, cutoff, framework và dimensions được lưu trên URL.
            </PopoverDescription>
          </PopoverHeader>
          <FieldGroup className="px-4">
            <QuickDatePresetButtons
              onSelectRange={(startsOn, endsOn) => {
                const form = document.querySelector("form") as HTMLFormElement | null;
                if (!form) return;
                const startInput = form.querySelector(
                  '[name="startsOn"]',
                ) as HTMLInputElement | null;
                const endInput = form.querySelector('[name="endsOn"]') as HTMLInputElement | null;
                if (startInput) startInput.value = startsOn;
                if (endInput) endInput.value = endsOn;
              }}
            />
            {kind !== "balance_sheet" ? (
              <Field>
                <FieldLabel htmlFor="statement-start">Từ ngày</FieldLabel>
                <Input
                  id="statement-start"
                  name="startsOn"
                  type="date"
                  defaultValue={query.get("startsOn") ?? monthStart()}
                  required
                />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="statement-end">Đến ngày / As of</FieldLabel>
              <Input
                id="statement-end"
                name="endsOn"
                type="date"
                defaultValue={query.get("endsOn") ?? today()}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="statement-cutoff">Ledger cutoff</FieldLabel>
              <Input
                id="statement-cutoff"
                name="asOfInstant"
                defaultValue={query.get("asOfInstant") ?? `${today()}T16:59:59.999Z`}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="statement-framework">Accounting framework</FieldLabel>
              <Select name="framework" defaultValue={query.get("framework") ?? "TT133"}>
                <SelectTrigger id="statement-framework">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="TT133">TT133</SelectItem>
                    <SelectItem value="TT200">TT200</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {kind === "profit_and_loss" ? (
              <Field>
                <FieldLabel htmlFor="statement-basis">Basis</FieldLabel>
                <Select name="basis" defaultValue={query.get("basis") ?? "accrual"}>
                  <SelectTrigger id="statement-basis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="accrual">Accrual management</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Dòng tiền được trình bày riêng tại Direct Cash Flow, không thay thế P&amp;L.
                </p>
              </Field>
            ) : null}
            {[
              ["projectId", "Project ID"],
              ["teamId", "Team ID"],
              ["serviceLineCode", "Service line"],
              ["costCenterId", "Cost center"],
            ].map(([name, label]) => (
              <Field key={name}>
                <FieldLabel htmlFor={`statement-${name}`}>{label}</FieldLabel>
                <Input id={`statement-${name}`} name={name} defaultValue={query.get(name) ?? ""} />
              </Field>
            ))}
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
