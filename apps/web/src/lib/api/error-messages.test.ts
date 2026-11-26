import { describe, expect, it } from "vitest";
import {
  VIETNAMESE_API_ERROR_MESSAGES,
  formatApiErrorMessage,
  translateApiErrorCode,
} from "./error-messages";
import { ApiClientError } from "./types";

describe("ERP-988 Vietnamese API error translation", () => {
  it("translates canonical raw error codes into clear Vietnamese messages", () => {
    expect(translateApiErrorCode("CATEGORY_NOT_FOUND")).toBe(
      VIETNAMESE_API_ERROR_MESSAGES.CATEGORY_NOT_FOUND,
    );
    expect(translateApiErrorCode("EXPENSE_REVIEW_INCOMPLETE")).toBe(
      VIETNAMESE_API_ERROR_MESSAGES.EXPENSE_REVIEW_INCOMPLETE,
    );
    expect(translateApiErrorCode("INVALID_EXPENSE_TRANSITION")).toBe(
      VIETNAMESE_API_ERROR_MESSAGES.INVALID_EXPENSE_TRANSITION,
    );
    expect(translateApiErrorCode("Resource version conflict")).toBe(
      VIETNAMESE_API_ERROR_MESSAGES.RESOURCE_VERSION_CONFLICT,
    );
  });

  it("translates ApiClientError raw codes automatically while keeping code intact", () => {
    const error = new ApiClientError({
      status: 400,
      code: "CATEGORY_NOT_FOUND",
      message: "CATEGORY_NOT_FOUND",
    });
    expect(error.code).toBe("CATEGORY_NOT_FOUND");
    expect(error.message).toBe(
      "Danh mục nghiệp vụ không tồn tại hoặc đã ngừng hoạt động trong tổ chức.",
    );
    expect(formatApiErrorMessage(error)).toBe(error.message);
  });

  it("preserves explicit Vietnamese server messages even when the code is mapped", () => {
    const error = new ApiClientError({
      status: 409,
      code: "RESOURCE_VERSION_CONFLICT",
      message: "Bản ghi đã được cập nhật bởi người khác.",
    });
    expect(error.message).toBe("Bản ghi đã được cập nhật bởi người khác.");
    expect(formatApiErrorMessage(error)).toBe("Bản ghi đã được cập nhật bởi người khác.");
  });

  it("translates string codes and wraps unmapped raw codes with Vietnamese fallback", () => {
    expect(formatApiErrorMessage("AUTH_REQUIRED")).toBe(
      VIETNAMESE_API_ERROR_MESSAGES.AUTH_REQUIRED,
    );
    expect(formatApiErrorMessage("EXPENSE_REVIEW_INCOMPLETE")).toBe(
      VIETNAMESE_API_ERROR_MESSAGES.EXPENSE_REVIEW_INCOMPLETE,
    );
    expect(formatApiErrorMessage("FUTURE_UNKNOWN_CODE", "Không thể lưu thay đổi")).toBe(
      "Không thể lưu thay đổi (FUTURE_UNKNOWN_CODE)",
    );
  });
});
