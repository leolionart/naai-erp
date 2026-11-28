"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type FinancialStatementKind,
  type FinancialStatementReport,
  type RawFinancialStatementReport,
  useAuthenticatedApiClient,
} from "@/lib/api";
import type { ReportSnapshotContract } from "@naai-erp/contracts";
import { endpointByKind, reportQuery } from "./statement-period-queries";
import { normalizeReport } from "./statement-report-normalization";

export type VatReconciliationItem = NonNullable<FinancialStatementReport["items"]>[number];
export type VatActionKind = "resolve-tax-code" | "review-vat";
export type VatReviewState = "eligible" | "partially_eligible" | "ineligible";

export function useFinancialStatementReport(kind: FinancialStatementKind, routeValue?: string) {
  const { client: api, hydrated, hasToken } = useAuthenticatedApiClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const query = useMemo(
    () => reportQuery(new URLSearchParams(searchKey), kind, routeValue),
    [kind, routeValue, searchKey],
  );
  const [report, setReport] = useState<FinancialStatementReport>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [vatActionItem, setVatActionItem] = useState<VatReconciliationItem>();
  const [vatAction, setVatAction] = useState<VatActionKind>();
  const [vatActionReason, setVatActionReason] = useState("");
  const [vatActionTaxCode, setVatActionTaxCode] = useState("");
  const [vatActionState, setVatActionState] = useState<VatReviewState>("eligible");
  const [vatActionSaving, setVatActionSaving] = useState(false);

  const loadReport = useCallback(async () => {
    if (!hydrated) return;
    setLoading(true);
    setError("");
    if (!hasToken) {
      setReport(undefined);
      setError("AUTH_REQUIRED");
      setLoading(false);
      return;
    }
    try {
      const raw = await api.data<RawFinancialStatementReport | FinancialStatementReport>(
        `${endpointByKind[kind]}?${query}`,
      );
      setReport(normalizeReport(kind, raw, query));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tải được báo cáo");
    } finally {
      setLoading(false);
    }
  }, [api, hasToken, hydrated, kind, query]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  async function captureSnapshot() {
    if (!report || capturing) return;
    setCapturing(true);
    try {
      const payload = {
        reportKind: kind,
        period: {
          startsOn: query.get("startsOn") ?? report.range.startsOn,
          endsOn: query.get("endsOn") ?? report.range.endsOn,
          asOfDate:
            query.get("endsOn") ?? report.range.endsOn ?? new Date().toISOString().split("T")[0],
        },
        accountingBasis: report.basis,
        framework: report.framework,
        formulaVersions: { [kind]: report.formulaVersion ?? "1.0" },
        request: Object.fromEntries(query.entries()),
      };
      await api.data<ReportSnapshotContract>("report-snapshots", {
        method: "POST",
        body: payload,
      });
      router.push(`/reports/accountant-exports`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chốt dữ liệu thất bại");
    } finally {
      setCapturing(false);
    }
  }

  async function applyVatAction() {
    if (!vatActionItem || !vatAction || !vatActionReason.trim() || vatActionSaving) return;
    setVatActionSaving(true);
    setError("");
    try {
      if (vatAction === "resolve-tax-code") {
        await api.data(
          `commercial-documents/${encodeURIComponent(vatActionItem.sourceId)}/tax-code`,
          {
            method: "POST",
            body: {
              lineNumber: vatActionItem.lineNumber ?? 1,
              reason: vatActionReason.trim(),
              ...(vatActionTaxCode.trim() ? { taxCode: vatActionTaxCode.trim() } : {}),
            },
          },
        );
      } else {
        const isExpense = vatActionItem.sourceType === "expense";
        await api.data(
          isExpense
            ? `expenses/${encodeURIComponent(vatActionItem.sourceId)}/review`
            : `commercial-documents/${encodeURIComponent(vatActionItem.sourceId)}/review`,
          {
            method: "POST",
            body: {
              axis: "vat",
              lineNumber: vatActionItem.lineNumber ?? 1,
              state: vatActionState,
              eligibleMinor: vatActionState === "ineligible" ? "0" : vatActionItem.taxMinor,
              ...(isExpense
                ? {}
                : { taxCode: vatActionTaxCode.trim() || vatActionItem.taxCode || "VAT10_IN" }),
              reason: vatActionReason.trim(),
            },
          },
        );
      }
      setVatActionItem(undefined);
      setVatAction(undefined);
      setVatActionReason("");
      setVatActionTaxCode("");
      await loadReport();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không thể xử lý dòng VAT");
    } finally {
      setVatActionSaving(false);
    }
  }

  return {
    query,
    report,
    loading,
    error,
    setError,
    capturing,
    loadReport,
    captureSnapshot,
    vatActionItem,
    setVatActionItem,
    vatAction,
    setVatAction,
    vatActionReason,
    setVatActionReason,
    vatActionTaxCode,
    setVatActionTaxCode,
    vatActionState,
    setVatActionState,
    vatActionSaving,
    applyVatAction,
  };
}
