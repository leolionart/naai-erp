import { describe, expect, it } from "vitest";
import { presentRevenueRecord } from "./focused-record-presentation";

const projects = [{ id: "project-2025", name: "Dự án 2025", client_party_id: "client-2025" }];
const parties = [{ id: "client-2025", display_name: "Khách hàng 2025" }];

describe("canonical revenue presentation", () => {
  it("maps a 2025 recognition event through its project to the customer", () => {
    expect(
      presentRevenueRecord(
        {
          id: "recognition-2025",
          projectId: "project-2025",
          effectiveOn: "2025-06-30",
          amountMinor: "9000000",
          currency: "VND",
          state: "posted",
          reason: "Ghi nhận mốc 2025",
        },
        "recognition",
        projects,
        parties,
      ),
    ).toMatchObject({
      customerId: "client-2025",
      customerName: "Khách hàng 2025",
      projectNames: ["Dự án 2025"],
      activityDate: "2025-06-30",
      amountMinor: "9000000",
      state: "posted",
    });
  });

  it("keeps a commercial document direct party authoritative", () => {
    expect(
      presentRevenueRecord(
        {
          id: "invoice",
          partyId: "direct-client",
          documentDate: "2025-07-01",
          grossMinor: "100",
          projectIds: ["project-2025"],
          state: "paid",
        },
        "documents",
        projects,
        [...parties, { id: "direct-client", display_name: "Khách trực tiếp" }],
      ).customerName,
    ).toBe("Khách trực tiếp");
  });
});
