"use client";

import { type ComponentProps, type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Row = Record<string, unknown>;

function field(source: unknown, ...keys: string[]): unknown {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    if (key in record && record[key] !== undefined) return record[key];
  }
  return undefined;
}

function TextField({
  label: fieldLabel,
  onChange,
  error,
  ...props
}: Omit<ComponentProps<typeof Input>, "onChange"> & {
  label: string;
  onChange?: (value: string) => void;
  error?: string;
}) {
  const generatedId = useId();
  const controlId = props.id ?? generatedId;
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={controlId}>{fieldLabel}</FieldLabel>
      <Input
        {...props}
        id={controlId}
        aria-invalid={Boolean(error)}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export function DocumentForm({
  busy,
  onSubmit,
  initial,
  submitLabel = "Lưu hóa đơn nháp",
}: {
  busy: boolean;
  onSubmit: (body: Row) => void;
  initial?: Row;
  submitLabel?: string;
}) {
  const initialLine = Array.isArray(initial?.lines)
    ? (initial.lines[0] as Row | undefined)
    : undefined;

  const [id, setId] = useState(String(field(initial, "id") ?? ""));
  const [type, setType] = useState(String(field(initial, "type") ?? "sales_invoice"));
  const [documentNumber, setDocumentNumber] = useState(
    String(field(initial, "documentNumber") ?? ""),
  );
  const [series, setSeries] = useState(String(field(initial, "series") ?? ""));
  const [fiscalYear, setFiscalYear] = useState(
    String(field(initial, "fiscalYear") ?? new Date().getFullYear()),
  );
  const [partyId, setPartyId] = useState(String(field(initial, "partyId") ?? ""));
  const [documentDate, setDocumentDate] = useState(
    String(field(initial, "documentDate") ?? new Date().toISOString().slice(0, 10)),
  );
  const [dueDate, setDueDate] = useState(String(field(initial, "dueDate") ?? ""));
  const [currency, setCurrency] = useState(String(field(initial, "currency") ?? "VND"));
  const [controlAccountCode, setControlAccountCode] = useState(
    String(field(initial, "controlAccountCode") ?? "131"),
  );
  const [reason, setReason] = useState(String(field(initial, "reason") ?? ""));

  const [lineDescription, setLineDescription] = useState(
    String(field(initialLine, "description") ?? "Chi tiết hóa đơn"),
  );
  const [quantity, setQuantity] = useState(String(field(initialLine, "quantity") ?? "1"));
  const [unitPriceMinor, setUnitPriceMinor] = useState(
    String(field(initialLine, "unitPriceMinor") ?? "0"),
  );
  const [netMinor, setNetMinor] = useState(
    String(field(initialLine, "netMinor") ?? field(initial, "netMinor") ?? "0"),
  );
  const [taxMinor, setTaxMinor] = useState(
    String(field(initialLine, "taxMinor") ?? field(initial, "taxMinor") ?? "0"),
  );
  const [grossMinor, setGrossMinor] = useState(
    String(field(initialLine, "grossMinor") ?? field(initial, "grossMinor") ?? "0"),
  );
  const [primaryAccountCode, setPrimaryAccountCode] = useState(
    String(field(initialLine, "primaryAccountCode") ?? "511"),
  );
  const [taxAccountCode, setTaxAccountCode] = useState(
    String(field(initialLine, "taxAccountCode") ?? "3331"),
  );
  const [taxCode, setTaxCode] = useState(String(field(initialLine, "taxCode") ?? "VAT10"));

  const isUpdate = Boolean(initial);

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload: Row = {
      ...(id ? { id } : {}),
      type,
      documentNumber,
      series: series || null,
      fiscalYear: Number(fiscalYear),
      partyId,
      documentDate,
      dueDate: dueDate || documentDate,
      currency,
      netMinor: netMinor || "0",
      taxMinor: taxMinor || "0",
      grossMinor: grossMinor || "0",
      controlAccountCode,
      reason: reason || null,
      lines: [
        {
          lineNumber: 1,
          description: lineDescription,
          quantity: quantity || "1",
          unitPriceMinor: unitPriceMinor || grossMinor || "0",
          netMinor: netMinor || "0",
          taxMinor: taxMinor || "0",
          grossMinor: grossMinor || "0",
          primaryAccountCode,
          taxAccountCode: taxAccountCode || undefined,
          taxCode: taxCode || undefined,
        },
      ],
    };
    onSubmit(payload);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FieldSet className="grid gap-4 sm:grid-cols-2">
        <FieldLegend className="col-span-full font-semibold">Thông tin hóa đơn</FieldLegend>
        <TextField
          label="Mã định danh (ID)"
          value={id}
          onChange={setId}
          disabled={isUpdate}
          placeholder="sales-001 (để trống nếu tự sinh)"
        />
        <Field>
          <FieldLabel>Loại hóa đơn</FieldLabel>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="sales_invoice">Hóa đơn bán ra (Sales Invoice)</SelectItem>
                <SelectItem value="purchase_invoice">Hóa đơn mua vào (Purchase Invoice)</SelectItem>
                <SelectItem value="credit_note">Giảm trừ (Credit Note)</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <TextField
          label="Số hóa đơn"
          value={documentNumber}
          onChange={setDocumentNumber}
          required
        />
        <TextField label="Ký hiệu (Series)" value={series} onChange={setSeries} />
        <TextField
          label="Năm tài chính"
          type="number"
          value={fiscalYear}
          onChange={setFiscalYear}
          required
        />
        <TextField label="Mã đối tác (Party ID)" value={partyId} onChange={setPartyId} required />
        <TextField
          label="Ngày hóa đơn"
          type="date"
          value={documentDate}
          onChange={setDocumentDate}
          required
        />
        <TextField label="Hạn thanh toán" type="date" value={dueDate} onChange={setDueDate} />
        <TextField label="Loại tiền" value={currency} onChange={setCurrency} required />
        <TextField
          label="Tài khoản công nợ"
          value={controlAccountCode}
          onChange={setControlAccountCode}
          required
        />
        <Field className="col-span-full">
          <FieldLabel htmlFor="doc-reason">Lý do / Ghi chú</FieldLabel>
          <Textarea id="doc-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </FieldSet>

      <FieldSet className="grid gap-4 sm:grid-cols-2">
        <FieldLegend className="col-span-full font-semibold">
          Chi tiết hóa đơn & Tiền tệ
        </FieldLegend>
        <TextField
          label="Diễn giải dòng"
          value={lineDescription}
          onChange={setLineDescription}
          required
          className="col-span-full"
        />
        <TextField label="Số lượng" value={quantity} onChange={setQuantity} required />
        <TextField
          label="Đơn giá (xu)"
          value={unitPriceMinor}
          onChange={setUnitPriceMinor}
          required
        />
        <TextField label="Tiền chưa thuế (xu)" value={netMinor} onChange={setNetMinor} required />
        <TextField label="Tiền thuế (xu)" value={taxMinor} onChange={setTaxMinor} required />
        <TextField
          label="Tổng cộng gồm thuế (xu)"
          value={grossMinor}
          onChange={setGrossMinor}
          required
        />
        <TextField
          label="Tài khoản doanh thu / chi phí"
          value={primaryAccountCode}
          onChange={setPrimaryAccountCode}
          required
        />
        <TextField label="Tài khoản thuế" value={taxAccountCode} onChange={setTaxAccountCode} />
        <TextField label="Mã thuế" value={taxCode} onChange={setTaxCode} />
      </FieldSet>

      <Button type="submit" disabled={busy} className="self-end">
        {busy ? "Đang lưu…" : submitLabel}
      </Button>
    </form>
  );
}

export function ExpenseForm({
  busy,
  onSubmit,
  initial,
  submitLabel = "Lưu chi phí nháp",
}: {
  busy: boolean;
  onSubmit: (body: Row) => void;
  initial?: Row;
  submitLabel?: string;
}) {
  const initialLine = Array.isArray(initial?.lines)
    ? (initial.lines[0] as Row | undefined)
    : undefined;

  const [id, setId] = useState(String(field(initial, "id") ?? ""));
  const [expenseClass, setExpenseClass] = useState(
    String(field(initial, "expenseClass") ?? "documented_operational"),
  );
  const [payeePartyId, setPayeePartyId] = useState(String(field(initial, "payeePartyId") ?? ""));
  const [employeePartyId, setEmployeePartyId] = useState(
    String(field(initial, "employeePartyId") ?? ""),
  );
  const [expenseDate, setExpenseDate] = useState(
    String(field(initial, "expenseDate") ?? new Date().toISOString().slice(0, 10)),
  );
  const [businessPurpose, setBusinessPurpose] = useState(
    String(field(initial, "businessPurpose") ?? ""),
  );
  const [currency, setCurrency] = useState(String(field(initial, "currency") ?? "VND"));
  const [netMinor, setNetMinor] = useState(
    String(field(initial, "netMinor") ?? field(initialLine, "netMinor") ?? "0"),
  );
  const [vatMinor, setVatMinor] = useState(
    String(field(initial, "vatMinor") ?? field(initialLine, "vatMinor") ?? "0"),
  );
  const [grossMinor, setGrossMinor] = useState(
    String(field(initial, "grossMinor") ?? field(initialLine, "grossMinor") ?? "0"),
  );
  const [counterAccountCode, setCounterAccountCode] = useState(
    String(field(initial, "counterAccountCode") ?? "111"),
  );

  const [postingAccountCode, setPostingAccountCode] = useState(
    String(field(initialLine, "postingAccountCode") ?? "642"),
  );

  const isUpdate = Boolean(initial);

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload: Row = {
      ...(id ? { id } : {}),
      expenseClass,
      payeePartyId: payeePartyId || null,
      employeePartyId: employeePartyId || null,
      expenseDate,
      businessPurpose,
      currency,
      netMinor: netMinor || "0",
      vatMinor: vatMinor || "0",
      grossMinor: grossMinor || "0",
      counterAccountCode,
      lines: [
        {
          lineNumber: 1,
          postingAccountCode,
          netMinor: netMinor || "0",
          vatMinor: vatMinor || "0",
          grossMinor: grossMinor || "0",
        },
      ],
    };
    onSubmit(payload);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FieldSet className="grid gap-4 sm:grid-cols-2">
        <FieldLegend className="col-span-full font-semibold">Thông tin chi phí</FieldLegend>
        <TextField
          label="Mã chi phí (ID)"
          value={id}
          onChange={setId}
          disabled={isUpdate}
          placeholder="exp-001 (để trống nếu tự sinh)"
        />
        <Field>
          <FieldLabel>Phân loại chi phí</FieldLabel>
          <Select value={expenseClass} onValueChange={setExpenseClass}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="documented_operational">Chi phí vận hành có hóa đơn</SelectItem>
                <SelectItem value="non_documented">Chi phí không hóa đơn</SelectItem>
                <SelectItem value="employee_reimbursement">Hoàn ứng nhân viên</SelectItem>
                <SelectItem value="petty_cash">Tiền mặt / Tạm ứng nhỏ</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <TextField label="Mã đối tác thụ hưởng" value={payeePartyId} onChange={setPayeePartyId} />
        <TextField label="Mã nhân viên" value={employeePartyId} onChange={setEmployeePartyId} />
        <TextField
          label="Ngày chi phí"
          type="date"
          value={expenseDate}
          onChange={setExpenseDate}
          required
        />
        <TextField label="Loại tiền" value={currency} onChange={setCurrency} required />
        <Field className="col-span-full">
          <FieldLabel htmlFor="exp-purpose">Mục đích chi / Diễn giải</FieldLabel>
          <Textarea
            id="exp-purpose"
            value={businessPurpose}
            onChange={(e) => setBusinessPurpose(e.target.value)}
            required
          />
        </Field>
      </FieldSet>

      <FieldSet className="grid gap-4 sm:grid-cols-2">
        <FieldLegend className="col-span-full font-semibold">Giá trị & Hạch toán</FieldLegend>
        <TextField
          label="Tiền gốc chưa VAT (xu)"
          value={netMinor}
          onChange={setNetMinor}
          required
        />
        <TextField label="Tiền VAT (xu)" value={vatMinor} onChange={setVatMinor} required />
        <TextField label="Tổng chi phí (xu)" value={grossMinor} onChange={setGrossMinor} required />
        <TextField
          label="Tài khoản hạch toán chi phí"
          value={postingAccountCode}
          onChange={setPostingAccountCode}
          required
        />
        <TextField
          label="Tài khoản đối ứng (Tiền mặt/NH)"
          value={counterAccountCode}
          onChange={setCounterAccountCode}
          required
        />
      </FieldSet>

      <Button type="submit" disabled={busy} className="self-end">
        {busy ? "Đang lưu…" : submitLabel}
      </Button>
    </form>
  );
}
