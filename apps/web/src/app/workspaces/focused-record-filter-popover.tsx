"use client";

import { useEffect, useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { QuickDatePresetButtons } from "@/components/ui/quick-date-range-picker";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INBOUND_CATEGORIES, OUTBOUND_CATEGORIES } from "@/components/forms/document-expense-forms";
import type { Kind } from "./focused-record-shared";
import { config, human } from "./focused-record-shared";

export function FilterPopover({
  kind,
  open,
  onOpenChange,
  params,
  onApply,
}: {
  kind: Kind;
  open: boolean;
  onOpenChange(open: boolean): void;
  params: URLSearchParams;
  onApply(data: FormData): void;
}) {
  const [invoiceStatus, setInvoiceStatus] = useState(params.get("invoiceStatus") ?? "all");
  const [startsOn, setStartsOn] = useState(params.get("startsOn") ?? params.get("from") ?? "");
  const [endsOn, setEndsOn] = useState(params.get("endsOn") ?? params.get("to") ?? "");

  useEffect(() => {
    if (open) {
      setInvoiceStatus(params.get("invoiceStatus") ?? "all");
      setStartsOn(params.get("startsOn") ?? params.get("from") ?? "");
      setEndsOn(params.get("endsOn") ?? params.get("to") ?? "");
    }
  }, [open, params]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter data-icon="inline-start" />
          Bộ lọc
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[min(70vh,36rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-0"
      >
        <form action={onApply} className="flex flex-col">
          <div className="border-b p-4">
            <h3 className="font-medium">Bộ lọc {config[kind].singular}</h3>
            <p className="text-sm text-muted-foreground">
              Bộ lọc được giữ trên URL để có thể chia sẻ và tải lại.
            </p>
          </div>
          <FieldGroup className="p-4">
            <QuickDatePresetButtons
              onSelectRange={(start, end) => {
                setStartsOn(start);
                setEndsOn(end);
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field>
                <FieldLabel htmlFor="filter-starts-on">Từ ngày</FieldLabel>
                <Input
                  id="filter-starts-on"
                  name="startsOn"
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="filter-ends-on">Đến ngày</FieldLabel>
                <Input
                  id="filter-ends-on"
                  name="endsOn"
                  type="date"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>Trạng thái</FieldLabel>
              <Select name="state" defaultValue={params.get("state") ?? "all"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Tất cả</SelectItem>
                    {[
                      "draft",
                      "validated",
                      "issued",
                      "captured",
                      "verified",
                      "approved",
                      "submitted",
                      "evidence_pending",
                      "posted",
                      "paid",
                      "cancelled",
                      "rejected",
                    ].map((state) => (
                      <SelectItem key={state} value={state}>
                        {human(state)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Tình trạng hóa đơn</FieldLabel>
              <Select name="invoiceStatus" value={invoiceStatus} onValueChange={setInvoiceStatus}>
                <SelectTrigger aria-label="Tình trạng hóa đơn">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="present">Có hóa đơn</SelectItem>
                    <SelectItem value="missing">Chưa có hóa đơn</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {kind === "documents" ? (
              <>
                {invoiceStatus !== "missing" ? (
                  <>
                    <Field>
                      <FieldLabel>Loại</FieldLabel>
                      <Select name="type" defaultValue={params.get("type") ?? "all"}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="all">Tất cả</SelectItem>
                            <SelectItem value="sales_invoice">Hóa đơn bán ra</SelectItem>
                            <SelectItem value="purchase_invoice">Hóa đơn mua vào</SelectItem>
                            <SelectItem value="credit_note">Credit note</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel>Nghiệp vụ</FieldLabel>
                      <Select name="categoryId" defaultValue={params.get("categoryId") ?? "all"}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="all">Tất cả</SelectItem>
                            {OUTBOUND_CATEGORIES.map((cat) => (
                              <SelectItem key={cat.code} value={cat.code}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <Field>
                  <FieldLabel>Nhóm chi phí</FieldLabel>
                  <Select name="class" defaultValue={params.get("class") ?? "all"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">Tất cả</SelectItem>
                        <SelectItem value="non_documented">Không có hóa đơn</SelectItem>
                        <SelectItem value="receipt_backed">Có biên nhận</SelectItem>
                        <SelectItem value="contract_backed">Theo hợp đồng</SelectItem>
                        <SelectItem value="employee_reimbursement">Hoàn ứng</SelectItem>
                        <SelectItem value="bank_fee">Phí ngân hàng</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Nghiệp vụ</FieldLabel>
                  <Select name="categoryId" defaultValue={params.get("categoryId") ?? "all"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">Tất cả</SelectItem>
                        {INBOUND_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.code} value={cat.code}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </>
            )}
          </FieldGroup>
          <div className="flex justify-end border-t bg-muted/50 p-4">
            <Button type="submit">Áp dụng</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
