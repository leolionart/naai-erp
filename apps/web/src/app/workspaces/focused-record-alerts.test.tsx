import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiClientError, formatApiErrorMessage } from "@/lib/api";
import { FocusedRecordErrorAlert } from "./focused-record-alerts";

describe("ERP-988 FocusedRecordErrorAlert load vs action rendering", () => {
  it("renders distinct Vietnamese headings for load errors and translated action errors", () => {
    const loadHtml = renderToStaticMarkup(
      <FocusedRecordErrorAlert kind="load" message={formatApiErrorMessage("AUTH_REQUIRED")} />,
    );
    expect(loadHtml).toContain("Không thể tải dữ liệu");
    expect(loadHtml).toContain("Phiên đăng nhập đã hết hạn hoặc chưa xác thực");

    const actionHtml = renderToStaticMarkup(
      <FocusedRecordErrorAlert
        kind="action"
        message={formatApiErrorMessage(
          new ApiClientError({
            status: 400,
            code: "CATEGORY_NOT_FOUND",
            message: "CATEGORY_NOT_FOUND",
          }),
        )}
      />,
    );
    expect(actionHtml).toContain("Không thể thực hiện thao tác");
    expect(actionHtml).toContain(
      "Danh mục nghiệp vụ không tồn tại hoặc đã ngừng hoạt động trong tổ chức.",
    );
    expect(actionHtml).not.toContain("CATEGORY_NOT_FOUND");

    expect(renderToStaticMarkup(<FocusedRecordErrorAlert kind="action" message="" />)).toBe("");
  });
});
