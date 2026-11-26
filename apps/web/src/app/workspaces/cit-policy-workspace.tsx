"use client";

import { useCallback, useEffect, useState } from "react";
import type { OrganizationCitPolicyContract } from "@naai-erp/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthenticatedApiClient } from "@/lib/api";

export function CitPolicyWorkspace() {
  const { client, hydrated, hasToken } = useAuthenticatedApiClient();
  const [policy, setPolicy] = useState<OrganizationCitPolicyContract>();
  const [ineligible, setIneligible] = useState(false);
  const [ineligibilityReason, setIneligibilityReason] = useState("");
  const [priorYearOverride, setPriorYearOverride] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!hydrated) return;
    if (!hasToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await client.data<OrganizationCitPolicyContract>("cit-policy");
      setPolicy(data);
      setIneligible(data.citSmallEnterpriseIneligible);
      setIneligibilityReason(data.ineligibilityReason ?? "");
      setPriorYearOverride(data.priorYearRevenueOverrideMinor ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tải cấu hình thuế TNDN.");
    } finally {
      setLoading(false);
    }
  }, [client, hasToken, hydrated]);

  useEffect(() => void load(), [load]);

  const dirty =
    ineligible !== (policy?.citSmallEnterpriseIneligible ?? false) ||
    ineligibilityReason.trim() !== (policy?.ineligibilityReason ?? "") ||
    priorYearOverride.trim() !== (policy?.priorYearRevenueOverrideMinor ?? "");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await client.data("cit-policy", {
        method: "PUT",
        body: {
          citSmallEnterpriseIneligible: ineligible,
          ineligibilityReason: ineligibilityReason.trim() || null,
          priorYearRevenueOverrideMinor: priorYearOverride.trim() || null,
          reason: "Cập nhật khai báo thuế suất TNDN theo bậc doanh thu (Luật 67/2025/QH15)",
        },
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu cấu hình thuế TNDN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thuế suất TNDN ước tính (Luật 67/2025/QH15)</CardTitle>
        <CardDescription>
          Mặc định hệ thống chọn bậc thuế suất theo tổng doanh thu năm trước liền kề (&le; 3 tỷ:
          15%; &gt; 3 tỷ đến &le; 50 tỷ: 17%; &gt; 50 tỷ: 20%). Khai báo bên dưới nếu công ty thuộc
          diện công ty con/quan hệ liên kết không áp dụng mức 15%/17%.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={save} disabled={loading || busy || !dirty}>
            {busy ? "Đang lưu…" : "Lưu khai báo CIT"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Không thể cập nhật cấu hình thuế TNDN</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <FieldGroup className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="cit-eligibility-select">
                Điều kiện áp dụng bậc 15%/17%
              </FieldLabel>
              <Select
                value={ineligible ? "ineligible" : "eligible"}
                onValueChange={(value) => setIneligible(value === "ineligible")}
              >
                <SelectTrigger id="cit-eligibility-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="eligible">Đủ điều kiện theo bậc doanh thu</SelectItem>
                    <SelectItem value="ineligible">
                      Không áp dụng 15%/17% (áp mức phổ thông 20%)
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="cit-ineligibility-reason">
                Lý do không áp dụng (tùy chọn)
              </FieldLabel>
              <Input
                id="cit-ineligibility-reason"
                value={ineligibilityReason}
                onChange={(event) => setIneligibilityReason(event.target.value)}
                placeholder="VD: Công ty có quan hệ liên kết"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cit-prior-revenue-override">
                Doanh thu năm trước khai báo (VND, tùy chọn)
              </FieldLabel>
              <Input
                id="cit-prior-revenue-override"
                inputMode="numeric"
                value={priorYearOverride}
                onChange={(event) => setPriorYearOverride(event.target.value)}
                placeholder="Để trống để lấy từ sổ cái"
              />
            </Field>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  );
}
