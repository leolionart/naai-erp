"use client";

import { useEffect, useMemo, useState } from "react";

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
    <section className="panel api-console">
      <div className="panel-head">
        <div>
          <h2>Thao tác dữ liệu thật</h2>
          <p>Admin UI gọi trực tiếp REST API local, có RBAC và audit như CLI/AI.</p>
        </div>
        <span className="api-badge">LIVE API</span>
      </div>
      <div className="connection-grid">
        <label>
          API URL
          <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
        </label>
        <label>
          Organization ID
          <input
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
          />
        </label>
        <label>
          Access token
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Bearer token"
          />
        </label>
      </div>
      <div className="request-row">
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value as "GET" | "POST")}
        >
          <option>GET</option>
          <option>POST</option>
        </select>
        <input
          value={requestPath}
          onChange={(event) => setRequestPath(event.target.value)}
          aria-label="API path"
        />
        <button className="primary" onClick={execute} disabled={busy}>
          {busy ? "Đang gửi…" : "Gửi request"}
        </button>
      </div>
      <div className="console-grid">
        <label>
          Request JSON
          <textarea
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            disabled={method === "GET"}
            spellCheck={false}
          />
        </label>
        <label>
          Response<pre>{result}</pre>
        </label>
      </div>
      <p className="helper">
        Ví dụ workflow: đổi path thành <code>{path}/&lt;id&gt;/approve</code>, chọn POST và gửi{" "}
        <code>{`{"reason":"Đã kiểm tra"}`}</code>.
      </p>
    </section>
  );
}
