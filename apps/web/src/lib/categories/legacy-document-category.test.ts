import { describe, expect, it } from "vitest";
import { inferLegacyDocumentCategory } from "./legacy-document-category";

describe("legacy commercial-document category compatibility", () => {
  it("preserves explicitly stored categories", () => {
    expect(
      inferLegacyDocumentCategory({
        type: "purchase_invoice",
        lines: [{ description: "Anything", dimensions: { category: "TAX" } }],
      }),
    ).toBe("TAX");
  });

  it("classifies imported sales invoices as software service revenue", () => {
    expect(inferLegacyDocumentCategory({ type: "sales_invoice", lines: [] })).toBe("SOFTWARE_DEV");
  });

  it.each([
    ["Cước Internet và thuê thiết bị đầu cuối", "INTERNET_TELECOM"],
    ["DỊCH VỤ TÀI KHOẢN QUẢN TRỊ TÊN MIỀN", "DOMAIN_HOSTING"],
    ["Gói cước dịch vụ thuê pin", "VEHICLE_RENTAL"],
    ["Freepik API Pay As You Go Monthly", "SERVER_CLOUD"],
    ["Máy in phun màu Brother", "ELECTRONIC_EQUIP"],
    ["Suất Buffet nước ngọt", "MEAL"],
    ["Nội dung chưa có quy tắc", "OTHER_EXPENSE"],
  ])("maps %s to %s", (description, category) => {
    expect(
      inferLegacyDocumentCategory({ type: "purchase_invoice", lines: [{ description }] }),
    ).toBe(category);
  });
});
