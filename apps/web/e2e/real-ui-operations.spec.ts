import { expect, test } from "@playwright/test";
import {
  apiData,
  apiRequest,
  attachApiFailureMonitor,
  chooseSelectOption,
  readDocumentSummary,
  readExpenseSummary,
  recordDraftBatchCompat,
  seedExpense,
  seedIngestedDraftPurchaseInvoice,
  seedIssuedSalesInvoice,
  seedPostedPurchaseInvoice,
  type JsonRecord,
} from "./real-ui-helpers";

test.describe("T-E2E-EDIT-003 Real-UI operations against real API and scratch PostgreSQL", () => {
  test("@desktop loads Expense and Revenue listings with canonical categories and zero background API errors", async ({
    page,
  }) => {
    const monitor = attachApiFailureMonitor(page);
    const listPurpose = "Thuê văn phòng kiểm chứng danh sách";
    await seedExpense({
      purpose: listPurpose,
      category: "OFFICE",
      vatRatePercent: 10,
    });
    const issuedSales = await seedIssuedSalesInvoice({
      description: "Thiết kế giao diện kiểm chứng danh sách",
      category: "SERVICE",
    });

    await page.goto("/expenses");
    const expenseRow = page.getByRole("row").filter({ hasText: listPurpose });
    await expect(expenseRow).toBeVisible({ timeout: 20_000 });
    await expect(expenseRow.getByText("Văn phòng", { exact: true })).toBeVisible();

    await page.goto("/revenue");
    const salesRow = page.getByRole("row").filter({ hasText: issuedSales.documentNumber });
    await expect(salesRow).toBeVisible({ timeout: 20_000 });
    await expect(salesRow.getByText("Dịch vụ", { exact: true })).toBeVisible();

    monitor.assertClean();
  });

  test("@desktop edits metadata and changes canonical category on a posted expense and an issued sales invoice", async ({
    page,
  }) => {
    const monitor = attachApiFailureMonitor(page);
    const postedExpense = await seedExpense({
      purpose: "Chi phí văn phòng cần đổi danh mục",
      category: "OFFICE",
      vatRatePercent: 10,
    });
    const originalExpenseJournalId = String(postedExpense.record.journalId ?? "");
    expect(originalExpenseJournalId).toBeTruthy();

    await page.goto("/expenses");
    const expenseRow = page
      .getByRole("row")
      .filter({ hasText: "Chi phí văn phòng cần đổi danh mục" });
    await expenseRow.getByRole("button", { name: "Xem" }).click();

    const expenseDialog = page.getByRole("dialog", { name: /Chi tiết & Chỉnh sửa/ });
    await expect(expenseDialog).toBeVisible();
    const categoryField = expenseDialog
      .locator('[data-slot="field"]')
      .filter({ hasText: "Danh mục nghiệp vụ / Dịch vụ" });
    await chooseSelectOption(categoryField, page, /^Công tác phí$/);
    await expenseDialog
      .getByLabel("Mục đích chi / Diễn giải")
      .fill("Chi phí công tác tháng 6 (đã sửa UI)");
    await expenseDialog.getByRole("button", { name: "Lưu thay đổi" }).click();

    await expect
      .poll(() => readExpenseSummary(postedExpense.id))
      .toEqual({
        state: "posted",
        purpose: "Chi phí công tác tháng 6 (đã sửa UI)",
        category: "TRAVEL",
        journalId: originalExpenseJournalId,
      });

    const issuedInvoice = await seedIssuedSalesInvoice({
      description: "Dịch vụ triển khai ban đầu",
      category: "SERVICE",
    });
    const originalInvoiceJournalId = String(issuedInvoice.record.journalId ?? "");
    expect(originalInvoiceJournalId).toBeTruthy();

    await page.goto("/revenue");
    const invoiceRow = page.getByRole("row").filter({ hasText: issuedInvoice.documentNumber });
    await invoiceRow.getByRole("button", { name: "Xem" }).click();

    const invoiceDialog = page.getByRole("dialog", { name: /Chi tiết & Chỉnh sửa/ });
    await expect(invoiceDialog).toBeVisible();
    const docCategoryField = invoiceDialog
      .locator('[data-slot="field"]')
      .filter({ hasText: "Danh mục" });
    await chooseSelectOption(docCategoryField, page, /^Tư vấn$/);
    await invoiceDialog.getByLabel("Diễn giải").fill("Dịch vụ tư vấn kiến trúc (đã sửa UI)");
    await invoiceDialog.getByRole("button", { name: "Cập nhật thông tin hóa đơn" }).click();

    await expect
      .poll(() => readDocumentSummary(issuedInvoice.id))
      .toEqual({
        state: "issued",
        category: "CONSULTING",
        description: "Dịch vụ tư vấn kiến trúc (đã sửa UI)",
        journalId: originalInvoiceJournalId,
      });

    monitor.assertClean();
  });

  test("@desktop edits an integration-created draft expense and updates its canonical category", async ({
    page,
  }) => {
    const monitor = attachApiFailureMonitor(page);
    const draftExpense = await seedExpense({
      asIntegrationDraft: true,
      purpose: "Chi phí nháp từ n8n ban đầu",
      category: "OFFICE",
    });
    expect(draftExpense.record.state).toBe("draft");

    await page.goto("/expenses");
    const row = page.getByRole("row").filter({ hasText: "Chi phí nháp từ n8n ban đầu" });
    await row.getByRole("button", { name: "Xem" }).click();

    const dialog = page.getByRole("dialog", { name: /Chi tiết & Chỉnh sửa/ });
    await expect(dialog).toBeVisible();
    const categoryField = dialog
      .locator('[data-slot="field"]')
      .filter({ hasText: "Danh mục nghiệp vụ / Dịch vụ" });
    await chooseSelectOption(categoryField, page, /^Công tác phí$/);
    await dialog
      .getByLabel("Mục đích chi / Diễn giải")
      .fill("Chi phí nháp từ n8n (đã cập nhật danh mục)");
    await dialog.getByRole("button", { name: "Cập nhật thông tin chi phí" }).click();

    await expect
      .poll(() => readExpenseSummary(draftExpense.id))
      .toEqual({
        state: "draft",
        purpose: "Chi phí nháp từ n8n (đã cập nhật danh mục)",
        category: "TRAVEL",
        journalId: null,
      });

    monitor.assertClean();
  });

  test("@desktop reclassifies funding on a posted expense and on a posted purchase invoice", async ({
    page,
  }) => {
    const monitor = attachApiFailureMonitor(page);
    const postedExpense = await seedExpense({
      purpose: "Chi phí chủ chi hộ chuyển sang quỹ giữ hộ",
      category: "OFFICE",
      counterAccountCode: "3388-OWNER",
    });
    const postedPurchase = await seedPostedPurchaseInvoice({
      description: "Hóa đơn mua thiết bị chuyển sang ngân hàng công ty",
    });

    await page.goto("/expenses");
    await page
      .getByRole("row")
      .filter({ hasText: "Chi phí chủ chi hộ chuyển sang quỹ giữ hộ" })
      .getByRole("button", { name: "Xem" })
      .click();
    const quickDialog = page.getByRole("dialog", { name: /Chi tiết & Chỉnh sửa/ });
    await quickDialog.getByRole("button", { name: "Đổi nguồn thanh toán" }).click();

    const reclassifyDialog = page.getByRole("dialog", { name: "Đổi sang nguồn thanh toán khác?" });
    await reclassifyDialog.getByLabel("Nguồn thanh toán mới").click();
    await page.getByRole("option", { name: /Tiền công ty chủ giữ hộ/ }).click();
    await reclassifyDialog
      .getByLabel("Lý do điều chỉnh")
      .fill("Thực tế chi từ quỹ tiền công ty chủ giữ hộ");
    await reclassifyDialog.getByRole("button", { name: "Xác nhận đổi nguồn" }).click();

    await expect(reclassifyDialog).toBeHidden({ timeout: 15_000 });
    const originalAfter = await apiData<JsonRecord>(
      "GET",
      `/expenses/${encodeURIComponent(postedExpense.id)}`,
    );
    expect(originalAfter.state).toBe("reversed");

    const allExpenses = await apiData<{ items?: JsonRecord[] } | JsonRecord[]>("GET", "/expenses");
    const expenseItems = Array.isArray(allExpenses) ? allExpenses : (allExpenses.items ?? []);
    const replacementExpense = expenseItems.find(
      (item) =>
        item.id !== postedExpense.id &&
        (item.businessPurpose ?? item.business_purpose) ===
          "Chi phí chủ chi hộ chuyển sang quỹ giữ hộ",
    );
    expect(replacementExpense?.state).toBe("posted");
    expect(
      replacementExpense?.fundingFinancialAccountId ??
        replacementExpense?.funding_financial_account_id,
    ).toBe("fa-custody");

    await page.goto("/expenses");
    await page
      .getByRole("row")
      .filter({ hasText: postedPurchase.documentNumber })
      .getByRole("button", { name: "Xem" })
      .click();
    await quickDialog.getByRole("button", { name: "Đổi nguồn thanh toán" }).click();
    await expect(reclassifyDialog).toBeVisible();
    await reclassifyDialog.getByLabel("Nguồn thanh toán mới").click();
    await page.getByRole("option", { name: /Tài khoản ngân hàng công ty/ }).click();
    await reclassifyDialog
      .getByLabel("Lý do điều chỉnh")
      .fill("Đã thanh toán từ tài khoản ngân hàng công ty");
    await reclassifyDialog.getByRole("button", { name: "Xác nhận đổi nguồn" }).click();

    await expect(reclassifyDialog).toBeHidden({ timeout: 15_000 });
    const purchaseAfter = await apiData<JsonRecord>(
      "GET",
      `/commercial-documents/${encodeURIComponent(postedPurchase.id)}`,
    );
    expect(purchaseAfter.state).toBe("cancelled");

    const allDocs = await apiData<{ items?: JsonRecord[] } | JsonRecord[]>(
      "GET",
      "/commercial-documents?type=purchase_invoice",
    );
    const docItems = Array.isArray(allDocs) ? allDocs : (allDocs.items ?? []);
    const replacementDoc = docItems.find(
      (item) => item.id !== postedPurchase.id && item.state === "posted",
    );
    expect(replacementDoc?.controlAccountCode ?? replacementDoc?.control_account_code).toBe(
      "112-BANK",
    );

    monitor.assertClean();
  });

  test("@desktop voids a posted expense and an issued sales invoice, and deletes draft expense and draft purchase invoice", async ({
    page,
  }) => {
    const monitor = attachApiFailureMonitor(page);
    const expenseToVoid = await seedExpense({
      purpose: "Chi phí ghi sổ nhầm cần void",
      category: "OFFICE",
    });
    const draftExpenseToDelete = await seedExpense({
      asIntegrationDraft: true,
      purpose: "Chi phí nháp trùng cần xóa",
      category: "OFFICE",
    });
    const draftPurchaseToDelete = await seedIngestedDraftPurchaseInvoice({
      description: "Hóa đơn mua nháp OCR cần xóa",
    });
    const salesToVoid = await seedIssuedSalesInvoice({
      description: "Hóa đơn bán ra xuất nhầm cần void",
      category: "SERVICE",
    });

    await page.goto("/expenses");
    await page
      .getByRole("row")
      .filter({ hasText: "Chi phí ghi sổ nhầm cần void" })
      .getByRole("button", { name: "Xem" })
      .click();
    const quickDialog = page.getByRole("dialog", { name: /Chi tiết & Chỉnh sửa/ });
    await quickDialog.getByRole("button", { name: "Void (đảo bút toán)" }).click();
    const voidExpenseDialog = page.getByRole("dialog", { name: "Void chi phí đã ghi sổ?" });
    await voidExpenseDialog
      .getByLabel("Lý do (bắt buộc)")
      .fill("Nhập nhầm số tiền cần đảo bút toán");
    await voidExpenseDialog.getByRole("button", { name: "Xác nhận" }).click();
    await expect(voidExpenseDialog).toBeHidden({ timeout: 15_000 });
    expect(
      (await apiData<JsonRecord>("GET", `/expenses/${encodeURIComponent(expenseToVoid.id)}`)).state,
    ).toBe("reversed");

    await page
      .getByRole("row")
      .filter({ hasText: "Chi phí nháp trùng cần xóa" })
      .getByRole("button", { name: "Xem" })
      .click();
    await quickDialog.getByRole("button", { name: "Xóa bản nháp" }).click();
    const deleteDraftExpenseDialog = page.getByRole("dialog", { name: "Xóa bản nháp chi phí?" });
    await deleteDraftExpenseDialog.getByLabel("Lý do (bắt buộc)").fill("Bản nháp n8n đẩy trùng");
    await deleteDraftExpenseDialog.getByRole("button", { name: "Xác nhận" }).click();
    await expect(deleteDraftExpenseDialog).toBeHidden({ timeout: 15_000 });
    const discardedLookup = await apiRequest<JsonRecord>(
      "GET",
      `/expenses/${encodeURIComponent(draftExpenseToDelete.id)}`,
    );
    expect([404, 200]).toContain(discardedLookup.status);
    if (discardedLookup.status === 200) {
      const inner = (discardedLookup.payload.data ?? discardedLookup.payload) as JsonRecord;
      expect(inner.state).toBe("discarded");
    }

    await page
      .getByRole("row")
      .filter({ hasText: draftPurchaseToDelete.documentNumber })
      .getByRole("button", { name: "Xem" })
      .click();
    await quickDialog.getByRole("button", { name: "Xóa hóa đơn nháp" }).click();
    const deleteInvoiceDialog = page.getByRole("dialog", { name: "Xóa hóa đơn mua vào bản nháp?" });
    await deleteInvoiceDialog.getByLabel("Lý do xóa").fill("Hóa đơn OCR thử nghiệm cần dọn");
    await deleteInvoiceDialog.getByRole("button", { name: "Xác nhận xóa" }).click();
    await expect(deleteInvoiceDialog).toBeHidden({ timeout: 15_000 });
    const deletedPurchaseLookup = await apiRequest(
      "GET",
      `/commercial-documents/${encodeURIComponent(draftPurchaseToDelete.id)}`,
    );
    expect(deletedPurchaseLookup.status).toBe(404);

    await page.goto("/revenue");
    await page
      .getByRole("row")
      .filter({ hasText: salesToVoid.documentNumber })
      .getByRole("button", { name: "Xem" })
      .click();
    await quickDialog.getByRole("button", { name: "Void (đảo bút toán)" }).click();
    const voidSalesDialog = page.getByRole("dialog", { name: "Void chứng từ đã ghi sổ?" });
    await voidSalesDialog.getByLabel("Lý do (bắt buộc)").fill("Xuất nhầm thông tin hợp đồng");
    await voidSalesDialog.getByRole("button", { name: "Xác nhận" }).click();
    await expect(voidSalesDialog).toBeHidden({ timeout: 15_000 });
    expect(
      (
        await apiData<JsonRecord>(
          "GET",
          `/commercial-documents/${encodeURIComponent(salesToVoid.id)}`,
        )
      ).state,
    ).toBe("cancelled");

    monitor.assertClean();
  });

  test("@desktop records owner save-and-record, single draft to posted via UI, and batch draft recording", async ({
    page,
  }) => {
    const monitor = attachApiFailureMonitor(page);

    // 1. Owner single-step save-and-record from UI create dialog
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Tạo chi phí" }).click();
    const createDialog = page.getByRole("dialog", { name: "Tạo chi phí" });
    await expect(createDialog).toBeVisible();
    const categoryField = createDialog
      .locator('[data-slot="field"]')
      .filter({ hasText: "Danh mục nghiệp vụ / Dịch vụ" });
    await chooseSelectOption(categoryField, page, /^Văn phòng$/);
    await createDialog.getByLabel("Đối tác thụ hưởng").fill("Nhà cung cấp B");
    await createDialog
      .getByLabel("Mục đích chi / Diễn giải")
      .fill("Mua giấy in ghi sổ một bước từ UI");
    await createDialog.getByLabel("Tiền gốc chưa VAT (VNĐ)").fill("425000");
    await createDialog.getByLabel("Tiền VAT (VNĐ)").fill("0");
    await createDialog.getByLabel("Tổng chi phí (VNĐ)").fill("425000");
    await createDialog.getByRole("button", { name: "Lưu và ghi nhận" }).click();
    await expect(createDialog).toBeHidden({ timeout: 15_000 });
    await expect(
      page.getByRole("row").filter({ hasText: "Mua giấy in ghi sổ một bước từ UI" }),
    ).toBeVisible();

    // 2. Integration draft -> posted through the detail UI (supports ERP-989 one-click "Ghi sổ" or current lifecycle)
    const singleDraft = await seedExpense({
      asIntegrationDraft: true,
      purpose: "Chi phí nháp cần ghi sổ trên màn hình chi tiết",
      category: "OFFICE",
    });
    await page.goto(`/expenses/${encodeURIComponent(singleDraft.id)}`);
    await expect(page.getByText(singleDraft.date).first()).toBeVisible({ timeout: 15_000 });

    const oneClickRecordButton = page.getByRole("button", { name: /^Ghi sổ$/ });
    if (await oneClickRecordButton.isVisible().catch(() => false)) {
      await oneClickRecordButton.click();
      const confirmBtn = page.getByRole("dialog").getByRole("button", { name: /Xác nhận|Ghi sổ/ });
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
      }
    } else {
      for (const actionName of ["submit", "approve", "post"]) {
        await page.getByRole("button", { name: actionName, exact: true }).click();
        const actionDialog = page.getByRole("dialog", {
          name: new RegExp(`Xác nhận ${actionName}`),
        });
        await actionDialog.getByLabel("Lý do").fill(`Chủ ghi sổ (${actionName})`);
        await actionDialog.getByRole("button", { name: "Xác nhận" }).click();
        await expect(actionDialog).toBeHidden({ timeout: 15_000 });
      }
    }

    await expect
      .poll(async () => {
        const after = await apiData<JsonRecord>(
          "GET",
          `/expenses/${encodeURIComponent(singleDraft.id)}`,
        );
        return { state: after.state, hasJournal: Boolean(after.journalId ?? after.journal_id) };
      })
      .toEqual({ state: "posted", hasJournal: true });

    // 3. Batch draft recording (uses POST /drafts/record when available, or structured compat helper)
    const batchA = await seedExpense({
      asIntegrationDraft: true,
      purpose: "Lô nháp tự động #1",
      category: "OFFICE",
    });
    const batchB = await seedExpense({
      asIntegrationDraft: true,
      purpose: "Lô nháp tự động #2",
      category: "TRAVEL",
    });
    await recordDraftBatchCompat([batchA.id, batchB.id]);
    for (const id of [batchA.id, batchB.id]) {
      const recorded = await apiData<JsonRecord>("GET", `/expenses/${encodeURIComponent(id)}`);
      expect(recorded.state).toBe("posted");
      expect(recorded.journalId ?? recorded.journal_id).toBeTruthy();
    }

    monitor.assertClean();
  });

  test("@desktop renders translated Vietnamese action error (not load error) on real 409 version conflict", async ({
    page,
  }) => {
    const target = await seedExpense({
      purpose: "Chi phí kiểm tra thông báo xung đột phiên bản",
      category: "OFFICE",
    });

    await page.goto("/expenses");
    await page
      .getByRole("row")
      .filter({ hasText: "Chi phí kiểm tra thông báo xung đột phiên bản" })
      .getByRole("button", { name: "Xem" })
      .click();
    const dialog = page.getByRole("dialog", { name: /Chi tiết & Chỉnh sửa/ });
    await expect(dialog).toBeVisible();
    const purposeField = dialog.getByLabel("Mục đích chi / Diễn giải");
    await expect(purposeField).toBeVisible();

    const freshBeforeBump = await apiData<JsonRecord>(
      "GET",
      `/expenses/${encodeURIComponent(target.id)}`,
    );
    const currentVersion = String(freshBeforeBump.resourceVersion ?? freshBeforeBump.version);

    // Advance server version concurrently via real API while the Quick View holds the older version.
    await apiData("PATCH", `/expenses/${encodeURIComponent(target.id)}/metadata`, {
      expectedVersion: currentVersion,
      body: { businessPurpose: "Đã cập nhật từ phiên khác" },
    });

    await purposeField.fill("Thử lưu với phiên bản cũ");
    await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();

    const alert = dialog.getByRole("alert");
    await expect(alert).toContainText("Không thể thực hiện thao tác");
    await expect(alert).not.toContainText("Không thể tải dữ liệu");
    await expect(alert).toContainText("Bản ghi vừa được cập nhật ở nơi khác");
    await expect(alert).not.toContainText("VERSION_CONFLICT");
  });

  test("@mobile loads Expense Management at 390px without horizontal overflow or failed API calls", async ({
    page,
  }) => {
    const monitor = attachApiFailureMonitor(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const mobilePurpose = "Chi phí kiểm tra giao diện di động 390px";
    await seedExpense({
      purpose: mobilePurpose,
      category: "OFFICE",
    });

    await page.goto("/expenses");
    await expect(page.getByText(mobilePurpose).first()).toBeVisible({ timeout: 20_000 });

    const overflowPx = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowPx).toBeLessThanOrEqual(1);
    monitor.assertClean();
  });
});
