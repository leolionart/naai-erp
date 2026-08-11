"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAuthenticatedApiClient, type AgingItem } from "@/lib/api";
import { formatMinorVnd } from "@/lib/format";

type FinancialAccount = Readonly<{
  id: string;
  display_name?: string;
  displayName?: string;
  currency: string;
  status: "active" | "inactive";
}>;

type ReceiptResult = Readonly<{
  id: string;
  amountMinor: string;
  allocations: readonly Readonly<{
    salesInvoiceId: string;
    invoiceState: "partially_paid" | "paid";
    invoiceOutstandingMinor: string;
  }>[];
}>;

function accountItems(payload: unknown): FinancialAccount[] {
  if (Array.isArray(payload)) return payload as FinancialAccount[];
  if (!payload || typeof payload !== "object") return [];
  const items = (payload as { items?: unknown }).items;
  return Array.isArray(items) ? (items as FinancialAccount[]) : [];
}

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function digits(value: string) {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function formattedMoneyInput(value: string) {
  const clean = digits(value);
  return clean ? new Intl.NumberFormat("vi-VN").format(BigInt(clean)) : "";
}

export function CustomerReceiptDialog({
  open,
  onOpenChange,
  invoices,
  initialInvoiceId,
  onRecorded,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoices: readonly AgingItem[];
  initialInvoiceId?: string;
  onRecorded: () => void | Promise<void>;
}>) {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const eligibleInvoices = useMemo(
    () =>
      invoices.filter(
        (item) => item.balanceKind === "receivable" && BigInt(item.outstandingMinor) > 0n,
      ),
    [invoices],
  );
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [amount, setAmount] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReceiptResult>();

  useEffect(() => {
    if (!open || !hydrated || !hasToken) return;
    void client
      .data<unknown>("banking/accounts")
      .then((payload) =>
        setAccounts(accountItems(payload).filter((item) => item.status === "active")),
      )
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Không thể tải tài khoản nhận tiền."),
      );
  }, [client, hasToken, hydrated, open]);

  useEffect(() => {
    if (!open) return;
    const initial =
      eligibleInvoices.find((item) => item.id === initialInvoiceId) ?? eligibleInvoices[0];
    const initialAmount = initial?.outstandingMinor ?? "";
    setAmount(initialAmount ? formattedMoneyInput(initialAmount) : "");
    setAllocations(initial ? { [initial.id]: formattedMoneyInput(initial.outstandingMinor) } : {});
    setError("");
    setResult(undefined);
  }, [eligibleInvoices, initialInvoiceId, open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amountMinor = digits(amount);
    const selectedAllocations = eligibleInvoices
      .map((invoice) => ({
        salesInvoiceId: invoice.drilldown.sourceId,
        amountMinor: digits(allocations[invoice.id] ?? ""),
      }))
      .filter((allocation) => allocation.amountMinor && BigInt(allocation.amountMinor) > 0n);
    const allocatedMinor = selectedAllocations.reduce(
      (total, allocation) => total + BigInt(allocation.amountMinor),
      0n,
    );
    if (!amountMinor || BigInt(amountMinor) <= 0n || allocatedMinor !== BigInt(amountMinor)) {
      setError("Tổng phân bổ vào hóa đơn phải bằng đúng số tiền đã thu.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await client.data<ReceiptResult>("customer-receipts", {
        method: "POST",
        body: {
          schemaVersion: 1,
          financialAccountId: String(form.get("financialAccountId") ?? ""),
          receiptDate: String(form.get("receiptDate") ?? ""),
          amountMinor,
          currency: eligibleInvoices[0]?.currency ?? "VND",
          description: String(form.get("description") ?? "").trim() || "Thu tiền khách hàng",
          reason: "Ghi nhận khoản thu khách hàng từ giao diện công nợ",
          allocations: selectedAllocations,
        },
      });
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể ghi nhận khoản thu.");
    } finally {
      setBusy(false);
    }
  }

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && result) void onRecorded();
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        {result ? (
          <div className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2Icon className="text-emerald-600" /> Đã ghi nhận tiền thu
              </DialogTitle>
              <DialogDescription>
                Đã phân bổ {formatMinorVnd(result.amountMinor)}. Trạng thái công nợ đã được cập nhật
                từ giao dịch thực tế.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {result.allocations.map((allocation) => {
                const invoice = eligibleInvoices.find(
                  (item) => item.drilldown.sourceId === allocation.salesInvoiceId,
                );
                return (
                  <Alert key={allocation.salesInvoiceId}>
                    <AlertTitle>{invoice?.documentNumber ?? "Hóa đơn"}</AlertTitle>
                    <AlertDescription>
                      {allocation.invoiceState === "paid" ? "Đã thu đủ" : "Đã thu một phần"} · Còn
                      lại {formatMinorVnd(allocation.invoiceOutstandingMinor)}
                    </AlertDescription>
                  </Alert>
                );
              })}
            </div>
            <DialogFooter>
              <Button onClick={() => changeOpen(false)}>Hoàn tất</Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="flex flex-col gap-6" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>Ghi nhận đã thu</DialogTitle>
              <DialogDescription>
                Chọn nơi nhận tiền và phân bổ khoản thu vào các hóa đơn còn mở của khách hàng.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Chưa thể ghi nhận</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="receipt-date">Ngày thu</FieldLabel>
                  <Input
                    id="receipt-date"
                    name="receiptDate"
                    type="date"
                    defaultValue={todayLocal()}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="receipt-account">Tài khoản nhận tiền</FieldLabel>
                  <Select name="financialAccountId" required>
                    <SelectTrigger id="receipt-account">
                      <SelectValue placeholder="Chọn ngân hàng hoặc quỹ tiền mặt" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.displayName ?? account.display_name ?? "Tài khoản nhận tiền"} ·{" "}
                            {account.currency}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="receipt-amount">Số tiền đã thu</FieldLabel>
                <Input
                  id="receipt-amount"
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => setAmount(formattedMoneyInput(event.target.value))}
                  placeholder="0 ₫"
                  required
                />
              </Field>
              <div className="space-y-3">
                <p className="text-sm font-medium">Phân bổ vào hóa đơn</p>
                {eligibleInvoices.map((invoice) => (
                  <Field key={invoice.id}>
                    <div className="flex items-end gap-3">
                      <div className="min-w-0 flex-1">
                        <FieldLabel htmlFor={`receipt-allocation-${invoice.id}`}>
                          {invoice.documentNumber} · còn {formatMinorVnd(invoice.outstandingMinor)}
                        </FieldLabel>
                        <Input
                          id={`receipt-allocation-${invoice.id}`}
                          inputMode="numeric"
                          value={allocations[invoice.id] ?? ""}
                          onChange={(event) =>
                            setAllocations((current) => ({
                              ...current,
                              [invoice.id]: formattedMoneyInput(event.target.value),
                            }))
                          }
                          placeholder="Không phân bổ"
                        />
                      </div>
                    </div>
                  </Field>
                ))}
              </div>
              <Field>
                <FieldLabel htmlFor="receipt-description">Ghi chú</FieldLabel>
                <Textarea
                  id="receipt-description"
                  name="description"
                  placeholder="Ví dụ: Khách chuyển khoản thanh toán hóa đơn"
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={busy || !accounts.length}>
                {busy ? <Spinner /> : null} Ghi nhận khoản thu
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
