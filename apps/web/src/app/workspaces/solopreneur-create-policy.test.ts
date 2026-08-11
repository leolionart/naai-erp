import { describe, expect, it } from "vitest";
import { canSaveAndRecord, createSubmitLabel } from "./solopreneur-create-policy";

describe("solopreneur create policy", () => {
  it("uses save-and-record only for the authenticated solopreneur owner", () => {
    expect(
      canSaveAndRecord({
        operatingMode: "solopreneur",
        callerIsOwner: true,
        callerCanSaveAndRecord: true,
      }),
    ).toBe(true);
    expect(createSubmitLabel({ operatingMode: "controlled", callerIsOwner: true })).toBe(
      "Lưu bản nháp",
    );
    expect(createSubmitLabel({ operatingMode: "solopreneur", callerIsOwner: false })).toBe(
      "Lưu bản nháp",
    );
  });
});
