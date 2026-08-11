import { describe, expect, it } from "vitest";
import {
  customerCurl,
  directExpenseCurl,
  projectCurl,
  n8nOcrMappingExpression,
  ocrSupplierCurl,
  ocrSupplierRoleCurl,
  purchaseInvoiceCurl,
  purchaseProductCurl,
  quickOcrPurchaseInvoiceCurl,
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

  it("builds separate supplier, role and quick-invoice cURLs for sparse OCR input", () => {
    const supplier = ocrSupplierCurl(credential);
    const role = ocrSupplierRoleCurl(credential);
    const invoice = quickOcrPurchaseInvoiceCurl(credential);
    for (const curl of [supplier, role, invoice]) expectCommonHeaders(curl);
    expect(supplier).toContain("/master-data/parties");
    expect(supplier).toContain('"normalized_tax_id": "0110660175"');
    expect(role).toContain("/master-data/party-roles");
    expect(role).toContain('"role": "supplier"');
    expect(invoice).toContain('"type": "purchase_invoice"');
    expect(invoice).toContain('"netMinor": "408601"');
    expect(invoice).toContain('"taxMinor": "0"');
    expect(invoice).toContain('"grossMinor": "408601"');
    expect(invoice).toContain('"taxState": "unreviewed"');
    expect(invoice).not.toContain('"projectId"');
    expect(invoice).not.toContain('"fundingSource"');
  });

  it("builds one paste-ready n8n expression that preserves sparse OCR data without guessing", () => {
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
      "supplierPartyId",
      "invoiceCandidate",
      "readyToPost: false",
      "rawOutput: output",
    ]) {
      expect(expression).toContain(field);
    }
    expect(expression).toContain("replace(/[^0-9]/g");
    expect(expression).toContain("missingWhenNull");
    expect(expression).not.toContain("projectId");
    expect(expression).not.toContain("fundingSource");
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
