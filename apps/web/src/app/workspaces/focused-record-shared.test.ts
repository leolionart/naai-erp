import { describe, expect, it } from "vitest";
import { FOCUSED_RECORD_ERROR_TITLES } from "./focused-record-alerts";
import {
  CATEGORY_LOOKUP_ENDPOINTS,
  FOCUSED_RECORD_MASTER_DATA_ENDPOINTS,
  partiesByRole,
} from "./focused-record-shared";

describe("ERP-988 focused record endpoints, roles, and error alert titles", () => {
  it("uses canonical master-data/expense-categories and never calls obsolete time/workers", () => {
    expect(CATEGORY_LOOKUP_ENDPOINTS).toEqual([
      "master-data/categories",
      "master-data/expense-categories",
    ]);
    expect(CATEGORY_LOOKUP_ENDPOINTS).not.toContain("expense-categories");
    expect(Object.values(FOCUSED_RECORD_MASTER_DATA_ENDPOINTS)).not.toContain("time/workers");
  });

  it("omits manual limit/cursor query params on master-data lookups so createApiClient paginates past 100 records", () => {
    for (const endpoint of [
      ...CATEGORY_LOOKUP_ENDPOINTS,
      ...Object.values(FOCUSED_RECORD_MASTER_DATA_ENDPOINTS),
    ]) {
      expect(endpoint).not.toMatch(/[?&](limit|cursor)=/);
    }
  });

  it("derives clients, suppliers, freelancers, and employees from canonical party_roles", () => {
    const parties = [
      { id: "p-client", display_name: "Khách hàng A" },
      { id: "p-sup", display_name: "Nhà cung cấp B" },
      { id: "p-emp", display_name: "Nguyễn Nhân Viên" },
      { id: "p-free", display_name: "Cộng tác viên C" },
    ];
    const roles = [
      { party_id: "p-client", role: "client" },
      { party_id: "p-sup", role: "supplier" },
      { partyId: "p-emp", role: "employee" },
      { party_id: "p-free", role: "freelancer" },
    ];

    expect(partiesByRole(parties, roles, "client").map((p) => p.id)).toEqual(["p-client"]);
    expect(partiesByRole(parties, roles, "supplier").map((p) => p.id)).toEqual(["p-sup"]);
    expect(partiesByRole(parties, roles, "employee").map((p) => p.id)).toEqual(["p-emp"]);
    expect(partiesByRole(parties, roles, "freelancer").map((p) => p.id)).toEqual(["p-free"]);
  });

  it("distinguishes load error, action error, and export error titles in Vietnamese", () => {
    expect(FOCUSED_RECORD_ERROR_TITLES.load).toBe("Không thể tải dữ liệu");
    expect(FOCUSED_RECORD_ERROR_TITLES.action).toBe("Không thể thực hiện thao tác");
    expect(FOCUSED_RECORD_ERROR_TITLES.export).toBe("Không thể export dữ liệu");
    expect(FOCUSED_RECORD_ERROR_TITLES.load).not.toBe(FOCUSED_RECORD_ERROR_TITLES.action);
  });
});
