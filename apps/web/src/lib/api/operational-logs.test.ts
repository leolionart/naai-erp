import { describe, expect, it } from "vitest";
import { operationalLogsApi } from "./operational-logs";

describe("operational logs API", () => {
  it("builds an organization-relative filtered listing path", () => {
    expect(
      operationalLogsApi.list({ status: "failed", service: "outbound delivery", limit: 100 }),
    ).toBe("operational-logs?status=failed&service=outbound+delivery&limit=100");
  });

  it("omits empty filters", () => {
    expect(operationalLogsApi.list({ status: "", service: undefined })).toBe("operational-logs");
  });
});
