"use client";

import { type FormEvent, useMemo, useState } from "react";

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

export type EvidenceInboundWorkspaceProps = Readonly<{
  initialBaseUrl?: string;
  initialOrganizationId?: string;
  initialToken?: string;
  fetcher?: FetchLike;
}>;

export function buildOrganizationApiRoot(baseUrl: string, organizationId: string) {
  return `${baseUrl.replace(/\/$/, "")}/api/v1/organizations/${encodeURIComponent(organizationId)}`;
}

export function filterInboundEvents(items: readonly JsonRecord[], state: string, query: string) {
  const needle = query.trim().toLowerCase();
  return items.filter((item) => {
    const itemState = String(item.state ?? "");
    return (
      (!state || itemState === state) &&
      (!needle || JSON.stringify(item).toLowerCase().includes(needle))
    );
  });
}

function unwrapItems(payload: JsonRecord): JsonRecord[] {
  const data = (payload.data ?? payload) as JsonRecord;
  return Array.isArray(data)
    ? (data as JsonRecord[])
    : Array.isArray(data.items)
      ? (data.items as JsonRecord[])
      : [];
}

function display(item: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return "—";
}

function fileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không thể đọc file chứng từ."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
}

const cardStyle = {
  border: "1px solid #e5e8ee",
  borderRadius: 12,
  padding: 18,
  background: "#fff",
} as const;
const gridStyle = { display: "grid", gap: 14 } as const;
const fieldStyle = { display: "grid", gap: 6, fontSize: 12, fontWeight: 650 } as const;
const inputStyle = {
  minHeight: 38,
  border: "1px solid #d8dde7",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#fff",
} as const;
const buttonStyle = {
  minHeight: 38,
  border: 0,
  borderRadius: 8,
  padding: "8px 13px",
  background: "#3159d8",
  color: "#fff",
  fontWeight: 750,
  cursor: "pointer",
} as const;
const subtleButtonStyle = {
  ...buttonStyle,
  border: "1px solid #d8dde7",
  background: "#fff",
  color: "#293449",
} as const;

export function EvidenceInboundWorkspace({
  initialBaseUrl = "http://localhost:3001",
  initialOrganizationId = "org-demo",
  initialToken = "",
  fetcher = fetch,
}: EvidenceInboundWorkspaceProps) {
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [organizationId, setOrganizationId] = useState(initialOrganizationId);
  const [token, setToken] = useState(initialToken);
  const [notice, setNotice] = useState("Sẵn sàng tải chứng từ và webhook inbox.");
  const [busy, setBusy] = useState(false);
  const [evidenceItems, setEvidenceItems] = useState<JsonRecord[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<JsonRecord>();
  const [reviewState, setReviewState] = useState("accepted");
  const [reviewReason, setReviewReason] = useState("");
  const [downloadReason, setDownloadReason] = useState("Đối soát chứng từ");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [inboundItems, setInboundItems] = useState<JsonRecord[]>([]);
  const [selectedInbound, setSelectedInbound] = useState<JsonRecord>();
  const [inboundState, setInboundState] = useState("");
  const [inboundQuery, setInboundQuery] = useState("");
  const [replayReason, setReplayReason] = useState("");
  const apiRoot = useMemo(
    () => buildOrganizationApiRoot(baseUrl, organizationId),
    [baseUrl, organizationId],
  );
  const visibleInbound = useMemo(
    () => filterInboundEvents(inboundItems, inboundState, inboundQuery),
    [inboundItems, inboundQuery, inboundState],
  );

  async function request(path: string, method: "GET" | "POST" = "GET", body?: unknown) {
    const response = await fetcher(`${apiRoot}/${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        "content-type": "application/json",
        "x-correlation-id": crypto.randomUUID(),
        ...(method === "POST" ? { "idempotency-key": crypto.randomUUID() } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = (await response.json()) as JsonRecord;
    if (!response.ok) {
      const error = payload.error as JsonRecord | undefined;
      throw new Error(String(error?.message ?? `HTTP ${response.status}`));
    }
    return payload;
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Thao tác thất bại.");
    } finally {
      setBusy(false);
    }
  }

  async function loadEvidence() {
    await run(async () => {
      const payload = await request("evidence");
      const items = unwrapItems(payload);
      setEvidenceItems(items);
      setSelectedEvidence(undefined);
      setNotice(`Đã tải ${items.length} chứng từ.`);
    });
  }

  async function uploadEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) return setNotice("Vui lòng chọn file chứng từ.");
    await run(async () => {
      const contentBase64 = await fileAsBase64(file);
      await request("evidence", "POST", {
        subjectType: form.get("subjectType"),
        subjectId: form.get("subjectId"),
        evidenceType: form.get("evidenceType"),
        originalFilename: file.name,
        declaredMediaType: file.type || "application/octet-stream",
        contentBase64,
        source: "admin-ui",
      });
      event.currentTarget.reset();
      setNotice("Đã tải chứng từ lên và ghi nhận phiên bản mới.");
      await loadEvidence();
    });
  }

  async function reviewEvidence() {
    const id = display(selectedEvidence ?? {}, "id", "evidenceId");
    if (id === "—" || !reviewReason.trim()) return setNotice("Chọn chứng từ và nhập lý do review.");
    await run(async () => {
      await request(`evidence/${encodeURIComponent(id)}/review`, "POST", {
        state: reviewState,
        reason: reviewReason.trim(),
      });
      setNotice("Đã cập nhật kết quả review chứng từ.");
      await loadEvidence();
    });
  }

  async function createDownloadUrl() {
    const id = display(selectedEvidence ?? {}, "id", "evidenceId");
    if (id === "—" || !downloadReason.trim())
      return setNotice("Chọn chứng từ và nhập mục đích tải.");
    await run(async () => {
      const payload = await request(`evidence/${encodeURIComponent(id)}/download-url`, "POST", {
        reason: downloadReason.trim(),
        expiresInSeconds: 120,
      });
      const data = (payload.data ?? payload) as JsonRecord;
      setDownloadUrl(display(data, "url", "downloadUrl", "signedUrl"));
      setNotice("Đã cấp URL tải ngắn hạn và ghi audit.");
    });
  }

  async function loadInbound() {
    await run(async () => {
      const payload = await request("inbound-events");
      const items = unwrapItems(payload);
      setInboundItems(items);
      setSelectedInbound(undefined);
      setNotice(`Đã tải ${items.length} sự kiện inbound.`);
    });
  }

  async function openInbound(item: JsonRecord) {
    const id = display(item, "id", "messageId");
    await run(async () => {
      const payload = await request(`inbound-events/${encodeURIComponent(id)}`);
      setSelectedInbound((payload.data ?? payload) as JsonRecord);
      setNotice(`Đang xem sự kiện ${id}.`);
    });
  }

  async function replayInbound() {
    const id = display(selectedInbound ?? {}, "id", "messageId");
    if (id === "—" || !replayReason.trim()) return setNotice("Chọn sự kiện và nhập lý do replay.");
    await run(async () => {
      await request(`inbound-events/${encodeURIComponent(id)}/replay`, "POST", {
        reason: replayReason.trim(),
      });
      setNotice("Đã đưa sự kiện vào hàng đợi replay có audit.");
      await loadInbound();
    });
  }

  return (
    <section aria-labelledby="operations-title" style={{ ...gridStyle, marginTop: 18 }}>
      <div style={cardStyle}>
        <h2 id="operations-title" style={{ margin: 0 }}>
          Chứng từ & Webhook inbox
        </h2>
        <p style={{ margin: "6px 0 14px", color: "#667085", fontSize: 13 }}>
          Upload, review, cấp URL tải và xử lý sự kiện lỗi mà không cần nhập JSON.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr", gap: 12 }}>
          <label style={fieldStyle}>
            API URL
            <input
              aria-label="API URL"
              style={inputStyle}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </label>
          <label style={fieldStyle}>
            Organization ID
            <input
              aria-label="Organization ID"
              style={inputStyle}
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
            />
          </label>
          <label style={fieldStyle}>
            Access token
            <input
              aria-label="Access token"
              type="password"
              style={inputStyle}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
        </div>
        <p
          role="status"
          aria-live="polite"
          style={{ margin: "12px 0 0", color: "#475467", fontSize: 12 }}
        >
          {busy ? "Đang xử lý…" : notice}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={gridStyle}>
          <form aria-labelledby="upload-title" onSubmit={uploadEvidence} style={cardStyle}>
            <h3 id="upload-title" style={{ marginTop: 0 }}>
              Tải chứng từ
            </h3>
            <div style={gridStyle}>
              <label style={fieldStyle}>
                Loại nguồn
                <select
                  name="subjectType"
                  aria-label="Loại nguồn chứng từ"
                  style={inputStyle}
                  defaultValue="expense"
                >
                  <option value="expense">Chi phí</option>
                  <option value="commercial_document">Hóa đơn</option>
                  <option value="contract">Hợp đồng</option>
                  <option value="project">Dự án</option>
                  <option value="milestone">Milestone</option>
                </select>
              </label>
              <label style={fieldStyle}>
                ID nguồn
                <input
                  name="subjectId"
                  aria-label="ID nguồn chứng từ"
                  style={inputStyle}
                  required
                />
              </label>
              <label style={fieldStyle}>
                Loại chứng từ
                <input
                  name="evidenceType"
                  aria-label="Loại chứng từ"
                  style={inputStyle}
                  placeholder="invoice, receipt, contract…"
                  required
                />
              </label>
              <label style={fieldStyle}>
                File PDF, XML, PNG hoặc JPEG
                <input
                  name="file"
                  aria-label="File chứng từ"
                  type="file"
                  accept="application/pdf,application/xml,image/png,image/jpeg"
                  required
                />
              </label>
              <button style={buttonStyle} disabled={busy}>
                Tải lên
              </button>
            </div>
          </form>

          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0 }}>Danh sách chứng từ</h3>
              <button style={subtleButtonStyle} onClick={loadEvidence} disabled={busy}>
                Làm mới chứng từ
              </button>
            </div>
            <div
              role="list"
              aria-label="Danh sách chứng từ"
              style={{ ...gridStyle, marginTop: 12 }}
            >
              {evidenceItems.map((item) => {
                const id = display(item, "id", "evidenceId");
                return (
                  <button
                    key={id}
                    role="listitem"
                    aria-pressed={selectedEvidence === item}
                    onClick={() => setSelectedEvidence(item)}
                    style={{
                      ...subtleButtonStyle,
                      textAlign: "left",
                      background: selectedEvidence === item ? "#eef2ff" : "#fff",
                    }}
                  >
                    <strong>
                      {display(
                        item,
                        "original_filename",
                        "originalFilename",
                        "evidence_type",
                        "evidenceType",
                      )}
                    </strong>
                    <br />
                    <small>
                      {id} · {display(item, "review_state", "reviewState", "status")}
                    </small>
                  </button>
                );
              })}
              {!evidenceItems.length ? (
                <p>Chưa có chứng từ. Bấm “Làm mới chứng từ” để tải dữ liệu.</p>
              ) : null}
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Review & tải xuống</h3>
            <p style={{ fontSize: 12 }}>
              Đang chọn: <strong>{display(selectedEvidence ?? {}, "id", "evidenceId")}</strong>
            </p>
            <div style={gridStyle}>
              <label style={fieldStyle}>
                Kết quả review
                <select
                  aria-label="Kết quả review chứng từ"
                  style={inputStyle}
                  value={reviewState}
                  onChange={(e) => setReviewState(e.target.value)}
                >
                  <option value="accepted">Chấp nhận</option>
                  <option value="needs_review">Cần kiểm tra thêm</option>
                  <option value="rejected">Từ chối</option>
                </select>
              </label>
              <label style={fieldStyle}>
                Lý do review
                <textarea
                  aria-label="Lý do review chứng từ"
                  style={inputStyle}
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                />
              </label>
              <button
                style={buttonStyle}
                type="button"
                onClick={reviewEvidence}
                disabled={busy || !selectedEvidence}
              >
                Lưu kết quả review
              </button>
              <label style={fieldStyle}>
                Mục đích tải
                <input
                  aria-label="Mục đích tải chứng từ"
                  style={inputStyle}
                  value={downloadReason}
                  onChange={(e) => setDownloadReason(e.target.value)}
                />
              </label>
              <button
                style={subtleButtonStyle}
                type="button"
                onClick={createDownloadUrl}
                disabled={busy || !selectedEvidence}
              >
                Cấp URL tải 2 phút
              </button>
              {downloadUrl && downloadUrl !== "—" ? (
                <a href={downloadUrl} target="_blank" rel="noreferrer">
                  Mở file chứng từ trong cửa sổ mới
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div style={gridStyle}>
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0 }}>Webhook inbox</h3>
              <button style={subtleButtonStyle} onClick={loadInbound} disabled={busy}>
                Làm mới inbox
              </button>
            </div>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 12 }}
            >
              <label style={fieldStyle}>
                Trạng thái
                <select
                  aria-label="Lọc trạng thái inbound"
                  style={inputStyle}
                  value={inboundState}
                  onChange={(e) => setInboundState(e.target.value)}
                >
                  <option value="">Tất cả</option>
                  <option value="received">Received</option>
                  <option value="succeeded">Succeeded</option>
                  <option value="retry_scheduled">Retry</option>
                  <option value="quarantined">Quarantine</option>
                  <option value="dead_letter">Dead letter</option>
                </select>
              </label>
              <label style={fieldStyle}>
                Tìm sự kiện
                <input
                  aria-label="Tìm sự kiện inbound"
                  style={inputStyle}
                  value={inboundQuery}
                  onChange={(e) => setInboundQuery(e.target.value)}
                  placeholder="external ID, event type, lỗi…"
                />
              </label>
            </div>
            <div
              role="list"
              aria-label="Danh sách sự kiện inbound"
              style={{ ...gridStyle, marginTop: 12 }}
            >
              {visibleInbound.map((item) => {
                const id = display(item, "id", "messageId");
                return (
                  <button
                    key={id}
                    role="listitem"
                    onClick={() => openInbound(item)}
                    style={{ ...subtleButtonStyle, textAlign: "left" }}
                  >
                    <strong>{display(item, "event_type", "eventType")}</strong>
                    <br />
                    <small>
                      {display(item, "external_id", "externalId")} · {display(item, "state")} ·{" "}
                      {display(item, "attempt_count", "attemptCount")} lần thử
                    </small>
                  </button>
                );
              })}
              {!visibleInbound.length ? <p>Không có sự kiện phù hợp bộ lọc.</p> : null}
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0 }}>Chi tiết & replay</h3>
            {selectedInbound ? (
              <pre
                aria-label="Chi tiết sự kiện inbound"
                style={{
                  maxHeight: 330,
                  overflow: "auto",
                  padding: 12,
                  borderRadius: 8,
                  background: "#111827",
                  color: "#e5e7eb",
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                }}
              >
                {JSON.stringify(selectedInbound, null, 2)}
              </pre>
            ) : (
              <p>Chọn một sự kiện để xem payload hash, attempts và lỗi xử lý.</p>
            )}
            <label style={fieldStyle}>
              Lý do replay
              <textarea
                aria-label="Lý do replay inbound"
                style={inputStyle}
                value={replayReason}
                onChange={(e) => setReplayReason(e.target.value)}
              />
            </label>
            <button
              style={{ ...buttonStyle, marginTop: 10 }}
              onClick={replayInbound}
              disabled={busy || !selectedInbound}
            >
              Replay sự kiện có audit
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
