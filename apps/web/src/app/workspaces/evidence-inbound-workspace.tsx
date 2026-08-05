"use client";

import { type FormEvent, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
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
    <section aria-labelledby="operations-title" className="mt-5 flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle id="operations-title">Chứng từ & Webhook inbox</CardTitle>
          <CardDescription>
            Upload, review, cấp URL tải và xử lý sự kiện lỗi mà không cần nhập JSON.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldGroup className="grid gap-4 md:grid-cols-[2fr_1fr_2fr]">
            <Field>
              <FieldLabel htmlFor="evidence-api-url">API URL</FieldLabel>
              <Input
                id="evidence-api-url"
                aria-label="API URL"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="evidence-organization-id">Organization ID</FieldLabel>
              <Input
                id="evidence-organization-id"
                aria-label="Organization ID"
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="evidence-access-token">Access token</FieldLabel>
              <Input
                id="evidence-access-token"
                aria-label="Access token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </Field>
          </FieldGroup>
          <Alert>
            <AlertDescription role="status" aria-live="polite">
              {busy ? "Đang xử lý…" : notice}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <form aria-labelledby="upload-title" onSubmit={uploadEvidence}>
            <Card>
              <CardHeader>
                <CardTitle id="upload-title">Tải chứng từ</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel>Loại nguồn</FieldLabel>
                    <Select name="subjectType" defaultValue="expense">
                      <SelectTrigger aria-label="Loại nguồn chứng từ">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="expense">Chi phí</SelectItem>
                          <SelectItem value="commercial_document">Hóa đơn</SelectItem>
                          <SelectItem value="contract">Hợp đồng</SelectItem>
                          <SelectItem value="project">Dự án</SelectItem>
                          <SelectItem value="milestone">Milestone</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="evidence-subject-id">ID nguồn</FieldLabel>
                    <Input
                      id="evidence-subject-id"
                      name="subjectId"
                      aria-label="ID nguồn chứng từ"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="evidence-kind">Loại chứng từ</FieldLabel>
                    <Input
                      id="evidence-kind"
                      name="evidenceType"
                      aria-label="Loại chứng từ"
                      placeholder="invoice, receipt, contract…"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="evidence-upload-file">
                      File PDF, XML, PNG hoặc JPEG
                    </FieldLabel>
                    <Input
                      id="evidence-upload-file"
                      name="file"
                      aria-label="File chứng từ"
                      type="file"
                      accept="application/pdf,application/xml,image/png,image/jpeg"
                      required
                    />
                  </Field>
                  <Button disabled={busy}>Tải lên</Button>
                </FieldGroup>
              </CardContent>
            </Card>
          </form>

          <Card>
            <CardHeader>
              <CardTitle>Danh sách chứng từ</CardTitle>
              <CardAction>
                <Button variant="outline" onClick={loadEvidence} disabled={busy}>
                  Làm mới chứng từ
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div role="list" aria-label="Danh sách chứng từ" className="flex flex-col gap-2">
                {evidenceItems.map((item) => {
                  const id = display(item, "id", "evidenceId");
                  return (
                    <Button
                      key={id}
                      role="listitem"
                      aria-pressed={selectedEvidence === item}
                      variant={selectedEvidence === item ? "secondary" : "outline"}
                      onClick={() => setSelectedEvidence(item)}
                      className="h-auto justify-start text-left"
                    >
                      <span>
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
                      </span>
                    </Button>
                  );
                })}
                {!evidenceItems.length ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>Chưa có chứng từ</EmptyTitle>
                      <EmptyDescription>Bấm “Làm mới chứng từ” để tải dữ liệu.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Review & tải xuống</CardTitle>
              <CardDescription>
                Đang chọn: {display(selectedEvidence ?? {}, "id", "evidenceId")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>Kết quả review</FieldLabel>
                  <Select value={reviewState} onValueChange={setReviewState}>
                    <SelectTrigger aria-label="Kết quả review chứng từ">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="accepted">Chấp nhận</SelectItem>
                        <SelectItem value="needs_review">Cần kiểm tra thêm</SelectItem>
                        <SelectItem value="rejected">Từ chối</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="evidence-review-reason">Lý do review</FieldLabel>
                  <Input
                    id="evidence-review-reason"
                    aria-label="Lý do review chứng từ"
                    value={reviewReason}
                    onChange={(e) => setReviewReason(e.target.value)}
                  />
                </Field>
                <Button type="button" onClick={reviewEvidence} disabled={busy || !selectedEvidence}>
                  Lưu kết quả review
                </Button>
                <Field>
                  <FieldLabel htmlFor="evidence-download-reason">Mục đích tải</FieldLabel>
                  <Input
                    id="evidence-download-reason"
                    aria-label="Mục đích tải chứng từ"
                    value={downloadReason}
                    onChange={(e) => setDownloadReason(e.target.value)}
                  />
                </Field>
                <Button
                  variant="outline"
                  type="button"
                  onClick={createDownloadUrl}
                  disabled={busy || !selectedEvidence}
                >
                  Cấp URL tải 2 phút
                </Button>
                {downloadUrl && downloadUrl !== "—" ? (
                  <Button asChild variant="link">
                    <a href={downloadUrl} target="_blank" rel="noreferrer">
                      Mở file chứng từ trong cửa sổ mới
                    </a>
                  </Button>
                ) : null}
              </FieldGroup>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Webhook inbox</CardTitle>
              <CardAction>
                <Button variant="outline" onClick={loadInbound} disabled={busy}>
                  Làm mới inbox
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FieldGroup className="grid gap-4 md:grid-cols-[1fr_2fr]">
                <Field>
                  <FieldLabel>Trạng thái</FieldLabel>
                  <Select
                    value={inboundState || "all"}
                    onValueChange={(value) => setInboundState(value === "all" ? "" : value)}
                  >
                    <SelectTrigger aria-label="Lọc trạng thái inbound">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">Tất cả</SelectItem>
                        <SelectItem value="received">Received</SelectItem>
                        <SelectItem value="succeeded">Succeeded</SelectItem>
                        <SelectItem value="retry_scheduled">Retry</SelectItem>
                        <SelectItem value="quarantined">Quarantine</SelectItem>
                        <SelectItem value="dead_letter">Dead letter</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="inbound-search">Tìm sự kiện</FieldLabel>
                  <Input
                    id="inbound-search"
                    aria-label="Tìm sự kiện inbound"
                    value={inboundQuery}
                    onChange={(e) => setInboundQuery(e.target.value)}
                    placeholder="external ID, event type, lỗi…"
                  />
                </Field>
              </FieldGroup>
              <div
                role="list"
                aria-label="Danh sách sự kiện inbound"
                className="flex flex-col gap-2"
              >
                {visibleInbound.map((item) => {
                  const id = display(item, "id", "messageId");
                  return (
                    <Button
                      key={id}
                      role="listitem"
                      variant="outline"
                      onClick={() => openInbound(item)}
                      className="h-auto justify-start text-left"
                    >
                      <span>
                        <strong>{display(item, "event_type", "eventType")}</strong>
                        <br />
                        <small>
                          {display(item, "external_id", "externalId")} · {display(item, "state")} ·{" "}
                          {display(item, "attempt_count", "attemptCount")} lần thử
                        </small>
                      </span>
                    </Button>
                  );
                })}
                {!visibleInbound.length ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>Không có sự kiện</EmptyTitle>
                      <EmptyDescription>Không có sự kiện phù hợp bộ lọc.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Chi tiết & replay</CardTitle>
              {selectedInbound ? (
                <CardAction>
                  <Badge variant="secondary">{display(selectedInbound, "state")}</Badge>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent>
              <FieldGroup>
                {selectedInbound ? (
                  <pre
                    aria-label="Chi tiết sự kiện inbound"
                    className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap"
                  >
                    {JSON.stringify(selectedInbound, null, 2)}
                  </pre>
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>Chưa chọn sự kiện</EmptyTitle>
                      <EmptyDescription>
                        Chọn một sự kiện để xem payload hash, attempts và lỗi xử lý.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
                <Field>
                  <FieldLabel htmlFor="inbound-replay-reason">Lý do replay</FieldLabel>
                  <Input
                    id="inbound-replay-reason"
                    aria-label="Lý do replay inbound"
                    value={replayReason}
                    onChange={(e) => setReplayReason(e.target.value)}
                  />
                </Field>
                <Button onClick={replayInbound} disabled={busy || !selectedInbound}>
                  Replay sự kiện có audit
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
