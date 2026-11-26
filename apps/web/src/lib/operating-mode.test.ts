import { describe, expect, it } from "vitest";
import { describeOperatingMode } from "./operating-mode";

describe("describeOperatingMode", () => {
  it("describes both modes and ignores unknown values", () => {
    expect(describeOperatingMode("solopreneur")?.short).toBe("Một người");
    expect(describeOperatingMode("solopreneur")?.description).toContain("Lưu và ghi nhận");
    expect(describeOperatingMode("controlled")?.short).toBe("Kiểm soát");
    expect(describeOperatingMode("other")).toBeUndefined();
    expect(describeOperatingMode(undefined)).toBeUndefined();
  });
});
