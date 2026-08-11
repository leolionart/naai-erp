import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EXPORT_RETENTION_POLICY,
  exportRetentionPolicyFromEnv,
  pruneGeneratedExportContent,
} from "./export-retention.js";

describe("ERP-906 generated export retention", () => {
  it("uses bounded defaults and accepts safe operator overrides", () => {
    expect(exportRetentionPolicyFromEnv({})).toEqual(DEFAULT_EXPORT_RETENTION_POLICY);
    expect(
      exportRetentionPolicyFromEnv({
        EXPORT_RETENTION_KEEP_LATEST: "12",
        EXPORT_RETENTION_MAX_AGE_DAYS: "90",
      }),
    ).toEqual({ keepLatest: 12, maxAgeDays: 90 });
    expect(
      exportRetentionPolicyFromEnv({
        EXPORT_RETENTION_KEEP_LATEST: "1000000",
        EXPORT_RETENTION_MAX_AGE_DAYS: "0",
      }),
    ).toEqual(DEFAULT_EXPORT_RETENTION_POLICY);
  });

  it("uses one organization-scoped transaction and is safe to rerun", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({ rowCount: 3 })
      .mockResolvedValueOnce({});
    const release = vi.fn();
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) };

    await expect(
      pruneGeneratedExportContent(pool as never, "org-1", { keepLatest: 5, maxAgeDays: 30 }),
    ).resolves.toEqual({ accountantExportBlobsPruned: 2, portablePackageBlobsPruned: 3 });
    expect(query.mock.calls[1]?.[1]).toEqual(["org-1:generated-export-retention"]);
    expect(query.mock.calls[2]?.[1]).toEqual(["org-1", 5, 30]);
    expect(query.mock.calls[3]?.[1]).toEqual(["org-1", 5, 30]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("rejects an invalid direct policy without opening a transaction", async () => {
    const pool = { connect: vi.fn() };
    await expect(
      pruneGeneratedExportContent(pool as never, "org-1", { keepLatest: 0, maxAgeDays: 30 }),
    ).rejects.toThrow("INVALID_EXPORT_RETENTION_POLICY");
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
