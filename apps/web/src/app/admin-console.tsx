"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";

const resourcePath: Record<string, string> = {
  "master-data": "master-data/accounts",
  ledger: "journals",
  documents: "commercial-documents",
  expenses: "expenses",
  evidence: "evidence",
};

const samplePayload: Record<string, object> = {
  "master-data": { code: "6428", name: "Chi phí quản lý khác", rootType: "expense" },
  ledger: {
    id: "journal-demo-001",
    journalDate: "2026-08-05",
    description: "Bút toán thử nghiệm",
    currency: "VND",
    lines: [
      { accountCode: "6428", debitMinor: "1000000", dimensions: { costCenter: "ADMIN" } },
      { accountCode: "111", creditMinor: "1000000", dimensions: { costCenter: "ADMIN" } },
    ],
  },
  documents: {
    id: "sales-demo-001",
    type: "sales_invoice",
    documentNumber: "SI-DEMO-001",
    fiscalYear: 2026,
    partyId: "CLIENT-DEMO",
    documentDate: "2026-08-05",
    dueDate: "2026-09-04",
    currency: "VND",
    netMinor: "10000000",
    taxMinor: "1000000",
    grossMinor: "11000000",
    controlAccountCode: "131",
    lines: [],
  },
  expenses: {
    id: "expense-demo-001",
    expenseClass: "non_documented",
    expenseDate: "2026-08-05",
    businessPurpose: "Chi phí demo",
    currency: "VND",
    netMinor: "1000000",
    vatMinor: "0",
    grossMinor: "1000000",
    counterAccountCode: "111",
    lines: [],
  },
  evidence: {
    subjectType: "expense",
    subjectId: "expense-demo-001",
    evidenceType: "receipt",
    originalFilename: "receipt.pdf",
    declaredMediaType: "application/pdf",
    contentBase64: "JVBERi0xLjcK",
    source: "admin-ui",
  },
};

type StoredSettings = { version: 1; baseUrl: string; organizationId: string };

export function AdminConsole({ moduleKey }: { moduleKey: string }) {
  const path = resourcePath[moduleKey];
  const [baseUrl, setBaseUrl] = useState("http://localhost:3001");
  const [organizationId, setOrganizationId] = useState("naai");
  const [token, setToken] = useState("");
  const [requestPath, setRequestPath] = useState(path ?? "health/live");
  const [method, setMethod] = useState<"GET" | "POST">("GET");
  const [payload, setPayload] = useState(() =>
    JSON.stringify(samplePayload[moduleKey] ?? {}, null, 2),
  );
  const [result, setResult] = useState("Chưa gửi request.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem("naai-erp-admin-settings-v2");
    if (raw) {
      try {
        const saved = JSON.parse(raw) as StoredSettings;
        if (saved.version === 1) {
          setBaseUrl(saved.baseUrl);
          setOrganizationId(saved.organizationId);
        }
      } catch {
        window.localStorage.removeItem("naai-erp-admin-settings-v2");
      }
    }
    setToken(window.sessionStorage.getItem("naai-erp-admin-token") ?? "");
  }, []);

  useEffect(() => {
    setRequestPath(resourcePath[moduleKey] ?? "health/live");
    setMethod("GET");
    setPayload(JSON.stringify(samplePayload[moduleKey] ?? {}, null, 2));
  }, [moduleKey]);

  const url = useMemo(() => {
    const cleanBase = baseUrl.replace(/\/$/, "");
    const cleanPath = requestPath.replace(/^\//, "");
    return cleanPath.startsWith("health/")
      ? `${cleanBase}/${cleanPath}`
      : `${cleanBase}/api/v1/organizations/${encodeURIComponent(organizationId)}/${cleanPath}`;
  }, [baseUrl, organizationId, requestPath]);

  async function execute() {
    setBusy(true);
    setResult("Đang tải…");
    window.localStorage.setItem(
      "naai-erp-admin-settings-v2",
      JSON.stringify({ version: 1, baseUrl, organizationId } satisfies StoredSettings),
    );
    window.sessionStorage.setItem("naai-erp-admin-token", token);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          "content-type": "application/json",
          "x-correlation-id": crypto.randomUUID(),
          ...(method === "POST" ? { "idempotency-key": crypto.randomUUID() } : {}),
        },
        ...(method === "POST" ? { body: payload } : {}),
      });
      const body = await response.json();
      setResult(JSON.stringify({ status: response.status, body }, null, 2));
    } catch (error) {
      setResult(
        JSON.stringify(
          { error: error instanceof Error ? error.message : "Request failed" },
          null,
          2,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!path) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Thao tác dữ liệu thật</CardTitle>
        <CardDescription>
          Admin UI gọi trực tiếp REST API local, có RBAC và audit như CLI/AI.
        </CardDescription>
        <CardAction>
          <Badge variant="secondary">LIVE API</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup className="grid gap-4 md:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="admin-api-url">API URL</FieldLabel>
            <Input
              id="admin-api-url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-organization-id">Organization ID</FieldLabel>
            <Input
              id="admin-organization-id"
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-access-token">Access token</FieldLabel>
            <Input
              id="admin-access-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Bearer token"
            />
          </Field>
        </FieldGroup>
        <div className="flex gap-2">
          <Select value={method} onValueChange={(value) => setMethod(value as "GET" | "POST")}>
            <SelectTrigger aria-label="HTTP method" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input
            value={requestPath}
            onChange={(event) => setRequestPath(event.target.value)}
            aria-label="API path"
          />
          <Button onClick={execute} disabled={busy}>
            {busy ? "Đang gửi…" : "Gửi request"}
          </Button>
        </div>
        <FieldGroup className="grid gap-4 lg:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="admin-request-json">Request JSON</FieldLabel>
            <Textarea
              id="admin-request-json"
              className="min-h-64 font-mono"
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              disabled={method === "GET"}
              spellCheck={false}
            />
          </Field>
          <Field>
            <FieldLabel>Response</FieldLabel>
            <pre className="min-h-64 overflow-auto rounded-md border p-3">{result}</pre>
          </Field>
        </FieldGroup>
        <p className="text-muted-foreground text-sm">
          Ví dụ workflow: đổi path thành <code>{path}/&lt;id&gt;/approve</code>, chọn POST và gửi{" "}
          <code>{`{"reason":"Đã kiểm tra"}`}</code>.
        </p>
      </CardContent>
    </Card>
  );
}
