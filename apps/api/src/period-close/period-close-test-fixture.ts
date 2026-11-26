import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import {
  applyMigration0076,
  authHeaders,
  seedOwnerCustodyBaseOrg,
} from "../funding-plans/owner-custody-test-fixture.js";

export { authHeaders };

export async function seedPeriodCloseTestOrg(
  pool: Pool,
  org: string,
  ownerToken: string,
): Promise<void> {
  await seedOwnerCustodyBaseOrg(pool, org, ownerToken);
  await applyMigration0076(pool, org);

  await pool.query(
    `insert into fiscal_periods(organization_id, fiscal_year, period_number, starts_on, ends_on)
     values ($1, 2026, 12, '2026-12-01', '2026-12-31')
     on conflict (organization_id, fiscal_year, period_number) do nothing`,
    [org],
  );

  await pool.query(
    `insert into accounts(organization_id, code, name, root_type, is_control_account, allow_manual_posting, is_active)
     values
       ($1, '331', 'Phai tra nha cung cap', 'liability', true, false, true),
       ($1, '421-RE', 'Loi nhuan chua phan phoi', 'equity', false, true, true),
       ($1, '711-CASH-OVER', 'Thu nhap khac - Thua quy kiem ke', 'revenue', false, true, true),
       ($1, '811-CASH-SHORT', 'Chi phi khac - Thieu quy kiem ke', 'expense', false, true, true)
     on conflict (organization_id, code) do nothing`,
    [org],
  );

  await pool.query(
    `insert into financial_statement_mapping_lines
       (organization_id, mapping_id, mapping_version, line_number, statement, line_code, label, account_code, display_order, sign)
     values
       ($1, 'map-tt133', 1, 30, 'balance_sheet', 'retained_earnings', 'Loi nhuan giu lai', '421-RE', 90, 1),
       ($1, 'map-tt133', 1, 31, 'profit_and_loss', 'other_income', 'Thu nhap khac - Thua quy', '711-CASH-OVER', 45, 1),
       ($1, 'map-tt133', 1, 32, 'profit_and_loss', 'other_expense', 'Chi phi khac - Thieu quy', '811-CASH-SHORT', 55, 1)
     on conflict do nothing`,
    [org],
  );

  const sql0078 = await readFile(
    new URL(
      "../../../../db/migrations/0078_period_close_cash_count_and_owner_settlement.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const stmt of sql0078.split("--> statement-breakpoint")) {
    if (stmt.trim()) await pool.query(stmt);
  }

  const viewerHash = createHash("sha256").update(`viewer-${ownerToken}`).digest("hex");
  await pool.query(
    `insert into api_credentials(organization_id, id, actor_id, token_hash, roles)
     values ($1, 'cred-viewer', 'viewer-1', $2, '["viewer"]')
     on conflict (organization_id, id) do nothing`,
    [org, viewerHash],
  );
}
