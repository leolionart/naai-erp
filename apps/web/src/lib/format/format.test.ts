import { describe, expect, it } from "vitest";
import { formatDateTime, formatIsoDate } from "./date";
import { exactBigInt, formatMinorVnd } from "./money";
import { formatStatus, normalizeStatus, statusTone } from "./status";

describe("ERP-345 exact UI formatters", () => {
  it("formats VND beyond Number.MAX_SAFE_INTEGER without precision loss", () => {
    expect(formatMinorVnd("90071992547409931")).toBe("90.071.992.547.409.931 ₫");
    expect(formatMinorVnd(-1n)).toBe("-1 ₫");
    expect(() => exactBigInt(Number.MAX_SAFE_INTEGER + 1)).toThrow("safe integer");
    expect(formatMinorVnd(null)).toBe("—");
  });

  it("formats ISO dates without UTC day shifting and timestamps in Vietnam time", () => {
    expect(formatIsoDate("2026-08-05")).toBe("05/08/2026");
    expect(formatDateTime("2026-08-05T00:00:00Z")).toContain("07:00:00");
    expect(formatIsoDate(undefined)).toBe("—");
  });

  it("normalizes status labels and semantic tones", () => {
    expect(normalizeStatus("Partially-Paid")).toBe("partially_paid");
    expect(formatStatus("partially_paid")).toBe("Thanh toán một phần");
    expect(statusTone("dead_letter")).toBe("error");
    expect(statusTone("posted")).toBe("ready");
    expect(formatStatus("imported")).toBe("Đã nhập");
    expect(formatStatus("reconciled")).toBe("Đã đối soát");
    expect(statusTone("needs_review")).toBe("warning");
    expect(formatStatus("pending_counterpart")).toBe("Chờ đối ứng");
    expect(formatStatus("review_required")).toBe("Cần review");
    expect(formatStatus("unreviewed")).toBe("Chưa review");
    expect(statusTone("review_required")).toBe("warning");
  });
});
