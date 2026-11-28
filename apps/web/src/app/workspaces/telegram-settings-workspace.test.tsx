import { describe, expect, it } from "vitest";
import { describeTelegramFailureState } from "./telegram-settings-workspace";

describe("T-UNIT-ERP-1014-001 TelegramSettingsWorkspace failure state presentation (BR-NOTIFY-004)", () => {
  it("shows stable badge when there are zero failures and no active error", () => {
    expect(
      describeTelegramFailureState({
        sentLast7Days: 42,
        pending: 0,
        failed: 0,
        lastSentAt: "2026-11-28T12:24:01.901Z",
        lastError: null,
      }),
    ).toEqual({
      failed: 0,
      activeError: null,
      badge: ["Ổn định", "secondary"],
      subtitle: "Không có lỗi gửi",
    });
  });

  it("shows recovered non-destructive status when historical 7-day failures were followed by healthy sends", () => {
    expect(
      describeTelegramFailureState({
        sentLast7Days: 372,
        pending: 0,
        failed: 11,
        lastSentAt: "2026-11-28T12:24:01.901Z",
        lastError: null,
      }),
    ).toEqual({
      failed: 11,
      activeError: null,
      badge: ["Đã phục hồi", "secondary"],
      subtitle: "Lỗi cũ đã qua, hiện gửi bình thường",
    });
  });

  it("shows destructive check-required badge and active error when an unresolved worker failure exists", () => {
    expect(
      describeTelegramFailureState({
        sentLast7Days: 372,
        pending: 0,
        failed: 12,
        lastSentAt: "2026-11-28T12:24:01.901Z",
        lastError: "Telegram HTTP 401: Unauthorized",
      }),
    ).toEqual({
      failed: 12,
      activeError: "Telegram HTTP 401: Unauthorized",
      badge: ["Cần kiểm tra", "destructive"],
      subtitle: "Xem chi tiết lỗi bên dưới",
    });
  });
});
