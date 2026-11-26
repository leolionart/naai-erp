-- ERP-980 (BR-FUND-007): Separate owner-held company cash into 111-OWNER-CUSTODY
-- under 111, and support 1388 / 1388-OWNER owner receivable for personal spending
-- paid from company funds (excluded from P&L, VAT, and CIT).

INSERT INTO accounts (organization_id, code, name, root_type, is_control_account, allow_manual_posting, is_active)
SELECT o.id, v.code, v.name, v.root_type::account_root_type, false, true, true
FROM organizations o
CROSS JOIN (VALUES
  ('111', 'Tiền mặt', 'asset'),
  ('111-CASH', 'Quỹ tiền mặt công ty', 'asset'),
  ('111-OWNER-CUSTODY', 'Quỹ tiền mặt do chủ giữ', 'asset'),
  ('1388', 'Phải thu khác', 'asset'),
  ('1388-OWNER', 'Phải thu chủ sở hữu', 'asset')
) AS v(code, name, root_type)
ON CONFLICT (organization_id, code) DO NOTHING;--> statement-breakpoint

INSERT INTO account_hierarchy_edges (organization_id, child_code, child_root_type, parent_code, parent_root_type)
SELECT c.organization_id, c.code, 'asset'::account_root_type, p.code, 'asset'::account_root_type
FROM accounts c
JOIN accounts p
  ON p.organization_id = c.organization_id
 AND p.root_type = 'asset'
 AND c.root_type = 'asset'
WHERE (c.code = '111-OWNER-CUSTODY' AND p.code = '111')
   OR (c.code = '111-CASH' AND p.code = '111')
   OR (c.code = '1388-OWNER' AND p.code = '1388')
ON CONFLICT (organization_id, child_code) DO NOTHING;--> statement-breakpoint

UPDATE financial_accounts fa
SET ledger_account_code = '111-OWNER-CUSTODY',
    updated_at = now()
WHERE fa.code = 'CASH-OWNER-CUSTODY'
  AND fa.ledger_account_code <> '111-OWNER-CUSTODY'
  AND EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.organization_id = fa.organization_id
      AND a.code = '111-OWNER-CUSTODY'
      AND a.root_type = 'asset'
  );--> statement-breakpoint

UPDATE financial_accounts fa
SET ledger_account_code = '111-CASH',
    updated_at = now()
WHERE fa.code = 'CASH-COMPANY'
  AND fa.ledger_account_code <> '111-CASH'
  AND EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.organization_id = fa.organization_id
      AND a.code = '111-CASH'
      AND a.root_type = 'asset'
  );--> statement-breakpoint

DO $$
DECLARE
  mv record;
  next_line integer;
BEGIN
  FOR mv IN
    SELECT organization_id, id, version
    FROM financial_statement_mapping_versions
    WHERE EXISTS (
      SELECT 1 FROM financial_statement_mapping_lines l
      WHERE l.organization_id = financial_statement_mapping_versions.organization_id
        AND l.mapping_id = financial_statement_mapping_versions.id
        AND l.mapping_version = financial_statement_mapping_versions.version
        AND l.statement = 'balance_sheet'
    )
  LOOP
    SELECT coalesce(max(line_number), 0) + 1 INTO next_line
    FROM financial_statement_mapping_lines
    WHERE organization_id = mv.organization_id AND mapping_id = mv.id AND mapping_version = mv.version;

    IF EXISTS (SELECT 1 FROM accounts WHERE organization_id = mv.organization_id AND code = '111-OWNER-CUSTODY')
       AND NOT EXISTS (
         SELECT 1 FROM financial_statement_mapping_lines
         WHERE organization_id = mv.organization_id AND mapping_id = mv.id AND mapping_version = mv.version
           AND statement = 'balance_sheet' AND account_code = '111-OWNER-CUSTODY'
       ) THEN
      INSERT INTO financial_statement_mapping_lines
        (organization_id, mapping_id, mapping_version, line_number, statement, line_code, label, account_code, display_order, sign)
      VALUES
        (mv.organization_id, mv.id, mv.version, next_line, 'balance_sheet', 'cash', 'Quỹ tiền mặt do chủ giữ', '111-OWNER-CUSTODY', 12, 1)
      ON CONFLICT DO NOTHING;
      next_line := next_line + 1;
    END IF;

    IF EXISTS (SELECT 1 FROM accounts WHERE organization_id = mv.organization_id AND code = '1388')
       AND NOT EXISTS (
         SELECT 1 FROM financial_statement_mapping_lines
         WHERE organization_id = mv.organization_id AND mapping_id = mv.id AND mapping_version = mv.version
           AND statement = 'balance_sheet' AND account_code = '1388'
       ) THEN
      INSERT INTO financial_statement_mapping_lines
        (organization_id, mapping_id, mapping_version, line_number, statement, line_code, label, account_code, display_order, sign)
      VALUES
        (mv.organization_id, mv.id, mv.version, next_line, 'balance_sheet', 'owner_receivable', 'Phải thu chủ sở hữu', '1388', 25, 1)
      ON CONFLICT DO NOTHING;
      next_line := next_line + 1;
    END IF;

    IF EXISTS (SELECT 1 FROM accounts WHERE organization_id = mv.organization_id AND code = '1388-OWNER')
       AND NOT EXISTS (
         SELECT 1 FROM financial_statement_mapping_lines
         WHERE organization_id = mv.organization_id AND mapping_id = mv.id AND mapping_version = mv.version
           AND statement = 'balance_sheet' AND account_code = '1388-OWNER'
       ) THEN
      INSERT INTO financial_statement_mapping_lines
        (organization_id, mapping_id, mapping_version, line_number, statement, line_code, label, account_code, display_order, sign)
      VALUES
        (mv.organization_id, mv.id, mv.version, next_line, 'balance_sheet', 'owner_receivable', 'Phải thu chủ sở hữu', '1388-OWNER', 26, 1)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;
