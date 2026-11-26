import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-982 T-INT-PAY-002 bank reconciliation payment evidence inference", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const organizationId = `org-pay002-${randomUUID().slice(0, 12)}`;
  let app: Awaited<ReturnType<typeof createApp>>;
  const ownerToken = `owner-pay002-${organizationId}`;

  beforeAll(async () => {
    await pool.query(
      `insert into organizations (id, legal_name, base_currency, timezone)
       values ($1, 'ERP-982 Reconciliation Co', 'VND', 'Asia/Ho_Chi_Minh')`,
      [organizationId],
    );
    await pool.query(
      `insert into accounting_workflow_policies (organization_id, operating_mode, allow_self_approval, self_approval_max_minor, non_cash_threshold_minor, updated_by)
       values ($1, 'solopreneur', false, null, 5000000, 'owner-user')`,
      [organizationId],
    );
    await pool.query(
      `insert into fiscal_years (organization_id, year, starts_on, ends_on)
       values ($1, 2026, '2026-01-01', '2026-12-31')`,
      [organizationId],
    );
    await pool.query(
      `insert into fiscal_periods (organization_id, fiscal_year, period_number, starts_on, ends_on)
       values ($1, 2026, 8, '2026-08-01', '2026-08-31')`,
      [organizationId],
    );
    await pool.query(
      `insert into accounts (organization_id, code, name, root_type, is_control_account, allow_manual_posting)
       values ($1, '1121-VCB', 'Company VCB Bank', 'asset', true, false),
              ($1, '1331-VAT', 'Deductible input VAT', 'asset', true, false),
              ($1, '331-AP', 'Accounts payable', 'liability', true, false),
              ($1, '3388-OWNER', 'Owner current payable', 'liability', true, false),
              ($1, '642-OPEX', 'Operating expense', 'expense', false, true)`,
      [organizationId],
    );
    await pool.query(
      `insert into financial_accounts (organization_id, id, code, kind, display_name, currency, ledger_account_code, bank_code, created_by, updated_by)
       values ($1, 'BANK-VCB', 'VCB-01', 'bank', 'VCB Checking', 'VND', '1121-VCB', 'VCB', 'owner-user', 'owner-user')`,
      [organizationId],
    );
    await pool.query(
      `insert into parties (organization_id, id, display_name, status)
       values ($1, 'SUP-01', 'Supplier Reconcile', 'active')`,
      [organizationId],
    );
    await pool.query(
      `insert into party_roles (organization_id, party_id, role)
       values ($1, 'SUP-01', 'supplier')`,
      [organizationId],
    );
    await pool.query(
      `insert into tax_code_versions (organization_id, code, effective_from, name, kind, rate, review_state, reviewed_by, reviewed_at, review_reason)
       values ($1, 'VAT10_IN', '2026-01-01', 'Input VAT 10%', 'vat_input', 0.10, 'accountant_approved', 'owner-user', now(), 'Approved')`,
      [organizationId],
    );
    await pool.query(
      `insert into financial_statement_mapping_versions (organization_id, id, version, framework, state, effective_from, change_reason, created_by, approved_by, approved_at)
       values ($1, 'map-tt133', 1, 'TT133', 'approved', '2026-01-01', 'ERP-982 reconciliation mapping', 'owner-user', 'owner-user', now())`,
      [organizationId],
    );
    await pool.query(
      `insert into financial_statement_mapping_lines (organization_id, mapping_id, mapping_version, line_number, statement, line_code, label, account_code, display_order, sign)
       values ($1, 'map-tt133', 1, 1, 'balance_sheet', 'owner_current', 'Owner current', '3388-OWNER', 1, 1)`,
      [organizationId],
    );
    const ownerHash = createHash("sha256").update(ownerToken).digest("hex");
    await pool.query(
      `insert into api_credentials (organization_id, id, actor_id, token_hash, roles)
       values ($1, 'cred-owner', 'owner-user', $2, '["owner","finance_admin"]')`,
      [organizationId, ownerHash],
    );

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  const headers = (key?: string) => ({
    authorization: `Bearer ${ownerToken}`,
    ...(key ? { "idempotency-key": key } : {}),
  });

  it("auto-infers bank_transfer + paid_on and re-evaluates CIT/VAT eligibility when bank payment reconciles", async () => {
    // 1) Post a 6,600,000 VND unpaid purchase invoice & 5,500,000 VND unpaid AP expense
    const docRes = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/commercial-documents`,
      headers: headers("pay002-doc-create"),
      payload: {
        id: "doc-rec-66m",
        type: "purchase_invoice",
        documentNumber: "PI-REC-01",
        fiscalYear: 2026,
        partyId: "SUP-01",
        documentDate: "2026-08-10",
        dueDate: "2026-08-25",
        currency: "VND",
        netMinor: "6000000",
        taxMinor: "600000",
        grossMinor: "6600000",
        controlAccountCode: "331-AP",
        funding: { type: "owner_paid" },
        lines: [
          {
            description: "Server hardware invoice awaiting bank transfer",
            quantity: "1",
            unitPriceMinor: "6000000",
            netMinor: "6000000",
            taxMinor: "600000",
            grossMinor: "6600000",
            primaryAccountCode: "642-OPEX",
            taxAccountCode: "1331-VAT",
            taxCode: "VAT10_IN",
            allocations: [
              { id: "a-rec-doc", amountMinor: "6000000", dimensions: { costCenter: "IT" } },
            ],
          },
        ],
      },
    });
    expect(docRes.statusCode, docRes.body).toBe(201);

    const expRes = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/expenses`,
      headers: headers("pay002-exp-create"),
      payload: {
        id: "exp-rec-55m",
        expenseClass: "invoice_backed",
        payeePartyId: "SUP-01",
        expenseDate: "2026-08-11",
        businessPurpose: "Unpaid AP vendor expense",
        currency: "VND",
        netMinor: "5000000",
        vatMinor: "500000",
        grossMinor: "5500000",
        counterAccountCode: "331-AP",
        externalReference: { system: "paperless-ngx", externalId: "pl-rec-exp" },
        lines: [
          {
            description: "Vendor service awaiting bank settlement",
            netMinor: "5000000",
            vatMinor: "500000",
            grossMinor: "5500000",
            postingAccountCode: "642-OPEX",
            vatAccountCode: "1331-VAT",
            allocations: [
              { id: "a-rec-exp", amountMinor: "5000000", dimensions: { costCenter: "IT" } },
            ],
          },
        ],
      },
    });
    expect(expRes.statusCode, expRes.body).toBe(201);

    // Initially both are unpaid >= 5M -> gated in payment-evidence-gaps
    const initialGaps = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/reports/tax/payment-evidence-gaps?startsOn=2026-08-01&endsOn=2026-08-31`,
        headers: headers(),
      })
    ).json().data;
    expect(initialGaps.status).toBe("warning");
    expect(initialGaps.counts.recordCount).toBe(2);

    // 2) Insert bank statement outgoing payments on BANK-VCB and reconcile both
    await pool.query(
      `insert into bank_transactions (organization_id, id, financial_account_id, fingerprint, booking_date, amount_minor, currency, reference, description, counterparty_name)
       values ($1, 'bt-doc-66m', 'BANK-VCB', repeat('a', 64), '2026-08-18', -6600000, 'VND', null, 'Pay PI-REC-01', 'Supplier Reconcile'),
              ($1, 'bt-exp-55m', 'BANK-VCB', repeat('b', 64), '2026-08-19', -5500000, 'VND', 'VCB-REF-55M', 'Pay exp-rec-55m', 'Supplier Reconcile')`,
      [organizationId],
    );

    const matchDoc = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/banking/transactions/bt-doc-66m/match`,
      headers: headers("pay002-match-doc"),
      payload: {
        schemaVersion: 1,
        baseAmountMinor: "6600000",
        manualOverride: true,
        overrideReason: "Direct bank payment match",
        overrideReference: "VCB-STMT-2026-08",
        allocations: [
          {
            targetType: "commercial_document",
            targetId: "doc-rec-66m",
            targetAmountMinor: "6600000",
            targetCurrency: "VND",
            baseAmountMinor: "6600000",
          },
        ],
        adjustments: [],
      },
    });
    expect(matchDoc.statusCode, matchDoc.body).toBe(201);
    const recDoc = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/banking/transactions/bt-doc-66m/reconcile`,
      headers: headers("pay002-rec-doc"),
      payload: { schemaVersion: 1, reason: "Settled via VCB transfer" },
    });
    expect(recDoc.statusCode, recDoc.body).toBe(201);

    const matchExp = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/banking/transactions/bt-exp-55m/match`,
      headers: headers("pay002-match-exp"),
      payload: {
        schemaVersion: 1,
        baseAmountMinor: "5500000",
        manualOverride: true,
        overrideReason: "Direct bank expense match",
        overrideReference: "VCB-STMT-2026-08",
        allocations: [
          {
            targetType: "expense",
            targetId: "exp-rec-55m",
            targetAmountMinor: "5500000",
            targetCurrency: "VND",
            baseAmountMinor: "5500000",
          },
        ],
        adjustments: [],
      },
    });
    expect(matchExp.statusCode, matchExp.body).toBe(201);
    const recExp = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/banking/transactions/bt-exp-55m/reconcile`,
      headers: headers("pay002-rec-exp"),
      payload: { schemaVersion: 1, reason: "Settled expense via VCB transfer" },
    });
    expect(recExp.statusCode, recExp.body).toBe(201);

    // 3) Read back both records: payment_method = bank_transfer, paid_on = booking_date, CIT & VAT eligible!
    const docAfter = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/commercial-documents/doc-rec-66m`,
        headers: headers(),
      })
    ).json().data;
    expect(docAfter.state).toBe("paid");
    expect(docAfter.paymentMethod).toBe("bank_transfer");
    expect(docAfter.paidOn).toBe("2026-08-18");
    expect(docAfter.paymentEvidenceRef).toBe("bank_tx:bt-doc-66m");
    expect(docAfter.paymentEvidenceMissing).toBe(false);
    expect(docAfter.lines[0].citState).toBe("eligible");
    expect(docAfter.lines[0].vatState).toBe("eligible");

    const expAfter = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/expenses/exp-rec-55m`,
        headers: headers(),
      })
    ).json().data;
    expect(expAfter.paymentMethod).toBe("bank_transfer");
    expect(expAfter.paidOn).toBe("2026-08-19");
    expect(expAfter.paymentEvidenceRef).toBe("VCB-REF-55M");
    expect(expAfter.paymentEvidenceMissing).toBe(false);
    expect(expAfter.cit_state).toBe("eligible");
    expect(expAfter.vat_state).toBe("eligible");

    const afterGaps = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/reports/tax/payment-evidence-gaps?startsOn=2026-08-01&endsOn=2026-08-31`,
        headers: headers(),
      })
    ).json().data;
    expect(afterGaps.status).toBe("ready");
    expect(afterGaps.items).toHaveLength(0);

    // 4) Unreconciling bt-doc-66m reverts bank_tx-inferred payment back to unpaid and re-gates deductibility
    const unrecDoc = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/banking/transactions/bt-doc-66m/unreconcile`,
      headers: headers("pay002-unrec-doc"),
      payload: { schemaVersion: 1, reason: "Matched wrong invoice" },
    });
    expect(unrecDoc.statusCode, unrecDoc.body).toBe(201);
    const docUnreconciled = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/commercial-documents/doc-rec-66m`,
        headers: headers(),
      })
    ).json().data;
    expect(docUnreconciled.paymentMethod).toBe("unpaid");
    expect(docUnreconciled.paidOn).toBeNull();
    expect(docUnreconciled.paymentEvidenceMissing).toBe(true);
    expect(docUnreconciled.lines[0].citState).toBe("unreviewed");
    expect(docUnreconciled.lines[0].vatState).toBe("unreviewed");
  });
});
