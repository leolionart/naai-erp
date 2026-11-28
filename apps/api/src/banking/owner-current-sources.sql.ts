export const OWNER_CURRENT_MOVEMENTS_SQL = `with selected_mapping as (
   select id,version
   from financial_statement_mapping_versions
   where organization_id=$1 and framework='TT133'
     and (state='approved' or exists(select 1 from accounting_workflow_policies w where w.organization_id=$1 and w.operating_mode='solopreneur'))
   order by (state='approved') desc,effective_from desc,version desc limit 1
 ), owner_accounts as (
   select distinct ml.account_code
   from selected_mapping sm
   join financial_statement_mapping_lines ml
     on ml.organization_id=$1 and ml.mapping_id=sm.id and ml.mapping_version=sm.version
   where ml.statement='balance_sheet' and ml.line_code='owner_current'
 ), company_funds_accounts as (
   select distinct ledger_account_code account_code
   from financial_accounts
   where organization_id=$1 and kind in ('bank','cash')
 )
 select j.id journal_id,j.journal_date::text,j.description,j.currency,j.state,j.reversal_of_id,
   coalesce(movement_evidence.custody_transfer_amounts,array[]::text[]) custody_transfer_amounts,
   coalesce(movement_evidence.custody_transfer_ids,array[]::text[]) custody_transfer_ids,
   movement_evidence.personal_withdrawal_minor,
   movement_evidence.personal_withdrawal_id,
   movement_evidence.owner_funding_movement_type,
   movement_evidence.owner_funding_amount_minor,
   movement_evidence.owner_funding_tx_id,
   movement_evidence.owner_funding_reference,
   coalesce(source_refs.sources,'[]'::jsonb) sources,
   sum(case when l.account_code in (select account_code from owner_accounts)
     then coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0) else 0 end)::text owner_delta_minor,
   sum(case when l.account_code in (select account_code from company_funds_accounts)
     then coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0) else 0 end)::text company_funds_delta_minor,
   array_agg(distinct l.account_code) filter (
     where l.account_code in (select account_code from owner_accounts)
   ) owner_account_codes,
   jsonb_agg(jsonb_build_object(
     'accountCode',l.account_code,'accountName',a.name,
     'debitMinor',coalesce(l.debit_minor,0)::text,
     'creditMinor',coalesce(l.credit_minor,0)::text,
     'description',coalesce(l.description,'')
   ) order by l.line_number) filter (
     where l.account_code not in (select account_code from owner_accounts)
   ) counterpart_lines
 from journal_entries j
 join journal_lines l on l.organization_id=j.organization_id and l.journal_id=j.id
 join accounts a on a.organization_id=l.organization_id and a.code=l.account_code
 left join lateral (
   select coalesce(jsonb_agg(source order by source->>'sourceType',source->>'sourceId'),'[]'::jsonb) sources
   from (
     select jsonb_build_object(
       'sourceType','expense','sourceId',e.id,'title',e.business_purpose,
       'detail',(select string_agg(el.description,' · ' order by el.line_number)
         from expense_lines el where el.organization_id=e.organization_id and el.expense_id=e.id),
       'grossMinor',e.gross_minor::text,'sourceHref','/expenses/' || e.id,
       'expenseClass',e.expense_class::text,
       'category',(select coalesce(el.expense_category_code,el.dimensions->>'category')
         from expense_lines el where el.organization_id=e.organization_id and el.expense_id=e.id
         order by el.line_number limit 1),
       'fundingTreatments',(select coalesce(jsonb_agg(distinct
           coalesce(el.funding_treatment,ec.funding_treatment))
         filter (where coalesce(el.funding_treatment,ec.funding_treatment) is not null),'[]'::jsonb)
         from expense_lines el
         left join expense_categories ec
           on ec.organization_id=el.organization_id
          and ec.code=coalesce(el.expense_category_code,el.dimensions->>'category')
         where el.organization_id=e.organization_id and el.expense_id=e.id),
       'fundingFinancialAccountCode',(select fa.code from financial_accounts fa where fa.organization_id=e.organization_id and fa.id=e.funding_financial_account_id),
       'citState',e.cit_state::text,'vatState',e.vat_state::text,
       'payeeName',p.display_name
     ) source
     from expenses e
     left join parties p on p.organization_id=e.organization_id and p.id=e.payee_party_id
     where e.organization_id=j.organization_id
       and e.journal_id=coalesce(j.reversal_of_id,j.id)
     union all
     select jsonb_build_object(
       'sourceType','purchase_invoice','sourceId',d.id,'title',d.document_number,
       'detail',(select string_agg(dl.description,' · ' order by dl.line_number)
         from commercial_document_lines dl
         where dl.organization_id=d.organization_id and dl.document_id=d.id),
       'grossMinor',d.gross_minor::text,'sourceHref','/documents/' || d.id,
       'expenseClass',null,
       'category',(select coalesce(dl.category_code,dl.dimensions->>'category')
         from commercial_document_lines dl
         where dl.organization_id=d.organization_id and dl.document_id=d.id
         order by dl.line_number limit 1),
       'fundingTreatments',(select coalesce(jsonb_agg(distinct ec.funding_treatment)
         filter (where ec.funding_treatment is not null),'[]'::jsonb)
         from commercial_document_lines dl
         left join expense_categories ec
           on ec.organization_id=dl.organization_id
          and ec.code=coalesce(dl.category_code,dl.dimensions->>'category')
          and ec.is_active=true
         where dl.organization_id=d.organization_id and dl.document_id=d.id),
       'fundingFinancialAccountCode',(select fa.code from financial_accounts fa where fa.organization_id=d.organization_id and fa.id=d.funding_financial_account_id),
       'citState',(select min(dl.cit_state::text) from commercial_document_lines dl
         where dl.organization_id=d.organization_id and dl.document_id=d.id),
       'vatState',(select min(dl.vat_state::text) from commercial_document_lines dl
         where dl.organization_id=d.organization_id and dl.document_id=d.id),
       'payeeName',p.display_name
     ) source
     from commercial_documents d
     left join parties p on p.organization_id=d.organization_id and p.id=d.party_id
     where d.organization_id=j.organization_id and d.type='purchase_invoice'
       and d.journal_id=coalesce(j.reversal_of_id,j.id)
   ) canonical_sources
 ) source_refs on true
 left join lateral (
   select
     (select coalesce(array_agg(distinct it.transfer_amount_minor::text),array[]::text[])
        from internal_transfers it
        join internal_transfer_attempts ita
          on ita.organization_id=it.organization_id and ita.transfer_id=it.id
         and ita.attempt_number=it.current_attempt_number and ita.state='reconciled'
        join bank_transactions outgoing
          on outgoing.organization_id=ita.organization_id and outgoing.id=ita.outgoing_transaction_id
        join bank_transactions incoming
          on incoming.organization_id=ita.organization_id and incoming.id=ita.incoming_transaction_id
        join financial_accounts incoming_account
          on incoming_account.organization_id=incoming.organization_id
         and incoming_account.id=incoming.financial_account_id
       where it.organization_id=j.organization_id
         and incoming_account.code='CASH-OWNER-CUSTODY'
         and outgoing.booking_date=j.journal_date
     ) custody_transfer_amounts,
     (select coalesce(array_agg(distinct it.id order by it.id),array[]::text[])
        from internal_transfers it
        join internal_transfer_attempts ita
          on ita.organization_id=it.organization_id and ita.transfer_id=it.id
         and ita.attempt_number=it.current_attempt_number and ita.state='reconciled'
        join bank_transactions outgoing
          on outgoing.organization_id=ita.organization_id and outgoing.id=ita.outgoing_transaction_id
        join bank_transactions incoming
          on incoming.organization_id=ita.organization_id and incoming.id=ita.incoming_transaction_id
        join financial_accounts incoming_account
          on incoming_account.organization_id=incoming.organization_id
         and incoming_account.id=incoming.financial_account_id
       where it.organization_id=j.organization_id
         and incoming_account.code='CASH-OWNER-CUSTODY'
         and outgoing.booking_date=j.journal_date
     ) custody_transfer_ids,
     (select (-bt.amount_minor)::text
        from owner_cash_withdrawals ocw
        join bank_transactions bt
          on bt.organization_id=ocw.organization_id and bt.id=ocw.bank_transaction_id
        join financial_accounts fa
          on fa.organization_id=bt.organization_id and fa.id=bt.financial_account_id
       where ocw.organization_id=j.organization_id and ocw.journal_id=j.id
         and ocw.movement_type='owner_personal_withdrawal'
         and bt.amount_minor<0 and fa.kind in ('bank','cash')
       limit 1) personal_withdrawal_minor,
     (select ocw.bank_transaction_id
        from owner_cash_withdrawals ocw
       where ocw.organization_id=j.organization_id and ocw.journal_id=j.id
         and ocw.movement_type='owner_personal_withdrawal'
       limit 1) personal_withdrawal_id,
     (select ofm.movement_type
        from owner_funding_movements ofm
       where ofm.organization_id=j.organization_id
         and ofm.journal_id=coalesce(j.reversal_of_id,j.id)
       limit 1) owner_funding_movement_type,
     (select ofm.amount_minor::text
        from owner_funding_movements ofm
       where ofm.organization_id=j.organization_id
         and ofm.journal_id=coalesce(j.reversal_of_id,j.id)
       limit 1) owner_funding_amount_minor,
     (select ofm.bank_transaction_id
        from owner_funding_movements ofm
       where ofm.organization_id=j.organization_id
         and ofm.journal_id=coalesce(j.reversal_of_id,j.id)
       limit 1) owner_funding_tx_id,
     (select ofm.reference
        from owner_funding_movements ofm
       where ofm.organization_id=j.organization_id
         and ofm.journal_id=coalesce(j.reversal_of_id,j.id)
       limit 1) owner_funding_reference
 ) movement_evidence on true
 where j.organization_id=$1 and j.state in ('posted','reversed')
 group by j.id,j.journal_date,j.description,j.currency,j.state,j.reversal_of_id,
   source_refs.sources,movement_evidence.custody_transfer_amounts,
   movement_evidence.custody_transfer_ids,movement_evidence.personal_withdrawal_minor,
   movement_evidence.personal_withdrawal_id,movement_evidence.owner_funding_movement_type,
   movement_evidence.owner_funding_amount_minor,movement_evidence.owner_funding_tx_id,
   movement_evidence.owner_funding_reference
 having bool_or(l.account_code in (select account_code from owner_accounts))
 order by j.journal_date,j.id`;
