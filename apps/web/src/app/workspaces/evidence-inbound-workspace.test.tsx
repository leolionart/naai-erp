import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EvidenceInboundWorkspace,
  buildOrganizationApiRoot,
  filterInboundEvents,
} from "./evidence-inbound-workspace";

describe("EvidenceInboundWorkspace", () => {
  it("renders accessible operational controls for evidence and inbound events", () => {
    const html = renderToStaticMarkup(<EvidenceInboundWorkspace />);
    expect(html).toContain("Chứng từ &amp; Webhook inbox");
    expect(html).toContain('aria-label="File chứng từ"');
    expect(html).toContain('aria-label="Kết quả review chứng từ"');
    expect(html).toContain('aria-label="Mục đích tải chứng từ"');
    expect(html).toContain('aria-label="Lọc trạng thái inbound"');
    expect(html).toContain('aria-label="Lý do replay inbound"');
    expect(html).toContain("Replay sự kiện có audit");
  });

  it("builds an encoded organization-scoped API root", () => {
    expect(buildOrganizationApiRoot("http://localhost:3001/", "org naai")).toBe(
      "http://localhost:3001/api/v1/organizations/org%20naai",
    );
  });

  it("filters inbox rows by exact state and friendly full-text query", () => {
    const rows = [
      { id: "1", state: "quarantined", eventType: "expense.create", externalId: "EXP-42" },
      { id: "2", state: "succeeded", eventType: "sales_invoice.create", externalId: "INV-7" },
    ];
    expect(filterInboundEvents(rows, "quarantined", "exp-42")).toEqual([rows[0]]);
    expect(filterInboundEvents(rows, "", "invoice")).toEqual([rows[1]]);
    expect(filterInboundEvents(rows, "dead_letter", "")).toEqual([]);
  });
});
