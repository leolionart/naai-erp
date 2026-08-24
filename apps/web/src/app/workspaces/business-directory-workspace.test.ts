import { describe, expect, it } from "vitest";
import { directoryCardValue, projectPeriodLabel } from "./business-directory-workspace";

describe("business directory card labels", () => {
  it("uses explicit fallbacks instead of inventing missing master data", () => {
    expect(directoryCardValue(undefined)).toBe("Chưa cập nhật");
    expect(directoryCardValue("", "Chưa có MST")).toBe("Chưa có MST");
    expect(directoryCardValue("  NAAI  ")).toBe("NAAI");
  });

  it("describes bounded, open-ended and missing project periods", () => {
    expect(projectPeriodLabel({ starts_on: "2026-08-01", ends_on: "2026-10-31" })).toBe(
      "2026-08-01 – 2026-10-31",
    );
    expect(projectPeriodLabel({ starts_on: "2026-08-01" })).toBe("2026-08-01 – Đang tiếp diễn");
    expect(projectPeriodLabel({})).toBe("Chưa xác định thời gian");
  });
});
