import { createHash } from "node:crypto";
import type pg from "pg";

export function authHeaders(token: string, key?: string, ifMatch?: string) {
  return {
    authorization: `Bearer ${token}`,
    ...(key ? { "idempotency-key": key } : {}),
    ...(ifMatch ? { "if-match": ifMatch } : {}),
  };
}

export async function seedPaymentEvidenceTestOrg(
  pool: pg.Pool,
  organizationId: string,
  ownerToken: string,
  accountantToken: string,
) {
  await pool.query(
    `insert into organizations (id, legal_name, base_currency, timezone)
     values ($1, 'ERP-982 Solopreneur Co', 'VND', 'Asia/Ho_Chi_Minh')`,
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
     values ($1, '111-CASH', 'Cash on hand', 'asset', true, false),
            ($1, '112-BANK', 'Bank account', 'asset', true, false),
            ($1, '1331-VAT', 'Deductible input VAT', 'asset', true, false),
            ($1, '331-AP', 'Accounts payable', 'liability', true, false),
            ($1, '3388-OWNER', 'Owner current payable', 'liability', true, false),
            ($1, '642-OPEX', 'Operating expense', 'expense', false, true)`,
    [organizationId],
  );
  await pool.query(
    `insert into financial_accounts (organization_id, id, code, kind, display_name, currency, ledger_account_code, bank_code, created_by, updated_by)
     values ($1, 'BANK-01', 'VCB-MAIN', 'bank', 'VCB Company Bank', 'VND', '112-BANK', 'VCB', 'owner-user', 'owner-user')`,
    [organizationId],
  );
  await pool.query(
    `insert into parties (organization_id, id, display_name, status)
     values ($1, 'SUP-01', 'Supplier Alpha', 'active'),
            ($1, 'SUP-02', 'Supplier SameDay', 'active')`,
    [organizationId],
  );
  await pool.query(
    `insert into party_roles (organization_id, party_id, role)
     values ($1, 'SUP-01', 'supplier'),
            ($1, 'SUP-02', 'supplier')`,
    [organizationId],
  );
  await pool.query(
    `insert into tax_code_versions (organization_id, code, effective_from, name, kind, rate, review_state, reviewed_by, reviewed_at, review_reason)
     values ($1, 'VAT10_IN', '2026-01-01', 'Input VAT 10%', 'vat_input', 0.10, 'accountant_approved', 'acct', now(), 'Approved'),
            ($1, 'CIT20', '2026-01-01', 'CIT 20%', 'cit', 0.20, 'accountant_approved', 'acct', now(), 'Approved')`,
    [organizationId],
  );
  await pool.query(
    `insert into financial_statement_mapping_versions (organization_id, id, version, framework, state, effective_from, change_reason, created_by, approved_by, approved_at)
     values ($1, 'map-tt133', 1, 'TT133', 'approved', '2026-01-01', 'ERP-982 test mapping', 'owner-user', 'owner-user', now())`,
    [organizationId],
  );
  await pool.query(
    `insert into financial_statement_mapping_lines (organization_id, mapping_id, mapping_version, line_number, statement, line_code, label, account_code, display_order, sign, vat_treatment, cash_flow_class)
     values ($1, 'map-tt133', 1, 1, 'balance_sheet', 'cash_and_bank', 'Cash on hand', '111-CASH', 1, 1, null, null),
            ($1, 'map-tt133', 1, 2, 'balance_sheet', 'cash_and_bank', 'Bank account', '112-BANK', 2, 1, null, null),
            ($1, 'map-tt133', 1, 3, 'balance_sheet', 'vat_receivable', 'Input VAT', '1331-VAT', 3, 1, null, null),
            ($1, 'map-tt133', 1, 4, 'balance_sheet', 'accounts_payable', 'Accounts payable', '331-AP', 4, 1, null, null),
            ($1, 'map-tt133', 1, 5, 'balance_sheet', 'owner_current', 'Owner current', '3388-OWNER', 5, 1, null, null),
            ($1, 'map-tt133', 1, 6, 'profit_and_loss', 'opex', 'Operating expense', '642-OPEX', 6, 1, null, null),
            ($1, 'map-tt133', 1, 7, 'vat_reconciliation', 'input_vat', 'Input VAT', '1331-VAT', 1, 1, 'input_eligible', null)`,
    [organizationId],
  );
  const ownerHash = createHash("sha256").update(ownerToken).digest("hex");
  const acctHash = createHash("sha256").update(accountantToken).digest("hex");
  await pool.query(
    `insert into api_credentials (organization_id, id, actor_id, token_hash, roles)
     values ($1, 'cred-owner', 'owner-user', $2, '["owner"]'),
            ($1, 'cred-acct', 'acct-user', $3, '["accountant","approver"]')`,
    [organizationId, ownerHash, acctHash],
  );
}

export function buildTestExpensePayload(params: {
  id: string;
  partyId?: string;
  date: string;
  netMinor: string;
  vatMinor: string;
  grossMinor: string;
  counterAccountCode?: string;
  paymentMethod?: string;
  paidOn?: string;
  paymentEvidenceRef?: string;
  transactionEvidence?: string;
  externalId: string;
}) {
  return {
    id: params.id,
    expenseClass: "invoice_backed",
    payeePartyId: params.partyId ?? "SUP-01",
    expenseDate: params.date,
    businessPurpose: `Expense ${params.id}`,
    currency: "VND",
    netMinor: params.netMinor,
    vatMinor: params.vatMinor,
    grossMinor: params.grossMinor,
    counterAccountCode: params.counterAccountCode ?? "111-CASH",
    ...(params.paymentMethod ? { paymentMethod: params.paymentMethod } : {}),
    ...(params.paidOn ? { paidOn: params.paidOn } : {}),
    ...(params.paymentEvidenceRef ? { paymentEvidenceRef: params.paymentEvidenceRef } : {}),
    ...(params.transactionEvidence ? { transactionEvidence: params.transactionEvidence } : {}),
    externalReference: { system: "paperless-ngx", externalId: params.externalId },
    lines: [
      {
        description: `Line ${params.id}`,
        netMinor: params.netMinor,
        vatMinor: params.vatMinor,
        grossMinor: params.grossMinor,
        postingAccountCode: "642-OPEX",
        vatAccountCode: "1331-VAT",
        allocations: [
          {
            id: `alloc-${params.id}`,
            amountMinor: params.netMinor,
            dimensions: { costCenter: "HQ" },
          },
        ],
      },
    ],
  };
}

export function buildTestPurchaseInvoicePayload(params: {
  id: string;
  documentNumber: string;
  partyId?: string;
  date: string;
  dueDate?: string;
  netMinor: string;
  taxMinor: string;
  grossMinor: string;
  controlAccountCode: string;
  funding?: Record<string, unknown>;
  fundingSource?: Record<string, unknown>;
  paymentMethod?: string;
  paidOn?: string;
  paymentEvidenceRef?: string;
  transactionEvidence?: string;
  externalId?: string;
}) {
  return {
    id: params.id,
    type: "purchase_invoice",
    documentNumber: params.documentNumber,
    fiscalYear: 2026,
    partyId: params.partyId ?? "SUP-01",
    documentDate: params.date,
    dueDate: params.dueDate ?? params.date,
    currency: "VND",
    netMinor: params.netMinor,
    taxMinor: params.taxMinor,
    grossMinor: params.grossMinor,
    controlAccountCode: params.controlAccountCode,
    ...(params.funding ? { funding: params.funding } : {}),
    ...(params.fundingSource ? { fundingSource: params.fundingSource } : {}),
    ...(params.paymentMethod ? { paymentMethod: params.paymentMethod } : {}),
    ...(params.paidOn ? { paidOn: params.paidOn } : {}),
    ...(params.paymentEvidenceRef ? { paymentEvidenceRef: params.paymentEvidenceRef } : {}),
    ...(params.transactionEvidence ? { transactionEvidence: params.transactionEvidence } : {}),
    ...(params.externalId
      ? { externalReference: { system: "paperless-ngx", externalId: params.externalId } }
      : {}),
    lines: [
      {
        description: `Invoice line ${params.id}`,
        quantity: "1",
        unitPriceMinor: params.netMinor,
        netMinor: params.netMinor,
        taxMinor: params.taxMinor,
        grossMinor: params.grossMinor,
        primaryAccountCode: "642-OPEX",
        taxAccountCode: "1331-VAT",
        taxCode: "VAT10_IN",
        allocations: [
          {
            id: `alloc-${params.id}`,
            amountMinor: params.netMinor,
            dimensions: { costCenter: "IT" },
          },
        ],
      },
    ],
  };
}
