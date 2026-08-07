"use client";

import { type ComponentProps, type FormEvent, useEffect, useId, useState } from "react";
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

function formatMoneyDisplay(rawVal: string): string {
  const digits = rawVal.replace(/[^0-9-]/g, "");
  if (!digits) return "";
  try {
    return `${new Intl.NumberFormat("vi-VN").format(BigInt(digits))} ₫`;
  } catch {
    return rawVal;
  }
}

function MoneyField({
  label: fieldLabel,
  value,
  onChange,
  error,
  ...props
}: Omit<ComponentProps<typeof Input>, "onChange" | "value"> & {
  label: string;
  value: string;
  onChange: (rawMinor: string) => void;
  error?: string;
}) {
  const generatedId = useId();
  const controlId = props.id ?? generatedId;
  const [display, setDisplay] = useState(() => formatMoneyDisplay(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDisplay(formatMoneyDisplay(value));
    }
  }, [value, focused]);

  function handleChange(val: string) {
    const rawDigits = val.replace(/[^0-9-]/g, "");
    setDisplay(val);
    onChange(rawDigits);
  }

  function handleBlur() {
    setFocused(false);
    setDisplay(formatMoneyDisplay(value));
  }

  function handleFocus() {
    setFocused(true);
    const rawDigits = value.replace(/[^0-9-]/g, "");
    setDisplay(rawDigits);
  }

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={controlId}>{fieldLabel}</FieldLabel>
      <Input
        {...props}
        id={controlId}
        value={display}
        aria-invalid={Boolean(error)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="0 ₫"
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

function ComboboxInput({
  label: fieldLabel,
  value,
  onChange,
  options,
  placeholder = "Nhập hoặc chọn...",
  required,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Row[];
  placeholder?: string;
  required?: boolean;
  error?: string;
}) {
  const generatedId = useId();
  const [open, setOpen] = useState(false);

  // Resolve display value if current value matches an ID or name in options
  const currentMatch = options.find(
    (o) => String(o.id) === value || String(field(o, "displayName", "name")) === value,
  );
  const displayVal = currentMatch
    ? String(field(currentMatch, "displayName", "name") ?? currentMatch.id)
    : value;

  const [inputVal, setInputVal] = useState(displayVal);

  useEffect(() => {
    const match = options.find(
      (o) => String(o.id) === value || String(field(o, "displayName", "name")) === value,
    );
    setInputVal(match ? String(field(match, "displayName", "name") ?? match.id) : value);
  }, [value, options]);

  const filtered = options.filter((o) => {
    if (!inputVal.trim()) return true;
    const nameStr = String(field(o, "displayName", "name") ?? o.id).toLowerCase();
    return nameStr.includes(inputVal.toLowerCase());
  });

  return (
    <Field data-invalid={Boolean(error)}>
      {fieldLabel ? <FieldLabel htmlFor={generatedId}>{fieldLabel}</FieldLabel> : null}
      <div className="relative">
        <Input
          id={generatedId}
          value={inputVal}
          placeholder={placeholder}
          required={required}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay close to allow item click
            setTimeout(() => setOpen(false), 200);
          }}
          onChange={(e) => {
            const textVal = e.target.value;
            setInputVal(textVal);
            onChange(textVal);
            setOpen(true);
          }}
        />
        {open && filtered.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
            {filtered.map((item) => {
              const nameStr = String(field(item, "displayName", "name") ?? item.id);
              const valStr = String(item.id ?? nameStr);
              return (
                <div
                  key={String(item.id)}
                  className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setInputVal(nameStr);
                    onChange(valStr);
                    setOpen(false);
                  }}
                >
                  {nameStr}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
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

export const INBOUND_CATEGORIES = [
  { code: "SALARY", name: "Chi phí Lương & Thưởng nhân sự", defaultAccount: "6421" },
  { code: "MEAL", name: "Chi phí Ăn uống / Tiếp khách", defaultAccount: "6428" },
  { code: "OFFICE_SUPPLIES", name: "Chi phí Văn phòng phẩm / Vật tư", defaultAccount: "6422" },
  { code: "INTERNET_TELECOM", name: "Chi phí Internet / Điện thoại", defaultAccount: "6427" },
  { code: "ELECTRICITY_WATER", name: "Chi phí Điện / Nước", defaultAccount: "6427" },
  { code: "ELECTRONIC_EQUIP", name: "Chi phí Thiết bị điện tử", defaultAccount: "6422" },
  { code: "SERVER_CLOUD", name: "Chi phí Máy chủ / Cloud Services", defaultAccount: "6427" },
  { code: "DOMAIN_HOSTING", name: "Chi phí Tên miền / Hosting", defaultAccount: "6427" },
  { code: "VEHICLE_RENTAL", name: "Chi phí Thuê xe / Thuê pin sạc", defaultAccount: "6427" },
  { code: "DECORATION", name: "Chi phí Trang trí văn phòng", defaultAccount: "6428" },
  { code: "DEPOSIT_REFUND", name: "Chi phí Hoàn tiền cọc / Đặt cọc", defaultAccount: "6428" },
  { code: "TAX", name: "Chi phí Thuế & Phí nhà nước", defaultAccount: "6428" },
  { code: "OWNER_DRAWING", name: "Chi tiêu cá nhân chủ sở hữu", defaultAccount: "6428" },
  { code: "OTHER_EXPENSE", name: "Chi phí mua vào khác", defaultAccount: "6428" },
] as const;

export const OUTBOUND_CATEGORIES = [
  { code: "SOFTWARE_DEV", name: "Doanh thu Phát triển phần mềm / App", defaultAccount: "5113" },
  { code: "CONSULTING", name: "Doanh thu Dịch vụ tư vấn / Giải pháp", defaultAccount: "5113" },
  { code: "DESIGN_MEDIA", name: "Doanh thu Thiết kế / Truyền thông", defaultAccount: "5113" },
  {
    code: "SYSTEM_MAINTENANCE",
    name: "Doanh thu Bảo trì / Vận hành hệ thống",
    defaultAccount: "5113",
  },
  { code: "PRODUCT_SALES", name: "Doanh thu Bán hàng hóa / Thiết bị", defaultAccount: "5111" },
  { code: "RETAINER_FEE", name: "Doanh thu Phí Retainer hàng tháng", defaultAccount: "5113" },
  { code: "OTHER_REVENUE", name: "Doanh thu bán ra khác", defaultAccount: "5113" },
] as const;

export function getCategoryName(categoryCode?: string): string {
  if (!categoryCode) return "";
  const inboundMatch = INBOUND_CATEGORIES.find((c) => c.code === categoryCode);
  if (inboundMatch) return inboundMatch.name;
  const outboundMatch = OUTBOUND_CATEGORIES.find((c) => c.code === categoryCode);
  if (outboundMatch) return outboundMatch.name;
  return categoryCode;
}

export const CURRENCIES = [
  { code: "VND", name: "VNĐ - Đồng Việt Nam" },
  { code: "USD", name: "USD - Đô la Mỹ" },
  { code: "EUR", name: "EUR - Euro" },
] as const;

export const ACCOUNT_CODES = [
  { code: "111", name: "111 - Tiền mặt" },
  { code: "112", name: "112 - Tiền gửi ngân hàng" },
  { code: "131", name: "131 - Phải thu của khách hàng" },
  { code: "331", name: "331 - Phải trả cho người bán" },
  { code: "3331", name: "3331 - Thuế GTGT phải nộp" },
  { code: "1331", name: "1331 - Thuế GTGT được khấu trừ" },
  { code: "511", name: "511 - Doanh thu bán hàng và dịch vụ" },
  { code: "5113", name: "5113 - Doanh thu cung cấp dịch vụ" },
  { code: "642", name: "642 - Chi phí quản lý doanh nghiệp" },
  { code: "6421", name: "6421 - Chi phí nhân viên" },
  { code: "6422", name: "6422 - Chi phí vật liệu, đồ dùng văn phòng" },
  { code: "6427", name: "6427 - Chi phí dịch vụ mua ngoài" },
  { code: "6428", name: "6428 - Chi phí bằng tiền khác" },
] as const;

export const TAX_CODES = [
  { code: "VAT10", name: "VAT 10%" },
  { code: "VAT8", name: "VAT 8%" },
  { code: "VAT5", name: "VAT 5%" },
  { code: "VAT0", name: "VAT 0%" },
  { code: "NONE", name: "Không chịu thuế" },
] as const;

export function DocumentForm({
  busy,
  onSubmit,
  initial,
  parties = [],
  submitLabel = "Lưu hóa đơn nháp",
}: {
  busy: boolean;
  onSubmit: (body: Row) => void;
  initial?: Row;
  parties?: readonly Row[];
  submitLabel?: string;
}) {
  const initialLine = Array.isArray(initial?.lines)
    ? (initial.lines[0] as Row | undefined)
    : undefined;
  const initialDims = (initialLine?.dimensions as Record<string, string> | undefined) ?? {};

  const [type, setType] = useState(String(field(initial, "type") ?? "sales_invoice"));
  const [documentNumber, setDocumentNumber] = useState(
    String(field(initial, "documentNumber", "document_number") ?? ""),
  );
  const [series, setSeries] = useState(String(field(initial, "series") ?? ""));
  const [fiscalYear, setFiscalYear] = useState(
    String(field(initial, "fiscalYear", "fiscal_year") ?? new Date().getFullYear()),
  );
  const [partyId, setPartyId] = useState(
    String(field(initial, "partyId", "party_id") ?? parties[0]?.id ?? ""),
  );
  const [documentDate, setDocumentDate] = useState(
    String(
      field(initial, "documentDate", "document_date") ?? new Date().toISOString().slice(0, 10),
    ),
  );
  const [dueDate, setDueDate] = useState(String(field(initial, "dueDate", "due_date") ?? ""));
  const [currency, setCurrency] = useState(String(field(initial, "currency") ?? "VND"));
  const [controlAccountCode, setControlAccountCode] = useState(
    String(field(initial, "controlAccountCode", "control_account_code") ?? "131"),
  );
  const [reason, setReason] = useState(String(field(initial, "reason") ?? ""));
  const isPurchase = type === "purchase_invoice";
  const activeCategories = isPurchase ? INBOUND_CATEGORIES : OUTBOUND_CATEGORIES;

  const [category, setCategory] = useState(
    String(
      field(initial, "category") ?? initialDims.category ?? (isPurchase ? "MEAL" : "SOFTWARE_DEV"),
    ),
  );

  const [lineDescription, setLineDescription] = useState(
    String(field(initialLine, "description") ?? "Chi tiết hóa đơn"),
  );
  const [quantity, setQuantity] = useState(String(field(initialLine, "quantity") ?? "1"));
  const [unitPriceMinor, setUnitPriceMinor] = useState(
    String(field(initialLine, "unitPriceMinor", "unit_price_minor") ?? "0"),
  );
  const [netMinor, setNetMinor] = useState(
    String(
      field(initial, "netMinor", "net_minor") ?? field(initialLine, "netMinor", "net_minor") ?? "0",
    ),
  );
  const [taxMinor, setTaxMinor] = useState(
    String(
      field(initial, "taxMinor", "tax_minor") ?? field(initialLine, "taxMinor", "tax_minor") ?? "0",
    ),
  );
  const [grossMinor, setGrossMinor] = useState(
    String(
      field(initial, "grossMinor", "gross_minor") ??
        field(initialLine, "grossMinor", "gross_minor") ??
        "0",
    ),
  );
  const [primaryAccountCode, setPrimaryAccountCode] = useState(
    String(
      field(initialLine, "primaryAccountCode", "primary_account_code") ??
        (isPurchase ? "642" : "511"),
    ),
  );
  const [taxAccountCode, setTaxAccountCode] = useState(
    String(
      field(initialLine, "taxAccountCode", "tax_account_code") ?? (isPurchase ? "1331" : "3331"),
    ),
  );
  const [taxCode, setTaxCode] = useState(
    String(field(initialLine, "taxCode", "tax_code") ?? "VAT10"),
  );

  function handleTypeChange(newType: string) {
    setType(newType);
    if (!initial) {
      if (newType === "purchase_invoice") {
        setCategory("MEAL");
        setPrimaryAccountCode("6428");
        setTaxAccountCode("1331");
        setControlAccountCode("331");
      } else {
        setCategory("SOFTWARE_DEV");
        setPrimaryAccountCode("5113");
        setTaxAccountCode("3331");
        setControlAccountCode("131");
      }
    }
  }

  function handleCategoryChange(catCode: string) {
    setCategory(catCode);
    const item = activeCategories.find(
      (c: { code: string; defaultAccount: string }) => c.code === catCode,
    );
    if (item && !initial) {
      setPrimaryAccountCode(item.defaultAccount);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload: Row = {
      type,
      documentNumber,
      series: series || null,
      fiscalYear: Number(fiscalYear),
      partyId,
      documentDate,
      dueDate: dueDate || documentDate,
      currency,
      category,
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
          dimensions: { category },
        },
      ],
    };
    onSubmit(payload);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FieldSet className="grid gap-4 sm:grid-cols-2">
        <FieldLegend className="col-span-full font-semibold">Thông tin hóa đơn</FieldLegend>
        <Field>
          <FieldLabel>Loại hóa đơn</FieldLabel>
          <Select value={type} onValueChange={handleTypeChange}>
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
        <Field>
          <FieldLabel>Danh mục nghiệp vụ / Dịch vụ</FieldLabel>
          <Select value={category} onValueChange={handleCategoryChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {activeCategories.map((cat) => (
                  <SelectItem key={cat.code} value={cat.code}>
                    {cat.name}
                  </SelectItem>
                ))}
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
        <Field>
          <FieldLabel>
            {isPurchase
              ? "Tên đối tác / Nhà cung cấp (Gõ để tìm gợi ý hoặc tự do nhập mới)"
              : "Khách hàng (Bắt buộc chọn từ danh sách)"}
          </FieldLabel>
          {isPurchase ? (
            <ComboboxInput
              label=""
              value={partyId}
              onChange={setPartyId}
              options={parties}
              placeholder="Gõ tên để tìm gợi ý hoặc nhập mới..."
              required
            />
          ) : (
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger>
                <SelectValue>
                  {(() => {
                    const match = parties.find((p) => String(p.id) === partyId);
                    if (!match) return partyId || "Chọn khách hàng";
                    return String(field(match, "displayName", "name") ?? match.id);
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {parties.map((p) => {
                    const nameStr = String(field(p, "displayName", "name") ?? p.id);
                    return (
                      <SelectItem key={String(p.id)} value={String(p.id)}>
                        {nameStr}
                      </SelectItem>
                    );
                  })}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </Field>
        <TextField
          label="Ngày hóa đơn"
          type="date"
          value={documentDate}
          onChange={setDocumentDate}
          required
        />
        <TextField label="Hạn thanh toán" type="date" value={dueDate} onChange={setDueDate} />
        <Field>
          <FieldLabel>Loại tiền</FieldLabel>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Tài khoản công nợ</FieldLabel>
          <Select value={controlAccountCode} onValueChange={setControlAccountCode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {ACCOUNT_CODES.map((acc) => (
                  <SelectItem key={acc.code} value={acc.code}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
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
        <MoneyField
          label="Đơn giá (VNĐ)"
          value={unitPriceMinor}
          onChange={setUnitPriceMinor}
          required
        />
        <MoneyField label="Tiền chưa thuế (VNĐ)" value={netMinor} onChange={setNetMinor} required />
        <MoneyField label="Tiền thuế (VNĐ)" value={taxMinor} onChange={setTaxMinor} required />
        <MoneyField
          label="Tổng cộng gồm thuế (VNĐ)"
          value={grossMinor}
          onChange={setGrossMinor}
          required
        />
        <Field>
          <FieldLabel>Tài khoản doanh thu / chi phí</FieldLabel>
          <Select value={primaryAccountCode} onValueChange={setPrimaryAccountCode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {ACCOUNT_CODES.map((acc) => (
                  <SelectItem key={acc.code} value={acc.code}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Tài khoản thuế</FieldLabel>
          <Select value={taxAccountCode} onValueChange={setTaxAccountCode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {ACCOUNT_CODES.map((acc) => (
                  <SelectItem key={acc.code} value={acc.code}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Mã thuế</FieldLabel>
          <Select value={taxCode} onValueChange={setTaxCode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TAX_CODES.map((t) => (
                  <SelectItem key={t.code} value={t.code}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
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
  parties = [],
  submitLabel = "Lưu chi phí nháp",
}: {
  busy: boolean;
  onSubmit: (body: Row) => void;
  initial?: Row;
  parties?: readonly Row[];
  submitLabel?: string;
}) {
  const initialLine = Array.isArray(initial?.lines)
    ? (initial.lines[0] as Row | undefined)
    : undefined;
  const initialDims = (initialLine?.dimensions as Record<string, string> | undefined) ?? {};

  const [expenseClass, setExpenseClass] = useState(
    String(field(initial, "expenseClass", "expense_class") ?? "documented_operational"),
  );
  const [category, setCategory] = useState(
    String(field(initial, "category") ?? initialDims.category ?? "MEAL"),
  );
  const [payeePartyId, setPayeePartyId] = useState(
    String(field(initial, "payeePartyId", "payee_party_id") ?? parties[0]?.id ?? ""),
  );
  const [employeePartyId, setEmployeePartyId] = useState(
    String(field(initial, "employeePartyId", "employee_party_id") ?? ""),
  );
  const [expenseDate, setExpenseDate] = useState(
    String(field(initial, "expenseDate", "expense_date") ?? new Date().toISOString().slice(0, 10)),
  );
  const [businessPurpose, setBusinessPurpose] = useState(
    String(field(initial, "businessPurpose", "business_purpose") ?? "Chi phí kinh doanh"),
  );
  const [currency, setCurrency] = useState(String(field(initial, "currency") ?? "VND"));

  const [netMinor, setNetMinor] = useState(
    String(
      field(initial, "netMinor", "net_minor") ?? field(initialLine, "netMinor", "net_minor") ?? "0",
    ),
  );
  const [vatMinor, setVatMinor] = useState(
    String(
      field(initial, "vatMinor", "vat_minor") ?? field(initialLine, "vatMinor", "vat_minor") ?? "0",
    ),
  );
  const [grossMinor, setGrossMinor] = useState(
    String(
      field(initial, "grossMinor", "gross_minor") ??
        field(initialLine, "grossMinor", "gross_minor") ??
        "0",
    ),
  );
  const [counterAccountCode, setCounterAccountCode] = useState(
    String(field(initial, "counterAccountCode", "counter_account_code") ?? "111"),
  );
  const [postingAccountCode, setPostingAccountCode] = useState(
    String(field(initialLine, "postingAccountCode", "posting_account_code") ?? "642"),
  );

  function handleCategoryChange(catCode: string) {
    setCategory(catCode);
    const item = INBOUND_CATEGORIES.find((c) => c.code === catCode);
    if (item && !initial) {
      setPostingAccountCode(item.defaultAccount);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const payload: Row = {
      expenseClass,
      category,
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
          dimensions: { category },
        },
      ],
    };
    onSubmit(payload);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FieldSet className="grid gap-4 sm:grid-cols-2">
        <FieldLegend className="col-span-full font-semibold">Thông tin chi phí</FieldLegend>
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
        <Field>
          <FieldLabel>Danh mục nghiệp vụ / Dịch vụ</FieldLabel>
          <Select value={category} onValueChange={handleCategoryChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {INBOUND_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.code} value={cat.code}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <ComboboxInput
          label="Đối tác thụ hưởng (Gõ để tìm gợi ý hoặc tự do nhập mới)"
          value={payeePartyId}
          onChange={setPayeePartyId}
          options={parties}
          placeholder="Gõ tên để tìm gợi ý hoặc nhập mới..."
        />
        <Field>
          <FieldLabel>Nhân viên thực hiện</FieldLabel>
          {parties.length > 0 ? (
            <Select value={employeePartyId} onValueChange={setEmployeePartyId}>
              <SelectTrigger>
                <SelectValue>
                  {(() => {
                    const match = parties.find((p) => String(p.id) === employeePartyId);
                    if (!match) return employeePartyId || "-- Không chọn --";
                    return String(field(match, "displayName", "name") ?? match.id);
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="">-- Không chọn --</SelectItem>
                  {parties.map((p) => {
                    const nameStr = String(field(p, "displayName", "name") ?? p.id);
                    return (
                      <SelectItem key={String(p.id)} value={String(p.id)}>
                        {nameStr}
                      </SelectItem>
                    );
                  })}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            <Input value={employeePartyId} onChange={(e) => setEmployeePartyId(e.target.value)} />
          )}
        </Field>
        <TextField
          label="Ngày chi phí"
          type="date"
          value={expenseDate}
          onChange={setExpenseDate}
          required
        />
        <Field>
          <FieldLabel>Loại tiền</FieldLabel>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
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
        <MoneyField
          label="Tiền gốc chưa VAT (VNĐ)"
          value={netMinor}
          onChange={setNetMinor}
          required
        />
        <MoneyField label="Tiền VAT (VNĐ)" value={vatMinor} onChange={setVatMinor} required />
        <MoneyField
          label="Tổng chi phí (VNĐ)"
          value={grossMinor}
          onChange={setGrossMinor}
          required
        />
        <Field>
          <FieldLabel>Tài khoản hạch toán chi phí</FieldLabel>
          <Select value={postingAccountCode} onValueChange={setPostingAccountCode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {ACCOUNT_CODES.map((acc) => (
                  <SelectItem key={acc.code} value={acc.code}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>Tài khoản đối ứng (Tiền mặt/NH)</FieldLabel>
          <Select value={counterAccountCode} onValueChange={setCounterAccountCode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {ACCOUNT_CODES.map((acc) => (
                  <SelectItem key={acc.code} value={acc.code}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldSet>

      <Button type="submit" disabled={busy} className="self-end">
        {busy ? "Đang lưu…" : submitLabel}
      </Button>
    </form>
  );
}
