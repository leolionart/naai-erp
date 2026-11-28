export type RevealedCredential = Readonly<{ organizationId: string; apiToken: string }>;
export type AutomationResource =
  "customers" | "projects" | "subscriptions" | "purchase-products" | "revenue" | "expenses";
export type ResourceFilter = "all" | AutomationResource;

export const AUTOMATION_FILTER_LABELS: Record<ResourceFilter, string> = {
  all: "Tất cả",
  expenses: "Chi phí & Hóa đơn mua",
  revenue: "Doanh thu",
  customers: "Khách hàng",
  projects: "Dự án",
  subscriptions: "Dịch vụ định kỳ",
  "purchase-products": "Sản phẩm mua vào",
};

export const ALL_AUTOMATION_RESOURCES = Object.keys(AUTOMATION_FILTER_LABELS).filter(
  (key): key is AutomationResource => key !== "all",
);

export type ExampleDefinition = Readonly<{
  title: string;
  description: string;
  value: string;
  kind?: "curl" | "n8n-expression";
  method?: string;
  path?: string;
  required?: readonly string[];
  optional?: readonly string[];
  response?: string;
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
    "payeePartyId": "party-supplier-id",
    "expenseClass": "receipt_backed",
    "expenseDate": "2026-08-12",
    "businessPurpose": "Chi phí vận hành có chứng từ nhưng không phải hóa đơn VAT",
    "grossMinor": "500000",
    "lines": [{
      "description": "Chi phí vận hành",
      "netMinor": "500000",
      "vatMinor": "0",
      "grossMinor": "500000",
      "postingAccountCode": "642-OPEX",
      "allocations": [{ "id": "direct-expense-2026-0001-line-1", "amountMinor": "500000", "dimensions": { "projectId": "project-id" } }]
    }],
    "externalReference": { "system": "n8n", "externalId": "direct-expense-2026-0001" }
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
    "netMinor": "371455",
    "taxMinor": "37146",
    "grossMinor": "408601",
    "taxAccountCode": "1331-VAT-IN",
    "taxCode": "VAT10_IN",
    "vatState": "unreviewed",
    "currency": "VND",
    "externalReference": { "system": "paperless-ngx", "externalId": "{{$json.id}}" }
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
    const explicitNetMinor = moneyMinor(output["Tiền hàng"] ?? output["Cộng tiền hàng"] ?? output["Giá tính thuế"] ?? output["Tổng tiền trước thuế"]);
    const explicitTaxMinor = moneyMinor(output["Tiền thuế GTGT"] ?? output["Tiền thuế"] ?? output["Thuế GTGT"] ?? output["VAT"]);
    const taxCode = text(output["Mã thuế"] ?? output["Mã số thuế suất"] ?? output["VAT code"]);
    const taxAccountCode = text(output["Tài khoản thuế"] ?? output["VAT account"]);
    const netMinor = explicitNetMinor || (totalPaymentMinor && explicitTaxMinor
      ? String(BigInt(totalPaymentMinor) - BigInt(explicitTaxMinor))
      : null);
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
      ...(netMinor && explicitTaxMinor ? { "netMinor": netMinor, "taxMinor": explicitTaxMinor } : {}),
      ...(taxAccountCode ? { "taxAccountCode": taxAccountCode } : {}),
      ...(taxCode ? { "taxCode": taxCode } : {}),
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
          rawNetMinor: explicitNetMinor,
          rawTaxMinor: explicitTaxMinor,
          rawTaxCode: taxCode || null,
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

export function definitionsFor(
  credential: RevealedCredential,
  resources: readonly AutomationResource[],
): ExampleDefinition[] {
  const definitions: Record<AutomationResource, ExampleDefinition[]> = {
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
        title: "Tạo doanh thu",
        description:
          "Tạo một khoản doanh thu bằng một request tối thiểu. ERP tự resolve khách hàng và tài khoản mặc định theo danh mục.",
        value: quickRevenueIngestionCurl(credential),
        method: "POST",
        path: "/commercial-documents/sales-invoice-ingestion",
        required: ["customerName", "documentNumber", "documentDate", "description", "grossMinor"],
        optional: "customerTaxId, category, project, dueDate, currency, externalReference".split(
          ", ",
        ),
        response: '{ "data": { "documentId": "…", "status": "draft" } }',
      },
    ],
    expenses: [
      {
        title: "Chuẩn hóa dữ liệu OCR (n8n Expression)",
        description:
          "Tùy chọn cho workflow n8n: chuyển output OCR thành JSON chuẩn trước khi gọi API. Đây không phải request REST và không dùng cURL.",
        value: n8nOcrMappingExpression(),
        kind: "n8n-expression",
      },
      {
        title: "Tạo hóa đơn đầu vào",
        description:
          "Request REST cho hóa đơn mua vào. ERP tự tìm hoặc tạo nhà cung cấp và áp dụng danh mục đã khai báo. Nếu Paperless có tiền trước thuế, VAT và mã thuế, hãy gửi thêm netMinor, taxMinor, taxAccountCode và taxCode để không bị ghi nhận thành VAT 0.",
        value: quickOcrPurchaseInvoiceIngestionCurl(credential),
        method: "POST",
        path: "/commercial-documents/purchase-invoice-ingestion",
        required:
          "supplierName hoặc supplierTaxId, documentNumber, documentDate, description, grossMinor".split(
            ", ",
          ),
        optional:
          "category, dueDate, currency, netMinor, taxMinor, taxAccountCode, taxCode, vatState, vatEligibleMinor, externalReference".split(
            ", ",
          ),
        response: '{ "data": { "documentId": "…", "status": "draft" } }',
      },
      {
        title: "Tạo chi phí trực tiếp",
        description:
          "Dùng cho khoản chi không có hóa đơn VAT. Request giữ ở mức tối thiểu; các thông tin kế toán nâng cao do ERP xử lý theo cấu hình.",
        value: directExpenseCurl(credential),
        method: "POST",
        path: "/expenses",
        required: ["payeePartyId", "expenseDate", "businessPurpose", "grossMinor"],
        optional: ["category", "project", "VAT", "currency", "evidence", "externalReference"],
        response: '{ "data": { "expenseId": "…", "status": "draft" } }',
      },
    ],
  };
  return resources.flatMap((resource) => definitions[resource]);
}
