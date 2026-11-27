import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  executeOwnerDebtWriteOff,
  executeSalesInvoiceBadDebtWriteOff,
} from "./debt-write-off.helper.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-1001 debt write-off PostgreSQL integration", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const orgId = `org-dwo-${randomUUID().slice(0, 8)}`;
  const docId = `doc-dwo-${randomUUID().slice(0, 8)}`;
  const partyId = `party-dwo-${randomUUID().slice(0, 8)}`;
  const context = {
    organizationId: orgId,
    actorId: "owner-dwo",
    roles: ["owner"],
    correlationId: "corr-dwo-1",
  };

  beforeAll(async () => {
    await pool.query(
      `insert into organizations (id, legal_name, base_currency, timezone)
       values ($1, 'Debt Write-off Test Org', 'VND', 'Asia/Ho_Chi_Minh')`,
      [orgId],
    );
    await pool.query(
      `insert into fiscal_years (organization_id, year, starts_on, ends_on)
       values ($1, 2026, '2026-01-01', '2026-12-31')`,
      [orgId],
    );
    await pool.query(
      `insert into fiscal_periods (organization_id, fiscal_year, period_number, starts_on, ends_on, state)
       values ($1, 2026, 11, '2026-11-01', '2026-11-30', 'open')`,
      [orgId],
    );
    await pool.query(
      `insert into accounts (organization_id, code, name, root_type, is_active) values
       ($1, '3388-OWNER', 'Owner Current', 'liability', true),
       ($1, '411-CAPITAL', 'Contributed Capital', 'equity', true),
       ($1, '131-AR', 'Accounts Receivable', 'asset', true),
       ($1, '642-OPEX', 'Operating Expense', 'expense', true)`,
      [orgId],
    );
    await pool.query(
      `insert into financial_statement_mapping_versions
       (organization_id, id, version, framework, state, effective_from, change_reason, approved_at, approved_by, created_by)
       values ($1, 'map-tt133', 1, 'TT133', 'approved', '2026-01-01', 'seed', now(), 'owner-dwo', 'owner-dwo')`,
      [orgId],
    );
    await pool.query(
      `insert into financial_statement_mapping_lines
       (organization_id, mapping_id, mapping_version, line_number, statement, line_code, label, account_code, display_order)
       values ($1, 'map-tt133', 1, 1, 'balance_sheet', 'owner_current', 'Owner Current', '3388-OWNER', 1)`,
      [orgId],
    );
    const seedJournalId = randomUUID();
    await pool.query(
      `insert into journal_entries
       (organization_id, id, journal_date, description, currency, state, version, created_by, approved_at, approved_by, approval_reason, posted_at, posted_by)
       values ($1, $2, '2026-11-01', 'Seed owner liability', 'VND', 'posted', 2, 'owner-dwo', now(), 'owner-dwo', 'seed', now(), 'owner-dwo')`,
      [orgId, seedJournalId],
    );
    await pool.query(
      `insert into journal_lines
       (organization_id, journal_id, line_number, account_code, debit_minor, credit_minor, description)
       values ($1, $2, 1, '411-CAPITAL', 5000000, null, 'Seed'),
              ($1, $2, 2, '3388-OWNER', null, 5000000, 'Seed')`,
      [orgId, seedJournalId],
    );
    await pool.query(
      `insert into parties (organization_id, id, display_name, legal_name)
       values ($1, $2, 'Customer DWO', 'Customer DWO')`,
      [orgId, partyId],
    );
    await pool.query(
      `insert into commercial_documents
       (organization_id, id, type, state, party_id, series, document_number, document_date, due_date, fiscal_year, currency, net_minor, tax_minor, gross_minor, control_account_code, version, created_by)
       values ($1, $2, 'sales_invoice', 'issued', $3, 'NAAI', 'INV-DWO-001', '2026-11-10', '2026-11-20', 2026, 'VND', 2000000, 0, 2000000, '131-AR', 1, 'owner-dwo')`,
      [orgId, docId, partyId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("writes off owner debt and records resource_audit_events and outbox_events", async () => {
    const res = await executeOwnerDebtWriteOff(
      pool,
      context,
      {
        schemaVersion: 1,
        bookingDate: "2026-11-27",
        amountMinor: "5000000",
        currency: "VND",
        description: "Chủ xóa nợ chi hộ",
        reason: "Miễn nợ chuyển vốn góp",
      },
      `idem-owner-${randomUUID()}`,
    );
    expect(res).toMatchObject({
      ownerAccountCode: "3388-OWNER",
      equityAccountCode: "411-CAPITAL",
      amountMinor: "5000000",
      state: "posted",
      idempotencyReplayed: false,
    });
    const audit = await pool.query(
      `select resource_type, action from resource_audit_events where organization_id=$1 and id=$2`,
      [orgId, (res as { auditEventId: string }).auditEventId],
    );
    expect(audit.rows).toEqual([{ resource_type: "owner_debt_write_off", action: "create" }]);
  });

  it("writes off customer bad debt on an issued sales_invoice and marks it paid", async () => {
    const res = await executeSalesInvoiceBadDebtWriteOff(
      pool,
      context,
      docId,
      {
        writeOffDate: "2026-11-27",
        amountMinor: "2000000",
        reason: "Khách hàng ngừng hoạt động",
      },
      `idem-ar-${randomUUID()}`,
    );
    expect(res).toMatchObject({
      documentId: docId,
      documentState: "paid",
      amountMinor: "2000000",
      remainingOutstandingMinor: "0",
      idempotencyReplayed: false,
    });
    const audit = await pool.query(
      `select resource_type, action from resource_audit_events where organization_id=$1 and id=$2`,
      [orgId, (res as { auditEventId: string }).auditEventId],
    );
    expect(audit.rows).toEqual([
      { resource_type: "commercial_document", action: "write_off_bad_debt" },
    ]);
  });
});
