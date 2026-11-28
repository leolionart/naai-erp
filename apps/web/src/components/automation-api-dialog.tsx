"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronRightIcon, ClipboardIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import * as Examples from "./automation-api-examples";

export * from "./automation-api-examples";

export function AutomationApiReferenceSection({
  resources = Examples.ALL_AUTOMATION_RESOURCES,
}: Readonly<{ resources?: readonly Examples.AutomationResource[] }>) {
  const [credential, setCredential] = useState<Examples.RevealedCredential | null>(null);
  const [showCredential, setShowCredential] = useState(false);
  const [copiedCredential, setCopiedCredential] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeResource, setActiveResource] = useState<Examples.ResourceFilter>("all");
  const fetchedRef = useRef(false);

  async function reveal() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/auth/automation-token", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error("Không thể lấy token từ phiên đăng nhập.");
      setCredential((await response.json()) as Examples.RevealedCredential);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể lấy token.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void reveal();
  }, []);

  async function copy(value: string, isApiKey = false) {
    await navigator.clipboard.writeText(value);
    toast.success(isApiKey ? "Đã sao chép API key." : "Đã sao chép vào clipboard.");
    if (isApiKey) {
      setCopiedCredential(true);
      window.setTimeout(() => setCopiedCredential(false), 1800);
    }
  }

  const filterKeys: Examples.ResourceFilter[] = ["all", ...resources];
  const selected =
    activeResource === "all" ? resources : resources.filter((item) => item === activeResource);
  const definitions = credential ? Examples.definitionsFor(credential, selected) : [];
  const curlExamples = definitions.filter((item) => item.kind !== "n8n-expression");
  const n8nExamples = definitions.filter((item) => item.kind === "n8n-expression");
  const toggleLabel = showCredential ? "Ẩn API key" : "Hiện API key";
  const maskedToken = showCredential
    ? credential?.apiToken
    : "•".repeat(Math.min(32, credential?.apiToken.length ?? 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kết nối REST API &amp; Tài liệu tự động hóa</CardTitle>
        <CardDescription>
          Khóa API của tổ chức, biểu thức chuẩn hóa OCR cho n8n và mẫu request cURL một bước cho
          từng phân hệ nghiệp vụ.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        {loading ? <Skeleton className="h-40 w-full" /> : null}

        {!loading && loadError && !credential ? (
          <Alert variant="destructive">
            <AlertTitle>Không thể tải thông tin kết nối API</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{loadError}</span>
              <Button variant="outline" size="sm" onClick={() => void reveal()}>
                Tải lại thông tin kết nối API
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {credential ? (
          <>
            <section className="min-w-0 rounded-xl border bg-muted/20 p-3" aria-label="API key">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">API key của tổ chức</p>
                  <p className="text-xs text-muted-foreground">
                    Chỉ hiển thị trong phiên hiện tại. Lưu vào credential manager của n8n, không lưu
                    trong workflow JSON hoặc log.
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  Org: {credential.organizationId}
                </span>
              </div>
              <div className="mt-3 flex min-w-0 gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-background px-3 py-2 text-xs">
                  {maskedToken}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={toggleLabel}
                  onClick={() => setShowCredential((v) => !v)}
                >
                  {showCredential ? <EyeOffIcon /> : <EyeIcon />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Sao chép API key"
                  onClick={() => void copy(credential.apiToken, true)}
                >
                  {copiedCredential ? <CheckIcon /> : <ClipboardIcon />}
                </Button>
              </div>
            </section>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Bộ lọc phân hệ API">
              {filterKeys.map((key) => (
                <Button
                  key={key}
                  size="sm"
                  variant={activeResource === key ? "default" : "outline"}
                  aria-pressed={activeResource === key}
                  onClick={() => setActiveResource(key)}
                >
                  {Examples.AUTOMATION_FILTER_LABELS[key]}
                </Button>
              ))}
            </div>

            <div className="flex min-w-0 flex-col gap-3">
              {curlExamples.map((item) => (
                <ProtocolExample key={item.title} item={item} onCopy={copy} />
              ))}
              {n8nExamples.length > 0 ? (
                <section className="mt-2 border-t pt-3">
                  <p className="mb-1 text-sm font-medium">Nâng cao cho n8n</p>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Expression chỉ dùng trong node HTTP Request ở chế độ Expression, không phải
                    cURL.
                  </p>
                  <div className="flex min-w-0 flex-col gap-3">
                    {n8nExamples.map((item) => (
                      <ProtocolExample key={item.title} item={item} onCopy={copy} />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ProtocolExample({
  item,
  onCopy,
}: Readonly<{ item: Examples.ExampleDefinition; onCopy: (value: string) => Promise<void> }>) {
  if (item.kind === "n8n-expression") {
    return (
      <section className="min-w-0 rounded-xl border border-dashed bg-muted/10 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium">{item.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void onCopy(item.value)}>
            <ClipboardIcon data-icon="inline-start" /> Sao chép expression
          </Button>
        </div>
        <Collapsible className="group mt-3 min-w-0">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">
              <ChevronRightIcon className="transition-transform group-data-[state=open]:rotate-90" />
              Xem expression
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 overflow-hidden rounded-lg border bg-background">
            <pre className="max-h-[40svh] overflow-auto bg-muted/40 p-4 text-xs leading-relaxed">
              <code>{item.value}</code>
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </section>
    );
  }
  return (
    <Collapsible className="group min-w-0 rounded-xl border">
      <div className="flex min-w-0 flex-col items-stretch gap-2 p-3 sm:flex-row sm:items-start">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto min-w-0 flex-1 items-start justify-start py-2 whitespace-normal text-left"
          >
            <ChevronRightIcon className="transition-transform group-data-[state=open]:rotate-90" />
            <span className="flex min-w-0 flex-col items-start gap-1">
              <span className="font-medium">{item.title}</span>
              <span className="text-xs font-normal text-muted-foreground">{item.description}</span>
            </span>
          </Button>
        </CollapsibleTrigger>
        <Button
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => void onCopy(item.value)}
        >
          <ClipboardIcon data-icon="inline-start" /> Sao chép cURL
        </Button>
      </div>
      <CollapsibleContent>
        {item.method && item.path ? (
          <div className="space-y-3 border-t px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-primary px-2 py-1 font-semibold text-primary-foreground">
                {item.method}
              </span>
              <code className="break-all text-muted-foreground">
                /api/v1/organizations/:organizationId{item.path}
              </code>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldList title="Bắt buộc" values={item.required} />
              <FieldList title="Tùy chọn" values={item.optional} />
            </div>
            {item.response ? (
              <div>
                <p className="mb-1 font-medium">Phản hồi thành công</p>
                <pre className="overflow-auto rounded-md bg-muted/40 p-3">
                  <code>{item.response}</code>
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
        <pre className="max-h-[45svh] overflow-auto border-t bg-muted/40 p-4 text-xs leading-relaxed">
          <code>{item.value}</code>
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FieldList({ title, values }: Readonly<{ title: string; values?: readonly string[] }>) {
  if (!values?.length) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1 font-medium">{title}</p>
      <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
        {values.map((v) => (
          <li key={v} className="break-words">
            <code>{v}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
