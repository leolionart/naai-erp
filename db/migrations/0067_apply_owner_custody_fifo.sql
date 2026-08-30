-- One-time development/production correction authorized for the imported
-- dataset. Allocates owner-paid expenses FIFO against reconciled custody
-- inflows. Existing explicit funding links are preserved.
DO $$
DECLARE
  org_row record;
  movement record;
  custody_account text;
  custody_balance bigint;
BEGIN
  FOR org_row IN
    SELECT DISTINCT organization_id FROM financial_accounts WHERE code='CASH-OWNER-CUSTODY'
  LOOP
    SELECT id INTO custody_account FROM financial_accounts
     WHERE organization_id=org_row.organization_id AND code='CASH-OWNER-CUSTODY' LIMIT 1;
    custody_balance := 0;
    FOR movement IN
      SELECT bt.booking_date movement_date, 1 priority, it.transfer_amount_minor amount, NULL::text expense_id
        FROM internal_transfers it
        JOIN internal_transfer_attempts ita ON ita.organization_id=it.organization_id AND ita.transfer_id=it.id AND ita.state='reconciled'
        JOIN bank_transactions bt ON bt.organization_id=ita.organization_id AND bt.id=ita.incoming_transaction_id
        JOIN financial_accounts fa ON fa.organization_id=bt.organization_id AND fa.id=bt.financial_account_id AND fa.code='CASH-OWNER-CUSTODY'
       WHERE it.organization_id=org_row.organization_id
      UNION ALL
      SELECT e.expense_date, 2, -sum(e.gross_minor), e.id
        FROM expenses e
        JOIN expense_lines el ON el.organization_id=e.organization_id AND el.expense_id=e.id
       WHERE e.organization_id=org_row.organization_id AND e.state='posted'
         AND e.funding_financial_account_id IS NULL AND el.funding_treatment='owner_paid_company_cost'
       GROUP BY e.expense_date,e.id
       ORDER BY movement_date,priority,expense_id
    LOOP
      IF movement.expense_id IS NULL THEN
        custody_balance := custody_balance + movement.amount;
      ELSIF custody_balance >= -movement.amount THEN
        UPDATE expenses SET funding_financial_account_id=custody_account
         WHERE organization_id=org_row.organization_id AND id=movement.expense_id AND funding_financial_account_id IS NULL;
        custody_balance := custody_balance + movement.amount;
      END IF;
    END LOOP;
  END LOOP;
END $$;
