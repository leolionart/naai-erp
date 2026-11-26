"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CashCountSection } from "./period-close/cash-count-section";
import { OwnerSettlementSection } from "./period-close/owner-settlement-section";
import { PeriodCloseChecklistSection } from "./period-close/period-close-checklist-section";

type PeriodCloseTab = "checklist" | "cash-count" | "year-end-settlement";

function resolveTab(raw: string | null): PeriodCloseTab {
  if (raw === "cash-count" || raw === "year-end-settlement") return raw;
  return "checklist";
}

export function PeriodCloseWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = resolveTab(searchParams.get("tab"));

  function handleTabChange(next: string) {
    if (!next) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          value={activeTab}
          onValueChange={handleTabChange}
          variant="outline"
          aria-label="Phân mục đóng sổ và quyết toán"
        >
          <ToggleGroupItem value="checklist">Checklist đóng kỳ</ToggleGroupItem>
          <ToggleGroupItem value="cash-count">Kiểm quỹ (111-OWNER-CUSTODY)</ToggleGroupItem>
          <ToggleGroupItem value="year-end-settlement">Quyết toán cuối năm với chủ</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {activeTab === "checklist" ? <PeriodCloseChecklistSection /> : null}
      {activeTab === "cash-count" ? <CashCountSection /> : null}
      {activeTab === "year-end-settlement" ? <OwnerSettlementSection /> : null}
    </div>
  );
}
