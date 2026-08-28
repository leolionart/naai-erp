"use client";

import { useState } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CodeXmlIcon,
  EyeIcon,
  EyeOffIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

type RevealedCredential = Readonly<{ organizationId: string; apiToken: string }>;
export type AutomationResource =
  "customers" | "projects" | "subscriptions" | "purchase-products" | "revenue" | "expenses";

type CurlDefinition = Readonly<{
  title: string;
  description: string;
  value: string;
  kind?: "curl" | "n8n-expression";
}>;

function masterDataCreateCurl(
  credential: RevealedCredential,
  resource: string,
  idempotencyKey: string,
  data: Record<string, unknown>,
) {
  return `curl --request POST \\
  'https://erp.naai.studio/api/v1/organizations/${credential.organizationId}/master-data/${resource}' \\
  --header 'Authorization: Bearer ${credential.apiToken}' \\
  --header 'Content-Type: application/json' \\
  --header 'Idempotency-Key: ${idempotencyKey}' \\
  --header 'X-Correlation-Id: ${idempotencyKey}' \\
  --data '${JSON.stringify({ data }, null, 2)}'`;
}

export function customerCurl(credential: RevealedCredential) {
  const party = masterDataCreateCurl(credential, "parties", "n8n-customer-naai-demo-v1", {
    id: "party-customer-naai-demo",
    display_name: "Công ty Khách hàng Demo",
    legal_name: "CÔNG TY TNHH KHÁCH HÀNG DEMO",
    normalized_tax_id: "0312345678",
    registered_address: "Thành phố Hồ Chí Minh",
    email: "contact@example.com",
    phone: "0900000000",
    website: "https://example.com",
    status: "active",
  });
  const role = masterDataCreateCurl(credential, "party-roles", "n8n-customer-naai-demo-role-v1", {
    party_id: "party-customer-naai-demo",
    role: "client",
  });
  return `${party}\n\n${role}`;
}

export function projectCurl(credential: RevealedCredential) {
  return masterDataCreateCurl(credential, "projects", "n8n-project-naai-demo-v1", {
    id: "project-naai-demo",
    code: "NAAI-DEMO",
    name: "Dự án NAAI Demo",
    client_party_id: "party-customer-naai-demo",
    owner_user_id: "owner-user-id",
    contract_type: "fixed_fee",
    currency: "VND",
    budget_minor: "50000000",
    default_service_line_code: "SOFTWARE_DEV",
    starts_on: "2026-08-12",
    ends_on: "2026-12-31",
    state: "planned",
  });
}

export function servicePlanCurl(credential: RevealedCredential) {
  return `curl --request POST \\
  'https://erp.naai.studio/api/v1/organizations/${credential.organizationId}/service-plans' \\
  --header 'Authorization: Bearer ${credential.apiToken}' \\
  --header 'Content-Type: application/json' \\
  --header 'Idempotency-Key: n8n-service-plan-website-care-v1' \\
  --data '{
    "schemaVersion": 1,
    "id": "service-plan-website-care",
    "code": "WEBSITE_CARE",
    "name": "Chăm sóc website định kỳ",
    "serviceLineCode": "SOFTWARE_DEV",
    "defaultUnitPriceMinor": "5000000",
    "currency": "VND",
    "recurrence": { "frequency": "month", "interval": 1, "billingDay": 1 },
    "reason": "Đồng bộ danh mục gói dịch vụ từ n8n"
  }'`;
}

export function subscriptionCurl(credential: RevealedCredential) {
  return `curl --request POST \\
  'https://erp.naai.studio/api/v1/organizations/${credential.organizationId}/customer-service-subscriptions' \\
  --header 'Authorization: Bearer ${credential.apiToken}' \\
  --header 'Content-Type: application/json' \\
  --header 'Idempotency-Key: n8n-subscription-customer-demo-v1' \\
  --data '{
    "schemaVersion": 1,
    "id": "subscription-customer-demo",
    "customerPartyId": "party-customer-naai-demo",
    "servicePlanId": "service-plan-website-care",
    "projectId": "project-naai-demo",
    "startsOn": "2026-08-12",
    "endsOn": null,
    "quantity": "1",
    "unitPriceMinor": "5000000",
    "currency": "VND",
    "recurrence": { "frequency": "month", "interval": 1, "billingDay": 1 },
    "reason": "Khách hàng đăng ký dịch vụ định kỳ"
  }'`;
}

export function salesInvoiceCurl(credential: RevealedCredential) {
  return `curl --request POST \\
  'https://erp.naai.studio/api/v1/organizations/${credential.organizationId}/commercial-documents' \\
  --header 'Authorization: Bearer ${credential.apiToken}' \\
  --header 'Content-Type: application/json' \\
  --header 'Idempotency-Key: n8n-sales-invoice-2026-0001' \\
  --data '{
    "id": "sales-invoice-2026-0001",
    "type": "sales_invoice",
    "documentNumber": "00000001",
    "series": "1C26TAA",
    "fiscalYear": 2026,
    "partyId": "party-customer-naai-demo",
    "documentDate": "2026-08-12",
    "dueDate": "2026-08-26",
    "currency": "VND",
    "netMinor": "10000000",
    "taxMinor": "1000000",
    "grossMinor": "11000000",
    "controlAccountCode": "131-AR",
    "lines": [{
      "description": "Dịch vụ phát triển phần mềm",
      "quantity": "1",
      "unitPriceMinor": "10000000",
      "netMinor": "10000000",
      "taxMinor": "1000000",
      "grossMinor": "11000000",
      "primaryAccountCode": "511-REV",
      "taxAccountCode": "3331-VAT-OUT",
      "taxCode": "VAT10",
      "allocations": [{
        "id": "sales-invoice-2026-0001-line-1",
        "amountMinor": "10000000",
        "dimensions": { "projectId": "project-naai-demo" }
      }]
    }],
    "externalReference": {
      "system": "n8n",
      "externalId": "sales-invoice-source-0001",
      "version": "1"
    }
  }'`;
}

/** One-call revenue ingestion: the backend resolves the customer and posting defaults. */
export function quickRevenueIngestionCurl(credential: RevealedCredential) {
  return `curl --request POST \\
  'https://erp.naai.studio/api/v1/organizations/${credential.organizationId}/commercial-documents/sales-invoice-ingestion' \\
  --header 'Authorization: Bearer ${credential.apiToken}' \\
  --header 'Content-Type: application/json' --header 'Idempotency-Key: revenue-{{$json.id}}' \\
  --data '{
    "customerTaxId": "0312345678",
    "customerName": "CÔNG TY TNHH KHÁCH HÀNG DEMO",
    "documentNumber": "00000001",
    "documentDate": "2026-08-12",
    "category": "SOFTWARE_DEV",
    "description": "Dịch vụ phát triển phần mềm",
    "grossMinor": "11000000"
  }'`;
}

export function directExpenseCurl(credential: RevealedCredential) {
  return `curl --request POST \\
  'https://erp.naai.studio/api/v1/organizations/${credential.organizationId}/expenses' \\
  --header 'Authorization: Bearer ${credential.apiToken}' \\
  --header 'Content-Type: application/json' \\
  --header 'Idempotency-Key: n8n-direct-expense-2026-0001' \\
  --data '{
    "id": "direct-expense-2026-0001",
    "expenseClass": "receipt_backed",
    "payeePartyId": "party-supplier-id",
    "expenseDate": "2026-08-12",
    "businessPurpose": "Chi phí vận hành có chứng từ nhưng không phải hóa đơn VAT",
    "currency": "VND",
    "netMinor": "500000",
    "vatMinor": "0",
    "grossMinor": "500000",
    "counterAccountCode": "3388-OWNER",
    "evidenceChecklist": { "invoice": false, "receipt": true, "payment": true },
    "lines": [{
      "description": "Chi phí vận hành",
      "netMinor": "500000",
      "vatMinor": "0",
      "grossMinor": "500000",
      "postingAccountCode": "642-COST",
      "expenseCategoryCode": "BUSINESS_SERVICE",
      "vatState": "ineligible",
      "allocations": [{
        "id": "direct-expense-2026-0001-line-1",
        "amountMinor": "500000",
        "dimensions": { "projectId": "project-naai-demo", "category": "BUSINESS_SERVICE" }
      }]
    }],
    "externalReference": { "system": "n8n", "externalId": "expense-source-0001", "version": "1" }
  }'`;
}

export function purchaseInvoiceCurl(credential: RevealedCredential) {
  return `curl --request POST \\
  'https://erp.naai.studio/api/v1/organizations/${credential.organizationId}/commercial-documents' \\
  --header 'Authorization: Bearer ${credential.apiToken}' \\
  --header 'Content-Type: application/json' \\
  --header 'Idempotency-Key: n8n-paperless-invoice-2026-0001' \\
  --header 'X-Correlation-Id: n8n-paperless-invoice-2026-0001' \\
  --data '{
    "id": "paperless-invoice-2026-0001",
    "type": "purchase_invoice",
    "documentNumber": "00001234",
    "series": "1C26TAA",
    "fiscalYear": 2026,
    "partyId": "supplier-party-id",
    "documentDate": "2026-08-11",
    "dueDate": "2026-08-11",
    "currency": "VND",
    "netMinor": "1000000",
    "taxMinor": "100000",
    "grossMinor": "1100000",
    "controlAccountCode": "331-AP",
    "fundingSource": {
      "type": "financial_account",
      "financialAccountId": "company-bank-account-id"
    },
    "lines": [{
      "description": "Dịch vụ phục vụ hoạt động doanh nghiệp",
      "quantity": "1",
      "unitPriceMinor": "1000000",
      "netMinor": "1000000",
      "taxMinor": "100000",
      "grossMinor": "1100000",
      "primaryAccountCode": "642-COST",
      "taxAccountCode": "1331-VAT-IN",
      "taxCode": "VAT10",
      "dimensions": { "category": "BUSINESS_SERVICE" },
      "allocations": [{
        "id": "paperless-invoice-2026-0001-line-1",
        "amountMinor": "1000000",
        "dimensions": { "projectId": "project-id" }
      }]
    }],
    "externalReference": {
      "system": "paperless-ngx",
      "externalId": "paperless-document-1234",
      "canonicalUrl": "https://paperless.example/documents/1234",
      "checksum": "sha256-of-source-file",
      "version": "1",
      "syncedAt": "2026-08-11T16:00:00Z",
      "metadata": { "n8nWorkflow": "purchase-invoice-ingestion" }
    }
  }'`;
}

export function quickOcrPurchaseInvoiceIngestionCurl(credential: RevealedCredential) {
  return `curl --request POST \\
  'https://erp.naai.studio/api/v1/organizations/${credential.organizationId}/commercial-documents/purchase-invoice-ingestion' \\
  --header 'Authorization: Bearer ${credential.apiToken}' \\
  --header 'Content-Type: application/json' --header 'Idempotency-Key: purchase-{{$json.id}}' \\
  --data '{
    "supplierTaxId": "0110660175",
    "supplierName": "CÔNG TY CỔ PHẦN PHÁT TRIỂN TRẠM SẠC TOÀN CẦU V-GREEN",
    "documentNumber": "00250571",
    "documentDate": "2026-07-27",
    "category": "EV_BATTERY_CHARGING",
    "description": "Phí dịch vụ trạm sạc tháng 7 năm 2026",
    "grossMinor": "408601",
    "externalReference": { "system": "paperless-ngx", "externalId": "246" }
  }'`;
}

export function discardDraftPurchaseInvoiceCurl(credential: RevealedCredential) {
  return `curl --request DELETE \\
  'https://erp.naai.studio/api/v1/organizations/${credential.organizationId}/commercial-documents/{{$json["data"]["document"]["documentId"]}}' \\
  --header 'Authorization: Bearer ${credential.apiToken}' \\
  --header 'Content-Type: application/json' \\
  --header 'If-Match: {{$json["data"]["document"]["resourceVersion"]}}' \\
  --header 'Idempotency-Key: discard-paperless-invoice-246-v1' \\
  --header 'X-Correlation-Id: discard-paperless-invoice-246-v1' \\
  --data '{
    "reason": "Xóa hóa đơn nháp tạo dư do workflow n8n nhập nhầm"
  }'`;
}

export function n8nOcrMappingExpression() {
  return `{{
  (() => {
    const output = $json.output ?? {};
    const text = (value) => value == null ? "" : String(value).trim();
    const digits = (value) => text(value).replace(/[^0-9]/g, "");
    const moneyMinor = (value) => {
      const raw = text(value)
        .replace(/(?:VND|VNĐ|₫)/gi, "")
        .replace(/\\s/g, "")
        .replace(/([.,]00)$/, "");
      const normalized = digits(raw);
      return normalized || null;
    };
    const isoDate = (value) => {
      const raw = text(value);
      const parts = raw.match(/^(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{4})(?:[ T].*)?$/);
      if (parts) return parts[3] + "-" + parts[2].padStart(2, "0") + "-" + parts[1].padStart(2, "0");
      const iso = raw.match(/^(\\d{4}-\\d{2}-\\d{2})(?:[ T].*)?$/);
      return iso ? iso[1] : null;
    };
    const taxNumber = digits(output["Mã số thuế (Tax code)"] ?? output["Mã số thuế"]);
    const supplierName = text(output["Ký bởi"] ?? output["Tên người bán"] ?? output["Đơn vị bán hàng"]);
    const documentDate = isoDate(output["Ký ngày"] ?? output["Ngày hóa đơn"] ?? output["Ngày lập"]);
    const content = text($json.content);
    const invoiceNumber = text(
      output["Số hóa đơn"] ??
      output["Số (Inv No.)"] ??
      output["Invoice No."] ??
      ((content.match(/(?:Số \\(Inv No\\.\\)|Số hóa đơn|Invoice No\\.)[^0-9]*(\\d{5,12})/i) ?? [])[1])
    );
    const sourceDocumentId = text($json.id);
    const totalPaymentMinor = moneyMinor(output["Tổng cộng tiền thanh toán"]);
    const series = text(output["Ký hiệu (Serial)"] ?? output["Ký hiệu"] ?? output["Serial"]).replace(/\\s/g, "");
    const category = text(output["Hạng mục"] ?? output["Danh mục"] ?? output["Loại chi phí"]);
    const description = text(output["Tên hàng hóa, dịch vụ"] ?? output["Nội dung"] ?? output["Diễn giải"]);
    const canonicalUrl = text($json.url ?? $json.canonical_url) ||
      (sourceDocumentId ? "https://paper.naai.studio/api/documents/" + sourceDocumentId + "/download/" : "");

    return {
      "schemaVersion": 1,
      "supplierTaxId": taxNumber,
      ...(supplierName ? { "supplierName": supplierName } : {}),
      "documentNumber": invoiceNumber,
      ...(series ? { "series": series } : {}),
      "documentDate": documentDate,
      ...(category ? { "category": category } : {}),
      "description": description,
      "grossMinor": totalPaymentMinor,
      "currency": "VND",
      "externalReference": {
        system: "paperless-ngx",
        externalId: sourceDocumentId,
        ...(canonicalUrl ? { canonicalUrl } : {}),
        ...(text($json.checksum) ? { checksum: text($json.checksum) } : {}),
        version: "1",
        metadata: {
          sourceTitle: text($json.title),
          originalFileName: text($json.original_file_name),
          archivedFileName: text($json.archived_file_name),
          rawCategory: category || null,
          sourceCreatedAt: text($json.created),
          sourceModifiedAt: text($json.modified)
        }
      }
    };
  })()
}}`;
}

export function purchaseProductCurl(credential: RevealedCredential) {
  return `curl --request POST \\
  'https://erp.naai.studio/api/v1/organizations/${credential.organizationId}/master-data/purchase-products' \\
  --header 'Authorization: Bearer ${credential.apiToken}' \\
  --header 'Content-Type: application/json' \\
  --header 'Idempotency-Key: n8n-purchase-product-business-service-v1' \\
  --data '{
    "data": {
      "code": "BUSINESS_SERVICE_10",
      "name": "Dịch vụ phục vụ hoạt động doanh nghiệp",
      "vat_rate_percent": 10,
      "is_active": true
    }
  }'`;
}

function definitionsFor(
  credential: RevealedCredential,
  resources: readonly AutomationResource[],
): CurlDefinition[] {
  const definitions: Record<AutomationResource, CurlDefinition[]> = {
    customers: [
      {
        title: "Tạo khách hàng và gán vai trò client",
        description: "Tạo party trước, sau đó dùng đúng party ID để gán vai trò khách hàng.",
        value: customerCurl(credential),
      },
    ],
    projects: [
      {
        title: "Tạo dự án liên kết khách hàng",
        description:
          "client_party_id phải là party đã có vai trò client; owner_user_id phải tồn tại trong tổ chức.",
        value: projectCurl(credential),
      },
    ],
    subscriptions: [
      {
        title: "Tạo gói dịch vụ",
        description: "Tạo service plan trước để nhận servicePlanId ổn định.",
        value: servicePlanCurl(credential),
      },
      {
        title: "Gán subscription cho khách hàng",
        description: "Liên kết customerPartyId, servicePlanId và projectId đã tồn tại.",
        value: subscriptionCurl(credential),
      },
    ],
    "purchase-products": [
      {
        title: "Thêm sản phẩm mua vào",
        description: "Tạo danh mục gợi ý cho n8n phân loại dòng hóa đơn. VAT chỉ nhận 8 hoặc 10.",
        value: purchaseProductCurl(credential),
      },
    ],
    revenue: [
      {
        title: "Nhập nhanh doanh thu bằng một request",
        description:
          "ERP tự tìm hoặc tạo khách hàng theo mã số thuế, áp dụng tài khoản và trạng thái phù hợp; không cần gọi API party, account hay project riêng.",
        value: quickRevenueIngestionCurl(credential),
      },
      {
        title: "Nhập hóa đơn đầu ra hoàn chỉnh",
        description:
          "partyId là khách hàng; projectId nằm trong allocation và phải thuộc chính khách hàng đó.",
        value: salesInvoiceCurl(credential),
      },
    ],
    expenses: [
      {
        title: "Expression n8n: chuẩn hóa toàn bộ dữ liệu OCR",
        description:
          "Dán nguyên khối vào JSON Body của HTTP Request ở chế độ Expression. Kết quả là body nhập hóa đơn một-call đã chuẩn hóa tiền, ngày, mã số thuế và tự lấy số hóa đơn từ nội dung khi OCR không tách field riêng.",
        value: n8nOcrMappingExpression(),
        kind: "n8n-expression",
      },
      {
        title: "Nhập nhanh hóa đơn OCR bằng một request",
        description:
          "ERP tự tạo hoặc dùng lại nhà cung cấp theo mã số thuế, gán vai trò supplier và nhập hóa đơn tối giản. Không cần dự án hay tài khoản thanh toán.",
        value: quickOcrPurchaseInvoiceIngestionCurl(credential),
      },
      {
        title: "Xóa hóa đơn nháp tạo dư",
        description:
          "Chỉ dùng cho hóa đơn còn ở trạng thái draft và chưa có bút toán. Lấy version hiện tại của hóa đơn để điền vào If-Match; hóa đơn đã ghi sổ phải dùng quy trình hủy hoặc đảo bút toán.",
        value: discardDraftPurchaseInvoiceCurl(credential),
      },
      {
        title: "Nhập hóa đơn đầu vào hoàn chỉnh",
        description:
          "Tạo purchase invoice; fundingSource chỉ dùng khi công ty thực trả từ tài khoản tài chính đã khai báo.",
        value: purchaseInvoiceCurl(credential),
      },
      {
        title: "Nhập chi phí không phải hóa đơn VAT",
        description:
          "Dùng expense cho biên nhận hoặc khoản chi trực tiếp; không tạo trùng purchase invoice.",
        value: directExpenseCurl(credential),
      },
    ],
  };
  return resources.flatMap((resource) => definitions[resource]);
}

export function AutomationApiDialog({
  resources,
}: Readonly<{ resources: readonly AutomationResource[] }>) {
  const [credential, setCredential] = useState<RevealedCredential | null>(null);
  const [showCredential, setShowCredential] = useState(false);
  const [copiedCredential, setCopiedCredential] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function reveal() {
    setLoading(true);
    try {
      const response = await fetch("/auth/automation-token", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error("Không thể lấy token từ phiên đăng nhập.");
      setCredential((await response.json()) as RevealedCredential);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể lấy token.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    toast.success("Đã sao chép mẫu đầy đủ.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen && !credential && !loading) void reveal();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <CodeXmlIcon data-icon="inline-start" />
          API & tự động hóa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] min-w-0 overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Ví dụ cURL cho n8n và AI</DialogTitle>
          <DialogDescription>
            Giao thức production tương ứng với dữ liệu có thể nhập tại màn hình hiện tại.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Đang tải ví dụ API…
          </div>
        ) : null}

        {credential ? (
          <div className="flex min-w-0 flex-col gap-3">
            <section className="rounded-xl border bg-muted/20 p-3" aria-label="API key">
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
                  {showCredential
                    ? credential.apiToken
                    : "•".repeat(Math.min(32, credential.apiToken.length))}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={showCredential ? "Ẩn API key" : "Hiện API key"}
                  onClick={() => setShowCredential((visible) => !visible)}
                >
                  {showCredential ? <EyeOffIcon /> : <EyeIcon />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Sao chép API key"
                  onClick={() => {
                    void navigator.clipboard.writeText(credential.apiToken).then(() => {
                      setCopiedCredential(true);
                      toast.success("Đã sao chép API key.");
                      window.setTimeout(() => setCopiedCredential(false), 1800);
                    });
                  }}
                >
                  {copiedCredential ? <CheckIcon /> : <ClipboardIcon />}
                </Button>
              </div>
            </section>
            {definitionsFor(credential, resources).map((definition) => (
              <ProtocolExample key={definition.title} {...definition} onCopy={copy} />
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProtocolExample({
  title,
  description,
  value,
  kind = "curl",
  onCopy,
}: Readonly<{
  title: string;
  description: string;
  value: string;
  kind?: "curl" | "n8n-expression";
  onCopy: (value: string) => Promise<void>;
}>) {
  return (
    <Collapsible className="group rounded-xl border">
      <div className="flex min-w-0 flex-col items-stretch gap-2 p-3 sm:flex-row sm:items-start">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto min-w-0 flex-1 items-start justify-start py-2 whitespace-normal text-left"
          >
            <ChevronRightIcon className="transition-transform group-data-[state=open]:rotate-90" />
            <span className="flex min-w-0 flex-col items-start gap-1">
              <span className="font-medium">{title}</span>
              <span className="text-xs font-normal text-muted-foreground">{description}</span>
            </span>
          </Button>
        </CollapsibleTrigger>
        <Button
          variant="outline"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => void onCopy(value)}
        >
          <ClipboardIcon data-icon="inline-start" /> Sao chép{" "}
          {kind === "curl" ? "cURL" : "expression"}
        </Button>
      </div>
      <CollapsibleContent>
        <pre className="max-h-[45svh] overflow-auto border-t bg-muted/40 p-4 text-xs leading-relaxed">
          <code>{value}</code>
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
