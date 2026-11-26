import { createHash } from "node:crypto";
import type pg from "pg";

export function authHeaders(token: string, idempotencyKey?: string, ifMatch?: string) {
  return {
    authorization: `Bearer ${token}`,
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    ...(ifMatch ? { "if-match": ifMatch } : {}),
  };
}

export async function seedDraftRecordingTestOrg(
  pool: pg.Pool,
  organizationId: string,
  tokens: { owner: string; integration: string; accountant: string },
) {
  await pool.query(
    `insert into organizations (id, legal_name, base_currency, timezone)
     values ($1, 'ERP-989 Solopreneur Co', 'VND', 'Asia/Ho_Chi_Minh')`,
    [organizationId],
  );
  await pool.query(
    `insert into accounting_workflow_policies
       (organization_id, operating_mode, allow_self_approval, self_approval_max_minor, non_cash_threshold_minor, updated_by)
     values ($1, 'solopreneur', false, null, 5000000, 'owner-user')`,
    [organizationId],
  );
  await pool.query(
    `insert into fiscal_years (organization_id, year, starts_on, ends_on)
     values ($1, 2026, '2026-01-01', '2026-12-31')`,
    [organizationId],
  );
  await pool.query(
    `insert into fiscal_periods (organization_id, fiscal_year, period_number, starts_on, ends_on, state)
     values ($1, 2026, 7, '2026-07-01', '2026-07-31', 'hard_locked'),
            ($1, 2026, 8, '2026-08-01', '2026-08-31', 'open')`,
    [organizationId],
  );
  await pool.query(
    `insert into accounts (organization_id, code, name, root_type, is_control_account, allow_manual_posting, is_active)
     values ($1, '111-CASH', 'Cash on hand', 'asset', false, true, true),
            ($1, '112-BANK', 'Bank account', 'asset', false, true, true),
            ($1, '131-AR', 'Accounts receivable', 'asset', true, false, true),
            ($1, '1331-VAT', 'Deductible input VAT', 'asset', true, false, true),
            ($1, '331-AP', 'Accounts payable', 'liability', true, false, true),
            ($1, '3331-VAT-OUT', 'Output VAT', 'liability', true, false, true),
            ($1, '3388-OWNER', 'Owner current payable', 'liability', false, true, true),
            ($1, '3389-INACTIVE', 'Inactive counter', 'liability', false, true, false),
            ($1, '511-REV', 'Service revenue', 'revenue', false, true, true),
            ($1, '642-OPEX', 'Operating expense', 'expense', false, true, true)`,
    [organizationId],
  );
  await pool.query(
    `insert into financial_accounts
       (organization_id, id, code, kind, display_name, currency, ledger_account_code, bank_code, created_by, updated_by)
     values ($1, 'FA-BANK', 'BANK-MAIN', 'bank', 'Company Bank', 'VND', '112-BANK', 'VCB', 'owner-user', 'owner-user'),
            ($1, 'FA-CASH', 'CASH-COMPANY', 'cash', 'Company Cash', 'VND', '111-CASH', null, 'owner-user', 'owner-user')`,
    [organizationId],
  );
  await pool.query(
    `insert into users (id, email, display_name)
     values ($1, $2, 'Owner User')
     on conflict (id) do nothing`,
    [`owner-${organizationId}`, `owner-${organizationId}@example.com`],
  );
  await pool.query(
    `insert into organization_memberships (organization_id, user_id)
     values ($1, $2)`,
    [organizationId, `owner-${organizationId}`],
  );
  await pool.query(
    `insert into membership_roles (organization_id, user_id, role)
     values ($1, $2, 'owner')`,
    [organizationId, `owner-${organizationId}`],
  );
  await pool.query(
    `insert into parties (organization_id, id, display_name, status)
     values ($1, 'SUP-01', 'Supplier One', 'active'),
            ($1, 'CLI-01', 'Client One', 'active')`,
    [organizationId],
  );
  await pool.query(
    `insert into party_roles (organization_id, party_id, role)
     values ($1, 'SUP-01', 'supplier'),
            ($1, 'CLI-01', 'client')`,
    [organizationId],
  );
  await pool.query(
    `insert into projects
       (organization_id, id, code, name, client_party_id, owner_user_id, contract_type, currency, budget_minor, starts_on, state)
     values ($1, 'PRJ-01', 'PRJ-01', 'Project Alpha', 'CLI-01', $2, 'fixed_fee', 'VND', 200000000, '2026-01-01', 'active')`,
    [organizationId, `owner-${organizationId}`],
  );
  await pool.query(
    `insert into contracts (organization_id, id, project_id, reference, signed_on, value_minor, currency)
     values ($1, 'CON-01', 'PRJ-01', 'CON-2026-01', '2026-01-01', 200000000, 'VND')`,
    [organizationId],
  );
  await pool.query(
    `insert into business_categories (organization_id, kind, code, name, account_code, is_active)
     values ($1, 'expense', 'OFFICE', 'Văn phòng', '642-OPEX', true),
            ($1, 'revenue', 'SERVICE', 'Dịch vụ', '511-REV', true)
     on conflict do nothing`,
    [organizationId],
  );
  await pool.query(
    `insert into expense_categories (organization_id, code, name, funding_treatment, created_by, updated_by)
     values ($1, 'OFFICE', 'Văn phòng', 'owner_paid_company_cost', 'owner-user', 'owner-user')`,
    [organizationId],
  );
  await pool.query(
    `insert into tax_code_versions
       (organization_id, code, effective_from, name, kind, rate, review_state, reviewed_by, reviewed_at, review_reason)
     values ($1, 'VAT10_IN', '2026-01-01', 'Input VAT 10%', 'vat_input', 0.10, 'accountant_approved', 'acct-user', now(), 'Approved'),
            ($1, 'VAT10_OUT', '2026-01-01', 'Output VAT 10%', 'vat_output', 0.10, 'accountant_approved', 'acct-user', now(), 'Approved')`,
    [organizationId],
  );
  await pool.query(
    `insert into financial_statement_mapping_versions
       (organization_id, id, version, framework, state, effective_from, change_reason, created_by, approved_by, approved_at)
     values ($1, 'map-tt133', 1, 'TT133', 'approved', '2026-01-01', 'Seed TT133', 'owner-user', 'owner-user', now())`,
    [organizationId],
  );
  await pool.query(
    `insert into financial_statement_mapping_lines
       (organization_id, mapping_id, mapping_version, line_number, statement, line_code, label, account_code, display_order, sign)
     values ($1, 'map-tt133', 1, 1, 'balance_sheet', 'owner_current', 'Owner current', '3388-OWNER', 1, 1)`,
    [organizationId],
  );

  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  await pool.query(
    `insert into api_credentials (organization_id, id, actor_id, token_hash, roles)
     values ($1, 'cred-owner', 'owner-user', $2, '["owner"]'),
            ($1, 'cred-int', 'n8n-bot', $3, '["integration"]'),
            ($1, 'cred-acct', 'acct-user', $4, '["accountant","approver"]')`,
    [organizationId, hash(tokens.owner), hash(tokens.integration), hash(tokens.accountant)],
  );
}

export function buildDraftExpenseInput(params: {
  id: string;
  date: string;
  netMinor: string;
  vatMinor: string;
  grossMinor: string;
  counterAccountCode?: string;
  expenseClass?: string;
  paymentMethod?: string;
  paidOn?: string;
  paymentEvidenceRef?: string;
  withExternalReference?: boolean;
}) {
  return {
    id: params.id,
    expenseClass: params.expenseClass ?? "invoice_backed",
    payeePartyId: "SUP-01",
    expenseDate: params.date,
    businessPurpose: `Draft expense ${params.id}`,
    currency: "VND",
    netMinor: params.netMinor,
    vatMinor: params.vatMinor,
    grossMinor: params.grossMinor,
    counterAccountCode: params.counterAccountCode ?? "3388-OWNER",
    ...(params.paymentMethod ? { paymentMethod: params.paymentMethod } : {}),
    ...(params.paidOn ? { paidOn: params.paidOn } : {}),
    ...(params.paymentEvidenceRef ? { paymentEvidenceRef: params.paymentEvidenceRef } : {}),
    ...(params.withExternalReference !== false
      ? { externalReference: { system: "paperless-ngx", externalId: `ext-${params.id}` } }
      : {}),
    lines: [
      {
        description: `Line ${params.id}`,
        netMinor: params.netMinor,
        vatMinor: params.vatMinor,
        grossMinor: params.grossMinor,
        postingAccountCode: "642-OPEX",
        expenseCategoryCode: "OFFICE",
        ...(BigInt(params.vatMinor) > 0n ? { vatAccountCode: "1331-VAT" } : {}),
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

export function buildDraftPurchaseDocumentInput(params: {
  id: string;
  documentNumber: string;
  date: string;
  netMinor: string;
  taxMinor: string;
  grossMinor: string;
  controlAccountCode?: string;
  fundingAccountId?: string;
}) {
  return {
    id: params.id,
    type: "purchase_invoice",
    documentNumber: params.documentNumber,
    fiscalYear: 2026,
    partyId: "SUP-01",
    documentDate: params.date,
    dueDate: params.date,
    currency: "VND",
    netMinor: params.netMinor,
    taxMinor: params.taxMinor,
    grossMinor: params.grossMinor,
    controlAccountCode: params.controlAccountCode ?? "331-AP",
    ...(params.fundingAccountId
      ? {
          fundingSource: { type: "financial_account", financialAccountId: params.fundingAccountId },
        }
      : {}),
    externalReference: { system: "paperless-ngx", externalId: `ext-${params.id}` },
    lines: [
      {
        description: `Purchase line ${params.id}`,
        quantity: "1",
        unitPriceMinor: params.netMinor,
        netMinor: params.netMinor,
        taxMinor: params.taxMinor,
        grossMinor: params.grossMinor,
        primaryAccountCode: "642-OPEX",
        categoryCode: "OFFICE",
        ...(BigInt(params.taxMinor) > 0n
          ? { taxAccountCode: "1331-VAT", taxCode: "VAT10_IN" }
          : {}),
        allocations: [
          {
            id: `alloc-${params.id}`,
            amountMinor: params.netMinor,
            dimensions: { projectId: "PRJ-01" },
          },
        ],
      },
    ],
  };
}

export function buildDraftSalesDocumentInput(params: {
  id: string;
  documentNumber: string;
  date: string;
  netMinor: string;
  taxMinor: string;
  grossMinor: string;
}) {
  return {
    id: params.id,
    type: "sales_invoice",
    documentNumber: params.documentNumber,
    series: "AA",
    fiscalYear: 2026,
    partyId: "CLI-01",
    documentDate: params.date,
    dueDate: params.date,
    currency: "VND",
    netMinor: params.netMinor,
    taxMinor: params.taxMinor,
    grossMinor: params.grossMinor,
    controlAccountCode: "131-AR",
    lines: [
      {
        description: `Sales line ${params.id}`,
        quantity: "1",
        unitPriceMinor: params.netMinor,
        netMinor: params.netMinor,
        taxMinor: params.taxMinor,
        grossMinor: params.grossMinor,
        primaryAccountCode: "511-REV",
        categoryCode: "SERVICE",
        taxAccountCode: "3331-VAT-OUT",
        taxCode: "VAT10_OUT",
        allocations: [
          {
            id: `alloc-${params.id}`,
            amountMinor: params.netMinor,
            dimensions: { projectId: "PRJ-01" },
          },
        ],
      },
    ],
  };
}
