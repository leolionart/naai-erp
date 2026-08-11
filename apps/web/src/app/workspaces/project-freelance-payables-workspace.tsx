"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BanknoteIcon, RefreshCwIcon } from "lucide-react";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { MoneyCell } from "@/components/financial/money-cell";
import { StatusBadge } from "@/components/financial/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useAuthenticatedApiClient } from "@/lib/api";
import { formatMinorVnd } from "@/lib/format";

type Row = Record<string, unknown>;
type PayableState = "unpaid" | "partially_paid" | "paid";
type Payable = Readonly<{
  id: string;
  expenseId: string;
  projectId: string;
  freelancerPartyId: string;
  expenseDate: string;
  dueDate: string;
  amountMinor: string;
  outstandingMinor: string;
  currency: string;
  description: string;
  state: PayableState;
}>;
type FinancialAccount = Readonly<{
  id: string;
  displayName?: string;
  display_name?: string;
  currency: string;
  status: "active" | "inactive";
}>;

function items<T>(payload: readonly T[] | { items?: readonly T[] }): readonly T[] {
  return Array.isArray(payload) ? payload : ((payload as { items?: readonly T[] }).items ?? []);
}

function value(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const result = row[key];
    if (result !== undefined && result !== null && result !== "") return String(result);
  }
  return "";
}

function digits(input: string) {
  return input.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function moneyInput(input: string) {
  const clean = digits(input);
  return clean ? new Intl.NumberFormat("vi-VN").format(BigInt(clean)) : "";
}

function todayLocal() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function ProjectFreelancePayablesWorkspace({
  projectId,
  compact = false,
}: Readonly<{ projectId?: string; compact?: boolean }>) {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [rows, setRows] = useState<readonly Payable[]>([]);
  const [projects, setProjects] = useState<readonly Row[]>([]);
  const [parties, setParties] = useState<readonly Row[]>([]);
  const [accounts, setAccounts] = useState<readonly FinancialAccount[]>([]);
  const [selected, setSelected] = useState<Payable>();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!hydrated) return;
    if (!hasToken) {
      setError("Cần đăng nhập để xem khoản phải trả freelance.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ limit: "500" });
      if (projectId) query.set("projectId", projectId);
      const [payables, projectPayload, partyPayload, accountPayload] = await Promise.all([
        client.data<readonly Payable[] | { items?: readonly Payable[] }>(
          `project-freelance-payables?${query}`,
        ),
        client.data<readonly Row[] | { items?: readonly Row[] }>("master-data/projects?limit=500"),
        client.data<readonly Row[] | { items?: readonly Row[] }>("master-data/parties?limit=500"),
        client.data<readonly FinancialAccount[] | { items?: readonly FinancialAccount[] }>(
          "banking/accounts",
        ),
      ]);
      setRows(items(payables).filter((item) => item.state !== "paid"));
      setProjects(items(projectPayload));
      setParties(items(partyPayload));
      setAccounts(items(accountPayload).filter((account) => account.status === "active"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải khoản phải trả freelance.");
    } finally {
      setLoading(false);
    }
  }, [client, hasToken, hydrated, projectId]);

  useEffect(() => void load(), [load]);

  const projectNames = useMemo(
    () =>
      new Map(projects.map((project) => [value(project, "id"), value(project, "name", "code")])),
    [projects],
  );
  const partyNames = useMemo(
    () =>
      new Map(
        parties.map((party) => [
          value(party, "id"),
          value(party, "displayName", "display_name", "name"),
        ]),
      ),
    [parties],
  );

  function openPayment(payable: Payable) {
    setSelected(payable);
    setAmount(moneyInput(payable.outstandingMinor));
    setError("");
  }

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const amountMinor = digits(amount);
    if (
      !amountMinor ||
      BigInt(amountMinor) <= 0n ||
      BigInt(amountMinor) > BigInt(selected.outstandingMinor)
    ) {
      setError("Số tiền thanh toán phải lớn hơn 0 và không vượt quá khoản còn phải trả.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await client.data<Payable>(
        `project-freelance-payables/${encodeURIComponent(selected.id)}/pay`,
        {
          method: "POST",
          body: {
            schemaVersion: 1,
            financialAccountId: String(form.get("financialAccountId") ?? ""),
            paymentDate: String(form.get("paymentDate") ?? ""),
            amountMinor,
            reason: "Thanh toán chi phí freelance thực tế",
          },
        },
      );
      setSelected(undefined);
      setNotice(
        result.state === "paid"
          ? "Đã thanh toán đủ khoản freelance. Khoản này không còn trong Phải trả."
          : `Đã thanh toán một phần. Còn phải trả ${formatMinorVnd(result.outstandingMinor)}.`,
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể ghi nhận thanh toán.");
    } finally {
      setBusy(false);
    }
  }

  const columns: readonly FinancialColumn<Payable>[] = [
    {
      id: "freelancer",
      header: "Freelancer",
      cell: (item) => (
        <div className="flex min-w-44 flex-col gap-1">
          <strong>{partyNames.get(item.freelancerPartyId) || "Freelancer"}</strong>
          <span className="text-xs text-muted-foreground">
            {projectNames.get(item.projectId) || "Dự án"}
          </span>
        </div>
      ),
    },
    {
      id: "expense",
      header: "Chi phí thực tế",
      cell: (item) => (
        <div className="flex min-w-48 flex-col gap-1">
          <Link
            className="font-medium underline-offset-4 hover:underline"
            href={`/expenses/${item.expenseId}`}
          >
            {item.description}
          </Link>
          <span className="text-xs text-muted-foreground">
            Ghi nhận {item.expenseDate} · đến hạn {item.dueDate}
          </span>
        </div>
      ),
    },
    {
      id: "amount",
      header: "Chi phí",
      align: "right",
      cell: (item) => <MoneyCell minor={item.amountMinor} />,
    },
    {
      id: "outstanding",
      header: "Còn phải trả",
      align: "right",
      cell: (item) => <MoneyCell minor={item.outstandingMinor} />,
    },
    {
      id: "state",
      header: "Thanh toán",
      cell: (item) => (
        <StatusBadge status={item.state === "unpaid" ? "Chưa trả" : "Trả một phần"} />
      ),
    },
    {
      id: "action",
      header: "Thao tác",
      cell: (item) => (
        <Button size="sm" onClick={() => openPayment(item)}>
          <BanknoteIcon data-icon="inline-start" /> Thanh toán
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <Alert>
          <AlertTitle>Đã cập nhật Phải trả</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {error && !selected ? (
        <Alert variant="destructive">
          <AlertTitle>Không thể tải dữ liệu</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>{compact ? "Chi phí freelance thực tế" : "Phải trả freelance"}</CardTitle>
            <CardDescription>
              Chỉ gồm chi phí freelance thực tế đã ghi nhận. Ngân sách dự kiến và hóa đơn đầu vào
              thông thường không nằm trong danh sách này.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {projectId ? (
              <Button variant="outline" asChild>
                <Link href={`/expenses?projectId=${encodeURIComponent(projectId)}`}>
                  Ghi nhận chi phí
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => void load()} disabled={loading}>
              {loading ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCwIcon data-icon="inline-start" />
              )}
              Tải lại
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={rows}
            columns={columns}
            rowKey={(item) => item.id}
            loading={loading}
            emptyTitle="Không có khoản freelance phải trả"
            emptyDescription="Ngân sách freelance chỉ là dự kiến. Khoản phải trả xuất hiện sau khi chi phí thực tế được ghi nhận và post."
          />
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(undefined)}>
        <DialogContent className="sm:max-w-lg">
          <form className="flex flex-col gap-6" onSubmit={pay}>
            <DialogHeader>
              <DialogTitle>Thanh toán chi phí freelance</DialogTitle>
              <DialogDescription>
                {selected
                  ? `${partyNames.get(selected.freelancerPartyId) || "Freelancer"} · còn ${formatMinorVnd(selected.outstandingMinor)}`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Chưa thể thanh toán</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="freelance-payment-date">Ngày thanh toán</FieldLabel>
                <Input
                  id="freelance-payment-date"
                  name="paymentDate"
                  type="date"
                  defaultValue={todayLocal()}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="freelance-payment-account">Thanh toán từ</FieldLabel>
                <Select name="financialAccountId" required>
                  <SelectTrigger id="freelance-payment-account">
                    <SelectValue placeholder="Chọn ngân hàng hoặc quỹ tiền mặt" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.displayName ?? account.display_name ?? "Tài khoản thanh toán"} ·{" "}
                          {account.currency}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="freelance-payment-amount">Số tiền thanh toán</FieldLabel>
                <Input
                  id="freelance-payment-amount"
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => setAmount(moneyInput(event.target.value))}
                  required
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSelected(undefined)}>
                Hủy
              </Button>
              <Button type="submit" disabled={busy || !accounts.length}>
                {busy ? <Spinner /> : null} Ghi nhận thanh toán
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
