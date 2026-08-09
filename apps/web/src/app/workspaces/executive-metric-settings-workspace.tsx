"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createApiClient,
  DEFAULT_API_CONNECTION,
  loadApiToken,
  loadConnectionSettings,
  type ApiConnectionSettingsV1,
} from "@/lib/api";
import type { BusinessMode } from "./business-mode-workspace";

type Policy = Readonly<{
  id: string;
  version: number;
  state: "draft" | "approved";
  effective_from: string;
  effective_to: string | null;
  formula_version: string;
  mapping_count: string;
}>;

const DEFAULT_MAPPINGS = [
  "contributed_capital=411-CAPITAL",
  "retained_earnings=421-RE",
  "unrestricted_cash=111-CASH",
  "unrestricted_cash=112-BANK",
  "owner_loan=3388-OWNER",
].join("\n");

function useClient() {
  const [connection, setConnection] = useState<ApiConnectionSettingsV1>(DEFAULT_API_CONNECTION);
  const [token, setToken] = useState("");
  useEffect(() => {
    setConnection(loadConnectionSettings(window.localStorage));
    setToken(loadApiToken(window.sessionStorage));
  }, []);
  return useMemo(
    () => createApiClient({ connection: () => connection, token: () => token }),
    [connection, token],
  );
}

export function ExecutiveMetricSettingsWorkspace() {
  const client = useClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const [effectiveFrom, setEffectiveFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [mappingText, setMappingText] = useState(DEFAULT_MAPPINGS);
  const [policies, setPolicies] = useState<readonly Policy[]>([]);
  const [businessMode, setBusinessMode] = useState<BusinessMode>("controlled");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [policyResult, workflowResult] = await Promise.all([
        client.data<{ items: Policy[] }>("executive-metric-policies"),
        client.data<{ operatingMode: BusinessMode }>("organization-workflow-policy"),
      ]);
      setPolicies(policyResult.items);
      setBusinessMode(workflowResult.operatingMode);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không tải được policy");
    }
  }, [client]);

  useEffect(() => void reload(), [reload]);

  async function createPolicy() {
    const mappings = mappingText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [semantic, accountCode] = line.split("=").map((value) => value.trim());
        return { semantic, accountCode, sign: 1 };
      });
    setBusy(true);
    try {
      await client.data("executive-metric-policies", {
        method: "POST",
        body: {
          id: "naai-executive-metrics",
          effectiveFrom,
          formulaVersion: "executive-metrics-v1",
          formulaPolicy: {
            averageBurnMonths: 3,
            equityConsumedDenominator: "contributed_capital",
            runwayCashSemantic: "unrestricted_cash",
            runwayFlowClass: "operating",
            signedRevenueDenominator: true,
          },
          changeReason: "Cấu hình nguồn sổ cái cho chỉ số điều hành",
          mappings,
        },
      });
      await reload();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Không tạo được policy");
    } finally {
      setBusy(false);
    }
  }

  async function approve(policy: Policy) {
    setBusy(true);
    try {
      await client.data(
        `executive-metric-policies/${encodeURIComponent(policy.id)}/versions/${policy.version}/approve`,
        { method: "POST", body: { reason: "Đã kiểm tra tài khoản và phạm vi hiệu lực" } },
      );
      await reload();
    } catch (approveError) {
      setError(
        approveError instanceof Error ? approveError.message : "Không duyệt được chính sách",
      );
    } finally {
      setBusy(false);
    }
  }

  const approved = policies.find(
    (policy) =>
      policy.state === "approved" &&
      policy.effective_from <= today &&
      (!policy.effective_to || policy.effective_to >= today),
  );

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Không hoàn tất được thao tác</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Alert variant={approved ? "default" : "destructive"}>
        {approved ? <CheckCircle2 /> : <AlertTriangle />}
        <AlertTitle>
          {approved ? "Chính sách hiện hành đã sẵn sàng" : "Chưa có chính sách đã duyệt"}
        </AlertTitle>
        <AlertDescription>
          {approved
            ? `${approved.id}:${approved.version} có hiệu lực từ ${approved.effective_from}.`
            : businessMode === "solopreneur"
              ? "Năm nhóm chỉ số sẽ được tính sau khi chủ doanh nghiệp tạo và tự duyệt chính sách."
              : "Năm nhóm chỉ số sẽ được tính sau khi chính sách được một người khác phê duyệt."}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Cấu hình nguồn tài khoản</CardTitle>
          <CardDescription>
            Mỗi dòng có dạng semantic=mã tài khoản. Hệ thống chỉ tính từ sổ cái; không tạo số liệu
            thay thế.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="executive-effective-from">Hiệu lực từ</FieldLabel>
              <Input
                id="executive-effective-from"
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="executive-mappings">Mapping tài khoản</FieldLabel>
              <Textarea
                id="executive-mappings"
                className="min-h-40 font-mono text-sm"
                value={mappingText}
                onChange={(event) => setMappingText(event.target.value)}
              />
            </Field>
            <Button disabled={busy} onClick={createPolicy}>
              Tạo phiên bản chính sách nháp
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Các phiên bản chính sách</CardTitle>
            <CardDescription>
              {businessMode === "solopreneur"
                ? "Chủ doanh nghiệp có thể tự duyệt; người thực hiện, thời gian và lý do vẫn được lưu vết."
                : "Doanh nghiệp có phân quyền yêu cầu người duyệt khác người tạo."}
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={reload} disabled={busy}>
            <RefreshCw /> Làm mới
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {policies.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có phiên bản nào.</p>
          ) : (
            policies.map((policy) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                key={`${policy.id}:${policy.version}`}
              >
                <div className="flex flex-col gap-1 text-sm">
                  <strong>
                    {policy.id}:{policy.version}
                  </strong>
                  <span className="text-muted-foreground">
                    Từ {policy.effective_from} · {policy.mapping_count} mapping
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={policy.state === "approved" ? "secondary" : "outline"}>
                    {policy.state === "approved" ? "Đã duyệt" : "Bản nháp"}
                  </Badge>
                  {policy.state === "draft" ? (
                    <Button size="sm" onClick={() => approve(policy)} disabled={busy}>
                      {businessMode === "solopreneur" ? "Tự duyệt" : "Duyệt"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
