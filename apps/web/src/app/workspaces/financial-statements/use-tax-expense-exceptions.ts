"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fallbackTaxExceptions } from "@/components/tax/payment-evidence-gaps-card";
import {
  financialStatementsApi,
  type RawTaxExpenseReview,
  type TaxExpenseException,
  useAuthenticatedApiClient,
} from "@/lib/api";
import { taxExceptionQuery } from "./statement-period-queries";
import { normalizeTaxException } from "./statement-report-normalization";

export type TaxReviewState = "eligible" | "partially_eligible" | "ineligible";

export function useTaxExpenseExceptions() {
  const { client: api, hydrated, hasToken } = useAuthenticatedApiClient();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const [rows, setRows] = useState<readonly TaxExpenseException[]>(fallbackTaxExceptions);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizeReason, setFinalizeReason] = useState(
    "AI audit: xác nhận và hoàn tất phân loại CIT/VAT theo chính sách doanh nghiệp",
  );
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeNotice, setFinalizeNotice] = useState("");
  const [reviewRow, setReviewRow] = useState<TaxExpenseException | null>(null);
  const [reviewAxis, setReviewAxis] = useState<"cit" | "vat">("cit");
  const [reviewTaxCode, setReviewTaxCode] = useState("VAT10_IN");
  const [taxCodeRow, setTaxCodeRow] = useState<TaxExpenseException | null>(null);
  const [taxCodeReason, setTaxCodeReason] = useState("Gán mã VAT đầu vào đã được kiểm tra");
  const [taxCodeValue, setTaxCodeValue] = useState("");
  const [taxCodeSaving, setTaxCodeSaving] = useState(false);
  const [reviewState, setReviewState] = useState<TaxReviewState>("eligible");
  const [reviewAmount, setReviewAmount] = useState("0");
  const [reviewReason, setReviewReason] = useState(
    "AI audit: xác nhận phân loại CIT theo chứng từ đầu vào",
  );
  const [reviewing, setReviewing] = useState(false);

  const query = useMemo(() => taxExceptionQuery(searchKey), [searchKey]);

  useEffect(() => {
    if (!hydrated) return;
    setLoading(true);
    setError("");
    if (!hasToken) {
      setRows(fallbackTaxExceptions);
      setLoading(false);
      return;
    }
    api
      .data<RawTaxExpenseReview | { items: readonly TaxExpenseException[] }>(
        `${financialStatementsApi.expenseExceptions}?${query}`,
      )
      .then((data) => {
        const items = data.items.map((item) => normalizeTaxException(item));
        // An authenticated, successful response with no items is a truthful empty queue;
        // never replace it with development/demo rows.
        setRows(items);
        setError("");
      })
      .catch((reason: unknown) => {
        setRows([]);
        setError(reason instanceof Error ? reason.message : "Không tải được hàng chờ rà soát");
      })
      .finally(() => setLoading(false));
  }, [api, hasToken, hydrated, query]);

  async function finalizeReview() {
    if (!hasToken || !finalizeReason.trim() || finalizing) return;
    setFinalizing(true);
    setFinalizeNotice("");
    try {
      const dryRun = await api.data<{ planHash: string; lineCount: number }>(
        "expenses/tax-finalization/dry-run",
        { method: "POST", body: { reason: finalizeReason.trim() } },
      );
      await api.data<{ lineCount: number }>("expenses/tax-finalization/commit", {
        method: "POST",
        body: { reason: finalizeReason.trim(), planHash: dryRun.planHash },
      });
      setFinalizeNotice(`Đã hoàn tất review ${dryRun.lineCount} dòng. Đang tải lại dữ liệu…`);
      setFinalizeOpen(false);
      const refreshed = await api.data<
        RawTaxExpenseReview | { items: readonly TaxExpenseException[] }
      >(`${financialStatementsApi.expenseExceptions}?${query}`);
      const items = refreshed.items.map((item) => normalizeTaxException(item));
      setRows(items);
    } catch (e) {
      setFinalizeNotice(e instanceof Error ? e.message : "Không thể hoàn tất review");
    } finally {
      setFinalizing(false);
    }
  }

  async function reviewCit() {
    if (!reviewRow || !reviewReason.trim() || reviewing || !hasToken) return;
    setReviewing(true);
    try {
      const endpoint =
        reviewRow.sourceType === "purchase_invoice"
          ? `commercial-documents/${encodeURIComponent(reviewRow.expenseId)}/review`
          : `expenses/${encodeURIComponent(reviewRow.expenseId)}/review`;
      await api.data(endpoint, {
        method: "POST",
        body: {
          axis: reviewAxis,
          lineNumber: reviewRow.lineNumber ?? 1,
          state: reviewState,
          eligibleMinor: reviewState === "ineligible" ? "0" : reviewAmount,
          ...(reviewAxis === "vat" ? { taxCode: reviewTaxCode } : {}),
          reason: reviewReason.trim(),
        },
      });
      setReviewRow(null);
      const refreshed = await api.data<
        RawTaxExpenseReview | { items: readonly TaxExpenseException[] }
      >(`${financialStatementsApi.expenseExceptions}?${query}`);
      setRows(refreshed.items.map((item) => normalizeTaxException(item)));
    } catch (e) {
      setFinalizeNotice(
        e instanceof Error ? e.message : `Không thể review ${reviewAxis.toUpperCase()}`,
      );
    } finally {
      setReviewing(false);
    }
  }

  async function resolveTaxCode() {
    if (!taxCodeRow || !taxCodeReason.trim() || taxCodeSaving || !hasToken) return;
    setTaxCodeSaving(true);
    try {
      await api.data(`commercial-documents/${encodeURIComponent(taxCodeRow.expenseId)}/tax-code`, {
        method: "POST",
        body: {
          lineNumber: taxCodeRow.lineNumber ?? 1,
          reason: taxCodeReason.trim(),
          ...(taxCodeValue.trim() ? { taxCode: taxCodeValue.trim() } : {}),
        },
      });
      setTaxCodeRow(null);
      setTaxCodeValue("");
      const refreshed = await api.data<
        RawTaxExpenseReview | { items: readonly TaxExpenseException[] }
      >(`${financialStatementsApi.expenseExceptions}?${query}`);
      setRows(refreshed.items.map((item) => normalizeTaxException(item)));
    } catch (e) {
      setFinalizeNotice(e instanceof Error ? e.message : "Không thể gán mã thuế VAT");
    } finally {
      setTaxCodeSaving(false);
    }
  }

  return {
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
  };
}
