import { expect, type Page, type Route } from "@playwright/test";

export const env = (data: unknown) => ({
  apiVersion: "v1",
  requestId: "erp720",
  organizationId: "naai",
  data,
});

export const reply = (route: Route, data: unknown) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(env(data)) });

export const fail = (route: Route, status: number, code: string, message: string) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ ...env(undefined), error: { code, message } }),
  });

export const invoice = {
  id: "invoice-720",
  type: "sales_invoice",
  documentNumber: "INV-720",
  partyId: "client-720",
  documentDate: "2026-08-06",
  dueDate: "2026-08-20",
  currency: "VND",
  netMinor: "10000000",
  taxMinor: "1000000",
  grossMinor: "11000000",
  state: "draft",
  resourceVersion: "1",
  controlAccountCode: "131",
  lines: [
    {
      id: "line-1",
      description: "Thiết kế web",
      primaryAccountCode: "511",
      netMinor: "10000000",
      taxMinor: "1000000",
      grossMinor: "11000000",
      dimensions: { category: "SOFTWARE_DEV" },
      allocations: [
        {
          id: "allocation-1",
          amountMinor: "10000000",
          dimensions: {
            costCenter: "DELIVERY",
            projectId: "project-720",
            contractId: "contract-720",
          },
        },
      ],
    },
  ],
};

export const purchaseInvoice = {
  ...invoice,
  id: "purchase-720",
  type: "purchase_invoice",
  documentNumber: "PINV-720",
  partyId: "supplier-720",
  controlAccountCode: "331",
  counterAccountCode: "3388-OWNER",
  lines: invoice.lines.map((line) => ({
    ...line,
    dimensions: { category: "DOMAIN_HOSTING" },
  })),
};

export const recognition = {
  id: "recognition-720",
  projectId: "project-720",
  effectiveOn: "2025-06-30",
  amountMinor: "8000000",
  currency: "VND",
  state: "posted",
  reason: "Ghi nhận doanh thu thiết kế web",
  resourceVersion: "1",
};

export const snakeCaseExpensesEnvelope = {
  apiVersion: "v1",
  requestId: "expense-live-shape",
  organizationId: "naai",
  items: [
    {
      id: "expense-live-shape",
      expense_date: "2026-07-29",
      business_purpose: "Imported company expense",
      gross_minor: "408601",
      payee_party_id: "supplier-720",
      category: "DOMAIN_HOSTING",
      counter_account_code: "331",
      state: "posted",
      lines: [{ description: "Ghi chú từ dòng chi phí" }],
    },
  ],
};

export const invoiceWithoutRootCategory = {
  id: "invoice-category-line",
  type: "sales_invoice",
  documentNumber: "INV-CATEGORY-LINE",
  documentDate: "2026-08-12",
  grossMinor: "1000000",
  partyId: "client-720",
  state: "draft",
  lines: [{ dimensions: {}, allocations: [{ dimensions: { category: "SOFTWARE_DEV" } }] }],
};

export const expense = {
  id: "expense-720",
  expenseClass: "non_documented",
  expenseDate: "2026-08-06",
  businessPurpose: "Phí vận hành",
  payeePartyId: "supplier-720",
  currency: "VND",
  netMinor: "2000000",
  vatMinor: "0",
  grossMinor: "2000000",
  category: "DOMAIN_HOSTING",
  state: "draft",
  resourceVersion: "1",
  counterAccountCode: "111",
  evidenceChecklist: { invoice: false, receipt: true, contract: false, payment: false },
  lines: [
    {
      id: "line-1",
      description: "Phí vận hành",
      postingAccountCode: "642",
      netMinor: "2000000",
      vatMinor: "0",
      grossMinor: "2000000",
      allocations: [
        {
          id: "allocation-2",
          amountMinor: "2000000",
          dimensions: {
            costCenter: "ADMIN",
            projectId: "project-720",
            contractId: "contract-720",
          },
        },
      ],
    },
  ],
};

const catalogCategories = [
  {
    code: "SOFTWARE_DEV",
    name: "Doanh thu Phát triển phần mềm / App",
    kind: "revenue",
    isActive: true,
    defaultAccountCode: "5113",
  },
  {
    code: "MEAL",
    name: "Chi phí Ăn uống / Tiếp khách",
    kind: "expense",
    isActive: true,
    defaultAccountCode: "642-OPEX",
  },
  {
    code: "DOMAIN_HOSTING",
    name: "Chi phí Tên miền / Hosting",
    kind: "expense",
    isActive: true,
    defaultAccountCode: "642-OPEX",
  },
];

export async function install(
  page: Page,
  patchFailure?: { kind: "documents" | "expenses"; status: number; code: string; message: string },
  expenseState: "draft" | "posted" = "draft",
  purchaseInvoiceState: "draft" | "posted" = "draft",
  purchaseInvoiceHasJournal = false,
) {
  let currentInvoice = { ...invoice };
  let currentPurchaseInvoice: typeof purchaseInvoice | undefined = {
    ...purchaseInvoice,
    state: purchaseInvoiceState,
    ...(purchaseInvoiceState === "posted" || purchaseInvoiceHasJournal
      ? { journalId: "journal-purchase-720" }
      : {}),
  };
  let currentExpense = {
    ...expense,
    state: expenseState as string,
    payeePartyId: expense.payeePartyId as string | null,
  };
  await page.addInitScript(() => sessionStorage.setItem("naai-erp-admin-token", "erp720-token"));
  await page.route("**/api/v1/organizations/naai/master-data/categories**", (route) => {
    const kind = new URL(route.request().url()).searchParams.get("kind");
    return reply(route, {
      items: kind ? catalogCategories.filter((item) => item.kind === kind) : catalogCategories,
    });
  });
  await page.route("**/api/v1/organizations/naai/expense-categories**", (route) =>
    reply(route, { items: [] }),
  );
  await page.route("**/api/v1/organizations/naai/master-data/expense-categories**", (route) =>
    reply(route, {
      items: [
        {
          code: "MEAL",
          name: "Chi phí Ăn uống / Tiếp khách",
          isActive: true,
          fundingTreatment: "tax_only_non_cash",
        },
        {
          code: "DOMAIN_HOSTING",
          name: "Chi phí Tên miền / Hosting",
          isActive: true,
          fundingTreatment: "owner_paid_company_cost",
        },
      ],
    }),
  );
  await page.route("**/api/v1/organizations/naai/master-data/parties**", (route) =>
    reply(route, {
      items: [
        { id: "client-720", name: "Khách hàng 720" },
        { id: "supplier-720", name: "Nhà cung cấp 720" },
        { id: "supplier-721", name: "Nhà cung cấp hạ tầng 721" },
        { id: "employee-720", display_name: "Nguyễn Nhân Viên" },
      ],
    }),
  );
  await page.route("**/api/v1/organizations/naai/master-data/party-roles**", (route) =>
    reply(route, {
      items: [
        { party_id: "client-720", role: "client" },
        { party_id: "supplier-720", role: "supplier" },
        { party_id: "supplier-721", role: "supplier" },
        { party_id: "employee-720", role: "employee" },
      ],
    }),
  );
  await page.route("**/api/v1/organizations/naai/time/workers**", (route) =>
    reply(route, {
      items: [
        {
          id: "worker-720",
          worker_party_id: "employee-720",
          employmentKind: "employee",
          status: "active",
        },
      ],
    }),
  );
  await page.route("**/api/v1/organizations/naai/master-data/projects**", (route) =>
    reply(route, {
      items: [
        { id: "project-720", name: "Dự án khách hàng 720", client_party_id: "client-720" },
        { id: "project-other", name: "Dự án khách hàng khác", client_party_id: "client-other" },
      ],
    }),
  );
  await page.route("**/api/v1/organizations/naai/accounting-list-exports/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      headers: {
        "content-disposition": `attachment; filename="${route.request().url().includes("sales-invoices") ? "naai-erp-doanh-thu-2026-08-01_2026-08-31.xlsx" : "naai-erp-chi-phi-2026-08-01_2026-08-31.xlsx"}"`,
      },
      body: Buffer.from([80, 75, 3, 4]),
    }),
  );
  await page.route("**/api/v1/organizations/naai/commercial-documents**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST" && url.pathname.endsWith("/invoice-720/validate")) {
      currentInvoice = { ...currentInvoice, state: "validated", resourceVersion: "2" };
      return reply(route, { documentId: "invoice-720", state: "validated", resourceVersion: "2" });
    }
    if (route.request().method() === "DELETE" && url.pathname.endsWith("/purchase-720")) {
      expect(route.request().headers()["if-match"]).toBe("1");
      expect(route.request().headers()["idempotency-key"]).toMatch(
        /^discard-purchase-invoice-purchase-720-/,
      );
      expect(route.request().postDataJSON()).toEqual({ reason: "Hóa đơn nhập trùng" });
      currentPurchaseInvoice = undefined;
      return reply(route, {
        documentId: "purchase-720",
        deleted: true,
        idempotencyReplayed: false,
      });
    }
    if (route.request().method() === "PATCH" && url.pathname.endsWith("/invoice-720")) {
      if (patchFailure?.kind === "documents")
        return fail(route, patchFailure.status, patchFailure.code, patchFailure.message);
      expect(route.request().headers()["if-match"]).toBe("1");
      const body = route.request().postDataJSON() as typeof invoice;
      if (body.lines[0]?.allocations?.[0]?.dimensions) {
        expect(body.lines[0].allocations[0].dimensions).toMatchObject({
          costCenter: "DELIVERY",
          projectId: "project-720",
        });
        expect(body.lines[0].allocations[0].dimensions).not.toHaveProperty("contractId");
        expect(body.lines[0].allocations[0].id).toBe("allocation-1");
        expect(body.lines[0].allocations[0].amountMinor).toBe(body.lines[0].netMinor);
        expect(body.lines[0].allocations[0].dimensions).not.toHaveProperty("project");
      }
      currentInvoice = { ...currentInvoice, ...body, resourceVersion: "2" };
      return reply(route, { documentId: currentInvoice.id, resourceVersion: "2" });
    }
    if (route.request().method() === "POST" && url.pathname.endsWith("/commercial-documents"))
      return reply(route, currentInvoice);
    if (url.pathname.endsWith("/invoice-720")) return reply(route, currentInvoice);
    if (url.pathname.endsWith("/purchase-720") && currentPurchaseInvoice)
      return reply(route, currentPurchaseInvoice);
    const type = url.searchParams.get("type");
    return reply(route, {
      items:
        type === "purchase_invoice"
          ? currentPurchaseInvoice
            ? [currentPurchaseInvoice]
            : []
          : type === "sales_invoice"
            ? [currentInvoice]
            : [currentInvoice, ...(currentPurchaseInvoice ? [currentPurchaseInvoice] : [])],
    });
  });
  await page.route("**/api/v1/organizations/naai/expenses**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PATCH" && url.pathname.endsWith("/expense-720/metadata")) {
      expect(route.request().headers()["if-match"]).toBe("1");
      const body = route.request().postDataJSON() as {
        category: string;
        payeePartyId: string | null;
        businessPurpose: string;
      };
      expect(body).toEqual({
        category: "DOMAIN_HOSTING",
        payeePartyId: "supplier-721",
        businessPurpose: "Gia hạn hạ tầng vận hành",
      });
      currentExpense = {
        ...currentExpense,
        ...body,
        resourceVersion: "2",
        lines: currentExpense.lines.map((line) => ({
          ...line,
          description: body.businessPurpose,
          dimensions: { ...line.allocations[0]?.dimensions, category: body.category },
        })),
      };
      return reply(route, {
        expenseId: currentExpense.id,
        resourceVersion: "2",
        ...body,
      });
    }
    if (route.request().method() === "PATCH" && url.pathname.endsWith("/expense-720/category")) {
      const body = route.request().postDataJSON() as { category: string };
      currentExpense = {
        ...currentExpense,
        lines: currentExpense.lines.map((line) => ({
          ...line,
          dimensions: { ...line.allocations[0]?.dimensions, category: body.category },
        })),
      };
      return reply(route, { expenseId: currentExpense.id, category: body.category });
    }
    if (route.request().method() === "PATCH" && url.pathname.endsWith("/expense-720")) {
      if (patchFailure?.kind === "expenses")
        return fail(route, patchFailure.status, patchFailure.code, patchFailure.message);
      expect(route.request().headers()["if-match"]).toBe("1");
      const body = route.request().postDataJSON() as typeof expense;
      expect(body.lines[0]?.allocations[0]?.dimensions).toMatchObject({ projectId: "project-720" });
      expect(body.lines[0]?.allocations[0]?.dimensions).toMatchObject({
        costCenter: "ADMIN",
      });
      expect(body.lines[0]?.allocations[0]?.dimensions).not.toHaveProperty("contractId");
      expect(body.lines[0]?.allocations[0]?.id).toBe("allocation-2");
      expect(body.lines[0]?.allocations[0]?.amountMinor).toBe(body.lines[0]?.netMinor);
      expect(body.lines[0]?.allocations[0]?.dimensions).not.toHaveProperty("project");
      currentExpense = { ...currentExpense, ...body, resourceVersion: "2" };
      return reply(route, { expenseId: currentExpense.id, resourceVersion: "2" });
    }
    if (route.request().method() === "POST" && url.pathname.endsWith("/expenses")) {
      const body = route.request().postDataJSON() as typeof expense;
      expect(body.lines[0]?.allocations[0]?.dimensions).toMatchObject({
        projectId: "project-720",
      });
      expect(body.lines[0]?.allocations[0]?.dimensions).not.toHaveProperty("contractId");
      return reply(route, currentExpense);
    }
    if (route.request().method() === "POST" && url.pathname.endsWith("/expense-720/reverse")) {
      expect(route.request().headers()["if-match"]).toBe("1");
      expect(route.request().headers()["idempotency-key"]).toMatch(
        /^reverse-expenses-expense-720-/,
      );
      expect(route.request().postDataJSON()).toEqual({ reason: "Nhập nhầm số tiền" });
      currentExpense = { ...currentExpense, state: "reversed", resourceVersion: "2" };
      return reply(route, {
        expenseId: "expense-720",
        state: "reversed",
        reversalJournalId: "journal-reversal-720",
        idempotencyReplayed: false,
      });
    }
    if (
      route.request().method() === "POST" &&
      url.pathname.endsWith("/expense-720/reclassify-funding")
    ) {
      expect(route.request().headers()["if-match"]).toBe("1");
      expect(route.request().postDataJSON()).toEqual({
        financialAccountId: "fa-owner-custody",
        reason: "Chi từ tiền công ty chủ giữ hộ",
      });
      return reply(route, { expenseId: "expense-720", replacementExpenseId: "expense-720-r" });
    }
    if (url.pathname.endsWith("/expense-720")) return reply(route, currentExpense);
    return reply(route, { items: [currentExpense] });
  });
  await page.route("**/api/v1/organizations/naai/banking/accounts**", (route) =>
    reply(route, {
      items: [
        // Company cash and owner-held custody cash share one ledger account.
        {
          id: "fa-company-cash",
          code: "CASH-COMPANY",
          display_name: "Quỹ tiền mặt công ty",
          ledger_account_code: "111-CASH",
          status: "active",
        },
        {
          id: "fa-owner-custody",
          code: "CASH-OWNER-CUSTODY",
          display_name: "Tiền công ty chủ giữ hộ",
          ledger_account_code: "111-CASH",
          status: "active",
        },
      ],
    }),
  );
  await page.route("**/api/v1/organizations/naai/organization-workflow-policy**", (route) =>
    reply(route, { operatingMode: "solopreneur", allowSelfApproval: false }),
  );
  await page.route("**/api/v1/organizations/naai/revenue-recognition-events**", (route) =>
    reply(route, { items: [recognition] }),
  );
  await page.routeWebSocket(/\/_next\/webpack-hmr/, () => {});
}
