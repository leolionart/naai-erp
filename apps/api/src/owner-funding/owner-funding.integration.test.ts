import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
import { NaaiErpClient } from "../../../cli/src/client.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration(
  "T-INT-PAY-004 owner funding deposit, company_bank traceability and repayment",
  () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const org = `org-erp983-${randomUUID().slice(0, 8)}`;
    const otherOrg = `org-erp983-b-${randomUUID().slice(0, 8)}`;
    const ownerToken = `erp983-owner-${org}`;
    const otherToken = `erp983-other-${otherOrg}`;
    let app: Awaited<ReturnType<typeof createApp>>;
    let cli: NaaiErpClient;

    const headers = (token: string, key?: string) => ({
      authorization: `Bearer ${token}`,
      ...(key ? { "idempotency-key": key } : {}),
      "x-correlation-id": `corr-${key ?? randomUUID()}`,
    });

    beforeAll(async () => {
      await pool.query(
        `insert into organizations(id, legal_name, base_currency, timezone) values
         ($1, 'ERP 983 Co Ltd', 'VND', 'Asia/Ho_Chi_Minh'),
         ($2, 'ERP 983 Other Co', 'VND', 'Asia/Ho_Chi_Minh')`,
        [org, otherOrg],
      );
      await pool.query(
        `insert into accounting_workflow_policies(organization_id, allow_self_approval, self_approval_max_minor, operating_mode, updated_by)
       values ($1, false, null, 'solopreneur', 'owner-1')`,
        [org],
      );
      await pool.query(
        `insert into fiscal_years(organization_id, year, starts_on, ends_on)
       values ($1, 2026, '2026-01-01', '2026-12-31')`,
        [org],
      );
      await pool.query(
        `insert into fiscal_periods(organization_id, fiscal_year, period_number, starts_on, ends_on, state) values
         ($1, 2026, 8, '2026-08-01', '2026-08-31', 'open'),
         ($1, 2026, 9, '2026-09-01', '2026-09-30', 'hard_locked')`,
        [org],
      );
      await pool.query(
        `insert into accounts(organization_id, code, name, root_type) values
         ($1, '111-CASH', 'Quỹ tiền mặt', 'asset'),
         ($1, '112-VCB', 'Tiền gửi ngân hàng VCB', 'asset'),
         ($1, '112-ACB', 'Tiền gửi ngân hàng ACB', 'asset'),
         ($1, '3388', 'Phải trả, phải nộp khác - Chủ sở hữu', 'liability'),
         ($1, '511', 'Doanh thu cung cấp dịch vụ', 'revenue'),
         ($1, '642', 'Chi phí quản lý doanh nghiệp', 'expense')`,
        [org],
      );
      await pool.query(
        `insert into financial_accounts(organization_id, id, code, kind, display_name, currency, ledger_account_code, bank_code, status, created_by, updated_by) values
         ($1, 'bank-vcb', 'BANK-VCB', 'bank', 'VCB VND Operating', 'VND', '112-VCB', 'VCB', 'active', 'owner-1', 'owner-1'),
         ($1, 'bank-acb', 'BANK-ACB', 'bank', 'ACB VND Secondary', 'VND', '112-ACB', 'ACB', 'active', 'owner-1', 'owner-1'),
         ($1, 'cash-main', 'CASH-COMPANY', 'cash', 'Quỹ tiền mặt công ty', 'VND', '111-CASH', null, 'active', 'owner-1', 'owner-1')`,
        [org],
      );
      await pool.query(
        `insert into financial_statement_mapping_versions(organization_id, id, version, framework, state, effective_from, change_reason, created_by, approved_by, approved_at)
       values ($1, 'map-tt133', 1, 'TT133', 'approved', '2026-01-01', 'Owner current setup', 'owner-1', 'owner-1', now())`,
        [org],
      );
      await pool.query(
        `insert into financial_statement_mapping_lines(organization_id, mapping_id, mapping_version, line_number, statement, line_code, label, account_code, display_order, sign)
       values ($1, 'map-tt133', 1, 1, 'balance_sheet', 'owner_current', 'Owner Current', '3388', 10, 1)`,
        [org],
      );
      await pool.query(
        `insert into expense_categories(organization_id, code, name, funding_treatment, created_by, updated_by)
       values ($1, 'CLOUD', 'Cloud infrastructure', 'company_funds', 'owner-1', 'owner-1')`,
        [org],
      );
      await pool.query(
        `insert into parties(organization_id, id, display_name, status) values ($1, 'sup-cloud', 'Cloud Provider VN', 'active')`,
        [org],
      );
      await pool.query(
        `insert into party_roles(organization_id, party_id, role) values ($1, 'sup-cloud', 'supplier')`,
        [org],
      );
      await pool.query(
        `insert into api_credentials(organization_id, id, actor_id, token_hash, roles) values
         ($1, 'cred-owner', 'owner-1', $2, '["owner"]'),
         ($3, 'cred-other', 'other-1', $4, '["owner"]')`,
        [
          org,
          createHash("sha256").update(ownerToken).digest("hex"),
          otherOrg,
          createHash("sha256").update(otherToken).digest("hex"),
        ],
      );

      app = await createApp();
      await app.init();
      await app.getHttpAdapter().getInstance().ready();

      const injectFetch: typeof fetch = async (input, init) => {
        const parsed = new URL(String(input));
        const res = await app.inject({
          method: (init?.method ?? "GET") as "GET" | "POST",
          url: `${parsed.pathname}${parsed.search}`,
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
          ...(init?.body ? { payload: JSON.parse(String(init.body)) } : {}),
        });
        return new Response(res.body, {
          status: res.statusCode,
          headers: { "content-type": "application/json" },
        });
      };
      cli = new NaaiErpClient(
        { baseUrl: "http://local.test", organizationId: org, token: ownerToken },
        injectFetch,
      );
    });

    afterAll(async () => {
      await app?.close();
      await pool.end();
    });

    it("classifies bank deposit as owner_funding (Dr 112 / Cr 3388, zero revenue), links company_bank expenses, and records owner_repayment (Dr 3388 / Cr 112)", async () => {
      // 1. Import bank statement containing a 20,000,000 VND deposit from owner and a -5,000,000 VND repayment transfer.
      const csvText = [
        "provider_transaction_id,booking_date,value_date,amount_minor,currency,reference,description,counterparty",
        "VCB-DEP-01,2026-08-05,2026-08-05,20000000,VND,FT26217OWNER01,Chu chuyen tien vao TK cong ty,Nguyen Chu",
        "VCB-OUT-01,2026-08-22,2026-08-22,-5000000,VND,FT26234REPAY01,Cong ty hoan tien tam ung cho chu,Nguyen Chu",
      ].join("\n");

      const imported = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/imports`,
        headers: headers(ownerToken, "imp-983-1"),
        payload: {
          financialAccountId: "bank-vcb",
          adapterId: "generic-csv",
          adapterVersion: 1,
          filename: "vcb-aug.csv",
          csvText,
        },
      });
      expect(imported.statusCode, imported.body).toBe(201);
      const depositTxId = imported.json().data.rows[0].transactionId as string;
      const repaymentTxId = imported.json().data.rows[1].transactionId as string;

      // Negative test: cannot classify outgoing negative transaction as owner_funding.
      const wrongDirection = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/owner-funding`,
        headers: headers(ownerToken, "bad-dir-1"),
        payload: {
          movementType: "owner_funding",
          bankTransactionId: repaymentTxId,
          reason: "Wrong sign check",
        },
      });
      expect(wrongDirection.statusCode).toBe(422);
      expect(wrongDirection.json().error.code).toBe("OWNER_FUNDING_DIRECTION_INVALID");

      // 2. Classify bank deposit as owner_funding via CLI client (`owner-funding record`).
      const depositRes = (await cli.request(
        "owner-funding",
        "record",
        {
          id: "ofm-bank-dep-1",
          bankTransactionId: depositTxId,
          reason: "Chủ nạp tiền vào tài khoản VCB để công ty thanh toán chi phí",
        },
        undefined,
        undefined,
        "idem-ofm-bank-1",
      )) as { data: Record<string, unknown> };
      expect(depositRes.data).toMatchObject({
        movementId: "ofm-bank-dep-1",
        movementType: "owner_funding",
        entryMode: "bank_transaction",
        financialAccountId: "bank-vcb",
        transactionId: depositTxId,
        amountMinor: "20000000",
        reference: "FT26217OWNER01",
        status: "posted",
        idempotencyReplayed: false,
      });

      // Idempotent replay returns same result without second journal.
      const replayRes = (await cli.request(
        "owner-funding",
        "record",
        {
          id: "ofm-bank-dep-1",
          bankTransactionId: depositTxId,
          reason: "Chủ nạp tiền vào tài khoản VCB để công ty thanh toán chi phí",
        },
        undefined,
        undefined,
        "idem-ofm-bank-1",
      )) as { data: Record<string, unknown> };
      expect(replayRes.data.idempotencyReplayed).toBe(true);

      // Verify journal lines: Dr 112-VCB 20,000,000 / Cr 3388 20,000,000.
      const depJournalLines = await pool.query<{
        line_number: number;
        account_code: string;
        debit_minor: string | null;
        credit_minor: string | null;
      }>(
        `select line_number, account_code, debit_minor::text, credit_minor::text
         from journal_lines
        where organization_id = $1 and journal_id = $2
        order by line_number`,
        [org, depositRes.data.journalId],
      );
      expect(depJournalLines.rows).toEqual([
        { line_number: 1, account_code: "112-VCB", debit_minor: "20000000", credit_minor: null },
        { line_number: 2, account_code: "3388", debit_minor: null, credit_minor: "20000000" },
      ]);

      // 3. Record manual owner_funding entry with reference (and verify missing reference / cash account / locked period fail cleanly).
      const missingRef = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/owner-funding`,
        headers: headers(ownerToken, "missing-ref-1"),
        payload: {
          financialAccountId: "bank-vcb",
          bookingDate: "2026-08-08",
          amountMinor: "10000000",
          description: "Chủ nộp tiền vào ngân hàng",
          reason: "Thiếu mã chứng từ",
        },
      });
      expect(missingRef.statusCode).toBe(422);
      expect(missingRef.json().error.code).toBe("OWNER_FUNDING_REFERENCE_REQUIRED");

      const cashRejected = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/owner-funding`,
        headers: headers(ownerToken, "cash-rej-1"),
        payload: {
          financialAccountId: "cash-main",
          bookingDate: "2026-08-08",
          amountMinor: "10000000",
          reference: "PT-01",
          description: "Tiền mặt không phải ngân hàng",
          reason: "Phải dùng TK ngân hàng 112",
        },
      });
      expect(cashRejected.statusCode).toBe(422);
      expect(cashRejected.json().error.code).toBe("OWNER_FUNDING_BANK_ACCOUNT_REQUIRED");

      const lockedPeriod = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/banking/owner-funding`,
        headers: headers(ownerToken, "locked-983-1"),
        payload: {
          financialAccountId: "bank-vcb",
          bookingDate: "2026-09-05",
          amountMinor: "10000000",
          reference: "UNC-LOCKED",
          description: "Kỳ đã khóa",
          reason: "Kiểm tra khóa kỳ",
        },
      });
      expect(lockedPeriod.statusCode).toBe(409);
      expect(lockedPeriod.json().error.code).toBe("PERIOD_HARD_LOCKED");

      const manualDeposit = (await cli.recordOwnerFunding(
        {
          id: "ofm-manual-dep-1",
          financialAccountId: "bank-vcb",
          bookingDate: "2026-08-08",
          amountMinor: "10000000",
          currency: "VND",
          reference: "UNC-20260808-02",
          description: "Chủ chuyển thêm tiền vào VCB",
          reason: "Nạp thêm tiền thanh toán nhà cung cấp",
        },
        "idem-ofm-manual-1",
      )) as { data: Record<string, unknown> };
      expect(manualDeposit.data).toMatchObject({
        movementId: "ofm-manual-dep-1",
        movementType: "owner_funding",
        entryMode: "manual",
        amountMinor: "10000000",
        reference: "UNC-20260808-02",
        status: "posted",
      });

      // 4. Subsequent company expenses paid from that company bank account (`company_bank`),
      //    linking to the funding transaction (`ownerFundingTransactionId`) for traceability!
      //    First verify wrong-account linkage is rejected with zero mutation.
      const wrongBankExpense = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/expenses`,
        headers: headers(ownerToken, "exp-wrong-bank-1"),
        payload: {
          id: "exp-wrong-bank",
          expenseClass: "invoice_backed",
          payeePartyId: "sup-cloud",
          expenseDate: "2026-08-12",
          businessPurpose: "Thanh toán từ sai ngân hàng",
          currency: "VND",
          netMinor: "8000000",
          vatMinor: "0",
          grossMinor: "8000000",
          counterAccountCode: "112-ACB",
          funding: {
            type: "company_bank",
            financialAccountId: "bank-acb",
            ownerFundingTransactionId: depositTxId,
          },
          lines: [
            {
              description: "Cloud server",
              netMinor: "8000000",
              vatMinor: "0",
              grossMinor: "8000000",
              postingAccountCode: "642",
              expenseCategoryCode: "CLOUD",
              allocations: [
                { id: "alloc-wb-1", amountMinor: "8000000", dimensions: { costCenter: "OPS" } },
              ],
            },
          ],
        },
      });
      expect(wrongBankExpense.statusCode).toBe(422);
      expect(wrongBankExpense.json().error.code).toBe("OWNER_FUNDING_ACCOUNT_MISMATCH");

      const linkedExpenseRes = await app.inject({
        method: "POST",
        url: `/api/v1/organizations/${org}/expenses`,
        headers: headers(ownerToken, "exp-linked-1"),
        payload: {
          id: "exp-983-linked",
          expenseClass: "invoice_backed",
          payeePartyId: "sup-cloud",
          expenseDate: "2026-08-12",
          businessPurpose: "Thanh toán hạ tầng cloud từ tiền chủ nạp",
          currency: "VND",
          netMinor: "12000000",
          vatMinor: "0",
          grossMinor: "12000000",
          counterAccountCode: "112-VCB",
          funding: {
            type: "company_bank",
            financialAccountId: "bank-vcb",
            ownerFundingTransactionId: depositTxId,
          },
          evidenceChecklist: { invoice: true, payment: true },
          lines: [
            {
              description: "Cloud hosting tháng 08/2026",
              netMinor: "12000000",
              vatMinor: "0",
              grossMinor: "12000000",
              postingAccountCode: "642",
              expenseCategoryCode: "CLOUD",
              allocations: [
                { id: "alloc-983-1", amountMinor: "12000000", dimensions: { costCenter: "OPS" } },
              ],
            },
          ],
        },
      });
      expect(linkedExpenseRes.statusCode, linkedExpenseRes.body).toBe(201);
      expect(linkedExpenseRes.json().data.state).toBe("posted");

      const expenseDetail = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/expenses/exp-983-linked`,
        headers: headers(ownerToken),
      });
      expect(expenseDetail.statusCode).toBe(200);
      expect(expenseDetail.json().data).toMatchObject({
        id: "exp-983-linked",
        fundingFinancialAccountId: "bank-vcb",
        ownerFundingId: "ofm-bank-dep-1",
        ownerFundingTransactionId: depositTxId,
      });

      // 5. Record owner_repayment (Dr 3388 / Cr 112):
      //    - 5,000,000 VND from imported outgoing bank transaction
      //    - 3,000,000 VND manual repayment with reference via CLI `repay`
      const txRepayment = (await cli.request(
        "owner-funding",
        "record",
        {
          id: "ofm-repay-tx-1",
          movementType: "owner_repayment",
          bankTransactionId: repaymentTxId,
          reason: "Hoàn trả một phần tiền chủ đã nạp qua VCB",
        },
        undefined,
        undefined,
        "idem-repay-tx-1",
      )) as { data: Record<string, unknown> };
      expect(txRepayment.data).toMatchObject({
        movementId: "ofm-repay-tx-1",
        movementType: "owner_repayment",
        entryMode: "bank_transaction",
        amountMinor: "5000000",
        status: "posted",
      });

      const repayJournalLines = await pool.query<{
        line_number: number;
        account_code: string;
        debit_minor: string | null;
        credit_minor: string | null;
      }>(
        `select line_number, account_code, debit_minor::text, credit_minor::text
         from journal_lines
        where organization_id = $1 and journal_id = $2
        order by line_number`,
        [org, txRepayment.data.journalId],
      );
      expect(repayJournalLines.rows).toEqual([
        { line_number: 1, account_code: "3388", debit_minor: "5000000", credit_minor: null },
        { line_number: 2, account_code: "112-VCB", debit_minor: null, credit_minor: "5000000" },
      ]);

      const manualRepayment = (await cli.recordOwnerRepayment(
        {
          id: "ofm-repay-manual-1",
          financialAccountId: "bank-vcb",
          bookingDate: "2026-08-25",
          amountMinor: "3000000",
          currency: "VND",
          reference: "UNC-REPAY-02",
          description: "Công ty chuyển khoản hoàn tiền chủ lần 2",
          reason: "Quyết toán bớt công nợ chủ",
        },
        "idem-repay-manual-1",
      )) as { data: Record<string, unknown> };
      expect(manualRepayment.data).toMatchObject({
        movementId: "ofm-repay-manual-1",
        movementType: "owner_repayment",
        entryMode: "manual",
        amountMinor: "3000000",
        status: "posted",
      });

      // 6. Verify `owner-funding list` & traceability + cross-org isolation.
      const listed = (await cli.listOwnerFunding()) as {
        data: {
          items: Array<Record<string, unknown>>;
          summary: Record<string, string>;
        };
      };
      expect(listed.data.summary).toEqual({
        ownerFundingMinor: "30000000",
        ownerRepaymentMinor: "8000000",
        netOwnerBankFundingMinor: "22000000",
      });
      const depItem = listed.data.items.find((item) => item.id === "ofm-bank-dep-1");
      expect(depItem).toMatchObject({
        linkedSpendMinor: "12000000",
        linkedRecords: [
          {
            kind: "expense",
            id: "exp-983-linked",
            grossMinor: "12000000",
            state: "posted",
          },
        ],
      });

      const foreignList = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${otherOrg}/banking/owner-funding`,
        headers: headers(otherToken),
      });
      expect(foreignList.statusCode).toBe(200);
      expect(foreignList.json().data.items).toEqual([]);

      // 7. Verify Owner Current position (`GET /banking/owner-current-movements`) and Operating Dashboard:
      //    - Total owner funding = 20M + 10M = 30M
      //    - Total owner repayment = 5M + 3M = 8M
      //    - Company bank expense (12M) did NOT touch 3388 (paid from 112-VCB)
      //    - Company owes owner = 30M - 8M = 22,000,000 VND
      //    - Bank balance = 30M - 12M - 8M = 10,000,000 VND
      //    - Revenue = 0 VND, Expense = 12,000,000 VND
      const ownerCurrent = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/banking/owner-current-movements`,
        headers: headers(ownerToken),
      });
      expect(ownerCurrent.statusCode, ownerCurrent.body).toBe(200);
      expect(ownerCurrent.json().data.summary).toEqual({
        statutoryOwnerCurrentBalanceMinor: "22000000",
        confirmedSettlementBalanceMinor: "22000000",
        companyOwesOwnerMinor: "22000000",
        ownerHoldsCompanyFundsMinor: "0",
        ownerPaidCompanyCostMinor: "0",
        ownerCustodyCashMinor: "0",
        ownerPersonalWithdrawalMinor: "0",
        ownerFundingMinor: "30000000",
        ownerRepaymentMinor: "8000000",
        reviewMinor: "0",
        reviewCount: 0,
      });
      expect(ownerCurrent.json().data.confirmedTimeline).toHaveLength(4);

      const dashboard = await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${org}/reports/operating-dashboard?asOf=2026-08-31&startsOn=2026-08-01&endsOn=2026-08-31`,
        headers: headers(ownerToken),
      });
      expect(dashboard.statusCode, dashboard.body).toBe(200);
      expect(dashboard.json().data.financials).toMatchObject({
        revenueMinor: "0",
        expenseMinor: "12000000",
        bankAvailableMinor: "10000000",
        cashAndBankMinor: "10000000",
        ownerPayableMinor: "22000000",
        companyOwesOwnerMinor: "22000000",
        ownerOperatingPayableMinor: "22000000",
        confirmedOwnerSettlementMinor: "22000000",
        statutoryOwnerCurrentBalanceMinor: "22000000",
      });
    });
  },
);
