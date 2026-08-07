import { expect, test } from "@playwright/test";

const sheet = {
  resourceType: "parties",
  sheetName: "parties",
  excluded: false,
  rowCount: 2,
  mutability: "editable",
};

test("@desktop exports, inventories, dry-runs, reviews row diffs and commits a full ERP package", async ({
  page,
}) => {
  await page.route("**/portable-data-packages/exports", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          packageId: "package-1",
          filename: "naai-erp-org-a-2026-08-08.xlsx",
          sizeBytes: 2048,
          contentHash: "a".repeat(64),
          manifest: { totalSheetCount: 1, totalRowCount: 2, sheets: [sheet] },
        },
      }),
    });
  });
  await page.route("**/portable-data-packages/imports/inventory", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          importId: "import-1",
          packageId: "package-1",
          state: "inventoried",
          workbookSha256: "b".repeat(64),
        },
      }),
    });
  });
  await page.route("**/portable-data-packages/imports/dry-run", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          importId: "import-1",
          packageId: "package-1",
          state: "dry_run_valid",
          workbookSha256: "b".repeat(64),
          dryRunId: "dry-1",
          dryRun: {
            valid: true,
            mutationCount: 0,
            totals: { sheets: 1, rows: 2, ready: 1, invalid: 0, conflicts: 0, unchanged: 1 },
            sheetInventory: [sheet],
            rows: [
              {
                sheetName: "parties",
                resourceType: "parties",
                rowNumber: 2,
                stableId: "party-1",
                operation: "update",
                disposition: "ready",
                issues: [],
              },
            ],
          },
        },
      }),
    });
  });
  await page.route("**/portable-data-packages/imports/import-1/commit", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          importId: "import-1",
          packageId: "package-1",
          state: "committed",
          workbookSha256: "b".repeat(64),
          dryRunId: "dry-1",
          commitResult: { committed: true, applied: 1, unchanged: 1, failed: 0 },
        },
      }),
    });
  });

  await page.goto("http://localhost:3000/settings/data-package");
  await expect(
    page.getByRole("heading", { name: "Sao lưu & chỉnh sửa toàn bộ dữ liệu ERP" }),
  ).toBeVisible();
  await expect(
    page.getByText("Đây là Full ERP Data Package, không phải Accountant Export"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tạo Full ERP Package" }).click();
  await expect(page.getByText("Inventory package vừa export")).toBeVisible();

  await page.getByLabel("Workbook XLSX").setInputFiles({
    name: "edited-package.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("xlsx-fixture"),
  });
  await page.getByRole("button", { name: "Kiểm kê file" }).click();
  await expect(page.getByText(/Import import-1/)).toBeVisible();
  await page.getByRole("button", { name: "Dry-run" }).click();
  await expect(page.getByText("Sẵn sàng commit")).toBeVisible();
  await expect(page.getByText("parties · 2")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Thay đổi hợp lệ" })).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận commit các thay đổi hợp lệ" }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Commit thay đổi vào ERP?" });
  await confirmation.getByRole("button", { name: "Commit có kiểm soát" }).click();
  await expect(page.getByText("Commit hoàn tất")).toBeVisible();
});

test("@mobile keeps portable package controls within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:3000/settings/data-package");
  await expect(page.getByText("Full ERP Data Package", { exact: false }).first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
