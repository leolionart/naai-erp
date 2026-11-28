"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Filter } from "lucide-react";
import {
  FinancialDataTable,
  type FinancialColumn,
} from "@/components/financial/financial-data-table";
import { MoneyCell } from "@/components/financial/money-cell";
import { StatusBadge } from "@/components/financial/status-badge";
import { PaymentEvidenceGapsCard } from "@/components/tax/payment-evidence-gaps-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TaxExpenseException } from "@/lib/api";
import {
  TaxCodeAssignmentDialog,
  TaxFinalizeReviewDialog,
  TaxItemReviewDialog,
} from "./tax-exception-dialogs";
import { TaxExceptionFilterPopover } from "./tax-exception-filter-popover";
import { useTaxExpenseExceptions } from "./use-tax-expense-exceptions";

export function TaxExpenseExceptionsWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const {
    rows,
    loading,
    error,
    query,
    finalizeOpen,
    setFinalizeOpen,
    finalizeReason,
    setFinalizeReason,
    finalizing,
    finalizeNotice,
    reviewRow,
    setReviewRow,
    reviewAxis,
    setReviewAxis,
    reviewTaxCode,
    setReviewTaxCode,
    reviewState,
    setReviewState,
    reviewAmount,
    setReviewAmount,
    reviewReason,
    setReviewReason,
    reviewing,
    taxCodeRow,
    setTaxCodeRow,
    taxCodeReason,
    setTaxCodeReason,
    taxCodeValue,
    setTaxCodeValue,
    taxCodeSaving,
    hasToken,
    finalizeReview,
    reviewCit,
    resolveTaxCode,
  } = useTaxExpenseExceptions();

  const columns = useMemo<readonly FinancialColumn<TaxExpenseException>[]>(
    () => [
      {
        id: "expense",
        header: "Chi phí",
        cell: (row) => (
          <div className="flex flex-col gap-1">
            <span className="font-medium">{row.description}</span>
            <span className="text-xs text-muted-foreground">
              {row.expenseDate} · {row.partyName ?? row.expenseId}
            </span>
          </div>
        ),
      },
      {
        id: "booked",
        header: "Đã book",
        align: "right",
        cell: (row) => <MoneyCell minor={row.bookedMinor} />,
      },
      {
        id: "cit",
        header: "CIT deductible",
        align: "right",
        cell: (row) => (
          <div className="flex flex-col items-end gap-1">
            <MoneyCell minor={row.citEligibleMinor} />
            <StatusBadge status={row.citState} />
          </div>
        ),
      },
      {
        id: "vat",
        header: "VAT eligible",
        align: "right",
        cell: (row) => (
          <div className="flex flex-col items-end gap-1">
            <MoneyCell minor={row.vatEligibleMinor} />
            <StatusBadge status={row.vatState} />
            {row.taxCodeApproved === false ? (
              <span className="text-[11px] text-destructive">
                {row.taxCode ? `Mã ${row.taxCode} chưa được duyệt` : "Thiếu mã thuế VAT"}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "action",
        header: "",
        align: "right",
        cell: (row) => {
          const isDoc = row.sourceType === "purchase_invoice";
          const targetHref = isDoc
            ? `/documents/${encodeURIComponent(row.expenseId)}`
            : row.expenseId
              ? `/expenses/${encodeURIComponent(row.expenseId)}`
              : `/expenses`;
          const missingPaymentEvidence = Boolean(
            row.exceptionCodes?.includes("PAYMENT_EVIDENCE_MISSING"),
          );
          const canReview =
            !missingPaymentEvidence &&
            (row.nextActions?.includes("review-cit") ||
              row.citState === "unreviewed" ||
              row.citState === "review");
          const canReviewVat =
            !missingPaymentEvidence &&
            (row.nextActions?.includes("review-vat") || row.vatState === "unreviewed");
          const canResolveTaxCode =
            row.nextActions?.includes("resolve-tax-code") || row.taxCodeApproved === false;
          return (
            <div className="flex items-center justify-end gap-1">
              {canReview ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReviewRow(row);
                    setReviewAxis("cit");
                    setReviewTaxCode("VAT10_IN");
                    setReviewState("eligible");
                    setReviewAmount(row.bookedMinor);
                    setReviewReason("AI audit: xác nhận phân loại CIT theo chứng từ đầu vào");
                  }}
                >
                  Review CIT
                </Button>
              ) : null}
              {canReviewVat ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReviewRow(row);
                    setReviewAxis("vat");
                    setReviewTaxCode("VAT10_IN");
                    setReviewState("eligible");
                    setReviewAmount(row.vatBasisMinor ?? row.vatEligibleMinor ?? "0");
                    setReviewReason("AI audit: xác nhận phân loại VAT theo chứng từ đầu vào");
                  }}
                >
                  Review VAT
                </Button>
              ) : null}
              {canResolveTaxCode && row.sourceType === "purchase_invoice" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTaxCodeRow(row);
                    setTaxCodeValue(row.taxCode ?? "");
                  }}
                >
                  Gán mã thuế
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" asChild>
                <Link href={targetHref}>
                  Xem chi tiết <ChevronRight className="size-3.5 ml-0.5" />
                </Link>
              </Button>
            </div>
          );
        },
      },
    ],
    [
      setReviewAmount,
      setReviewAxis,
      setReviewReason,
      setReviewRow,
      setReviewState,
      setReviewTaxCode,
      setTaxCodeRow,
      setTaxCodeValue,
    ],
  );

  const apply = useCallback(
    (form: FormData) => {
      const next = new URLSearchParams();
      for (const [key, value] of form.entries())
        if (String(value).trim()) next.set(key, String(value).trim());
      setFiltersOpen(false);
      router.push(`${pathname}?${next}`);
    },
    [pathname, router],
  );

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex items-center justify-end gap-2">
        {finalizeNotice ? (
          <span className="text-sm text-muted-foreground">{finalizeNotice}</span>
        ) : null}
        <Button
          variant="default"
          onClick={() => setFinalizeOpen(true)}
          disabled={!hasToken || loading || !rows.length}
        >
          Hoàn tất review tự động
        </Button>
        <Button variant="outline" onClick={() => setFiltersOpen(true)}>
          <Filter data-icon="inline-start" />
          Bộ lọc
        </Button>
      </div>
      <PaymentEvidenceGapsCard startsOn={query.get("startsOn")} endsOn={query.get("endsOn")} />
      <Card>
        <CardHeader>
          <CardTitle>Chi phí cần rà soát thuế</CardTitle>
          <CardDescription>
            Accounting booked, CIT và VAT là ba trục độc lập; queue không tự kết luận eligibility.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FinancialDataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={loading}
            error={error}
            emptyTitle="Không có exception"
            emptyDescription="Không còn chi phí vượt filter cần rà soát."
          />
        </CardContent>
      </Card>
      <TaxExceptionFilterPopover
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        query={query}
        onApply={apply}
      />
      <TaxFinalizeReviewDialog
        open={finalizeOpen}
        onOpenChange={setFinalizeOpen}
        reason={finalizeReason}
        onReasonChange={setFinalizeReason}
        finalizing={finalizing}
        onConfirm={finalizeReview}
      />
      <TaxItemReviewDialog
        row={reviewRow}
        axis={reviewAxis}
        state={reviewState}
        onStateChange={setReviewState}
        amount={reviewAmount}
        onAmountChange={setReviewAmount}
        taxCode={reviewTaxCode}
        onTaxCodeChange={setReviewTaxCode}
        reason={reviewReason}
        onReasonChange={setReviewReason}
        reviewing={reviewing}
        onClose={() => setReviewRow(null)}
        onConfirm={reviewCit}
      />
      <TaxCodeAssignmentDialog
        row={taxCodeRow}
        taxCodeValue={taxCodeValue}
        onTaxCodeValueChange={setTaxCodeValue}
        reason={taxCodeReason}
        onReasonChange={setTaxCodeReason}
        saving={taxCodeSaving}
        onClose={() => {
          setTaxCodeRow(null);
          setTaxCodeValue("");
        }}
        onConfirm={resolveTaxCode}
      />
    </div>
  );
}
