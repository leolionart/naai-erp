import { describe, expect, it } from "vitest";
import {
  customerCurl,
  discardDraftPurchaseInvoiceCurl,
  directExpenseCurl,
  projectCurl,
  n8nOcrMappingExpression,
  purchaseInvoiceCurl,
  purchaseProductCurl,
  quickRevenueIngestionCurl,
  quickOcrPurchaseInvoiceIngestionCurl,
  salesInvoiceCurl,
  servicePlanCurl,
  subscriptionCurl,
} from "./automation-api-dialog";

const credential = { organizationId: "naai", apiToken: "stable-production-token" };

function expectCommonHeaders(curl: string) {
  expect(curl).toContain("Authorization: Bearer stable-production-token");
  expect(curl).toContain("Idempotency-Key:");
  expect(curl).toContain("/organizations/naai/");
  expect(curl).not.toContain("postgres");
}

describe("ERP-908 and ERP-909 contextual automation cURL examples", () => {
  it("builds a complete purchase-invoice request with exact totals and relationships", () => {
    const curl = purchaseInvoiceCurl(credential);
    expectCommonHeaders(curl);
    expect(curl).toContain("/organizations/naai/commercial-documents");
    for (const field of [
      '"type": "purchase_invoice"',
      '"partyId"',
      '"projectId"',
      '"fundingSource"',
      '"netMinor": "1000000"',
      '"taxMinor": "100000"',
      '"grossMinor": "1100000"',
      '"externalReference"',
    ]) {
      expect(curl).toContain(field);
    }
  });

  it("builds the purchase-product request with the same revealed credential", () => {
    const curl = purchaseProductCurl(credential);
    expectCommonHeaders(curl);
    expect(curl).toContain("/master-data/purchase-products");
    expect(curl).toContain('"vat_rate_percent": 10');
  });

  it("builds one quick OCR ingestion cURL that resolves the supplier server-side", () => {
    const curl = quickOcrPurchaseInvoiceIngestionCurl(credential);
    expectCommonHeaders(curl);
    expect(curl).toContain("/commercial-documents/purchase-invoice-ingestion");
    for (const field of [
      '"supplierTaxId": "0110660175"',
      '"supplierName"',
      '"documentNumber": "00250571"',
      '"documentDate": "2026-07-27"',
      '"category": "Thuê pin và sạc xe điện"',
      '"description"',
      '"grossMinor": "408601"',
      '"externalReference"',
    ]) {
      expect(curl).toContain(field);
    }
    expect(curl.match(/curl --request/g)).toHaveLength(1);
    expect(curl).not.toContain("/master-data/parties");
    expect(curl).not.toContain("/master-data/party-roles");
    expect(curl).not.toContain('"projectId"');
    expect(curl).not.toContain('"fundingSource"');
  });

  it("builds one quick revenue ingestion request with backend matching", () => {
    const curl = quickRevenueIngestionCurl(credential);
    expectCommonHeaders(curl);
    expect(curl).toContain("/commercial-documents/sales-invoice-ingestion");
    expect(curl).toContain('"customerTaxId": "0312345678"');
    expect(curl).toContain('"grossMinor": "11000000"');
    expect(curl.match(/curl --request/g)).toHaveLength(1);
    expect(curl).not.toContain("/master-data/parties");
    expect(curl).not.toContain("controlAccountCode");
  });

  it("builds a versioned idempotent request that only discards a draft invoice", () => {
    const curl = discardDraftPurchaseInvoiceCurl(credential);
    expectCommonHeaders(curl);
    expect(curl).toContain("curl --request DELETE");
    expect(curl).toContain('/commercial-documents/{{$json["data"]["document"]["documentId"]}}');
    expect(curl).toContain('If-Match: {{$json["data"]["document"]["resourceVersion"]}}');
    expect(curl).toContain("Idempotency-Key: discard-paperless-invoice-246-v1");
    expect(curl).toContain('"reason": "Xóa hóa đơn nháp tạo dư do workflow n8n nhập nhầm"');
    expect(curl).not.toContain('"state": "posted"');
  });

  it("builds one paste-ready n8n expression for the one-call invoice body", () => {
    const expression = n8nOcrMappingExpression();
    expect(expression).toMatch(/^\{\{/);
    for (const field of [
      "$json.output",
      'output["Ký bởi"]',
      'output["Mã số thuế (Tax code)"]',
      'output["Ký hiệu (Serial)"]',
      'output["Tên hàng hóa, dịch vụ"]',
      'output["Hạng mục"]',
      'output["Tổng cộng tiền thanh toán"]',
      'output["Ký ngày"]',
      '"supplierTaxId"',
      '"documentNumber"',
      '"documentDate"',
      '"grossMinor"',
      '"externalReference"',
    ]) {
      expect(expression).toContain(field);
    }
    expect(expression).toContain("replace(/[^0-9]/g");
    expect(expression).toContain("(?:[ T].*)?$");
    expect(expression).not.toContain("projectId");
    expect(expression).not.toContain("fundingSource");
  });

  it("normalizes the illustrated Paperless OCR payload into the API contract", () => {
    const expression = n8nOcrMappingExpression();
    const javascript = expression.slice(2, -2).trim();
    const evaluate = new Function("$json", `return ${javascript}`) as (
      input: Record<string, unknown>,
    ) => Record<string, unknown>;

    expect(
      evaluate({
        id: 246,
        title: "001_K26TOH_250571_9137",
        content:
          "HÓA ĐƠN GIÁ TRỊ GIA TĂNG\\nKý hiệu (Serial No.): 1K26TOH\\nSố (Inv No.): 00250571",
        output: {
          "Ký bởi": "CÔNG TY CỔ PHẦN PHÁT TRIỂN TRẠM SẠC TOÀN CẦU V-GREEN",
          "Mã số thuế (Tax code)": "0110660175",
          "Ký hiệu (Serial)": "1K26TOH",
          "Ký ngày": "27/07/2026 07:22:52",
          "Hạng mục": "OTHER_EXPENSE",
          "Tên hàng hóa, dịch vụ": "Phí dịch vụ trạm sạc tháng 7 năm 2026 cho số khung xe",
          "Tổng cộng tiền thanh toán": "408.601",
        },
      }),
    ).toMatchObject({
      supplierTaxId: "0110660175",
      documentNumber: "00250571",
      documentDate: "2026-07-27",
      category: "OTHER_EXPENSE",
      grossMinor: "408601",
      externalReference: {
        externalId: "246",
        canonicalUrl: "https://paper.naai.studio/api/documents/246/download/",
      },
    });
  });

  it.each([
    [customerCurl, ["/master-data/parties", "/master-data/party-roles", '"role": "client"']],
    [projectCurl, ["/master-data/projects", '"client_party_id"', '"owner_user_id"']],
    [servicePlanCurl, ["/service-plans", '"frequency": "month"', '"billingDay": 1']],
    [
      subscriptionCurl,
      ["/customer-service-subscriptions", '"customerPartyId"', '"servicePlanId"', '"projectId"'],
    ],
    [
      salesInvoiceCurl,
      ["/commercial-documents", '"type": "sales_invoice"', '"partyId"', '"projectId"'],
    ],
    [directExpenseCurl, ["/expenses", '"expenseClass"', '"externalReference"', '"projectId"']],
  ] as const)("builds a scoped, idempotent request for each input resource", (builder, fields) => {
    const curl = builder(credential);
    expectCommonHeaders(curl);
    for (const field of fields) expect(curl).toContain(field);
  });
});
