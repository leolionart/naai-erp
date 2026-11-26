-- ERP-982: Payment evidence fields, organization non-cash deductibility threshold,
-- and final-record trigger allowances for audited payment-evidence updates and tax re-evaluation.

alter table accounting_workflow_policies
  add column if not exists non_cash_threshold_minor bigint not null default 5000000
    check (non_cash_threshold_minor >= 0);

alter table expenses
  add column if not exists payment_method text not null default 'unpaid'
    check (payment_method in ('cash', 'bank_transfer', 'card', 'other', 'unpaid')),
  add column if not exists paid_on date null,
  add column if not exists payment_evidence_ref text null,
  add column if not exists transaction_evidence text not null default 'none'
    check (transaction_evidence in ('contract', 'purchase_order', 'email', 'acceptance', 'quote', 'none')),
  add column if not exists payment_evidence_missing boolean not null default false;

alter table expense_lines
  add column if not exists payment_evidence_missing boolean not null default false;

alter table commercial_documents
  add column if not exists payment_method text not null default 'unpaid'
    check (payment_method in ('cash', 'bank_transfer', 'card', 'other', 'unpaid')),
  add column if not exists paid_on date null,
  add column if not exists payment_evidence_ref text null,
  add column if not exists transaction_evidence text not null default 'none'
    check (transaction_evidence in ('contract', 'purchase_order', 'email', 'acceptance', 'quote', 'none')),
  add column if not exists payment_evidence_missing boolean not null default false;

alter table commercial_document_lines
  add column if not exists payment_evidence_missing boolean not null default false;

create index if not exists expenses_payment_evidence_missing_idx
  on expenses (organization_id, expense_date, payee_party_id, payment_evidence_missing);

create index if not exists commercial_documents_payment_evidence_missing_idx
  on commercial_documents (organization_id, document_date, party_id, payment_evidence_missing);

create or replace function prevent_final_expense_mutation() returns trigger language plpgsql as $$
begin
  if old.state = 'posted'
    and current_setting('app.payment_evidence_update', true) = 'on'
    and (to_jsonb(new) - array[
      'payment_method',
      'paid_on',
      'payment_evidence_ref',
      'transaction_evidence',
      'payment_evidence_missing',
      'cit_state',
      'vat_state',
      'version',
      'updated_at'
    ]) = (to_jsonb(old) - array[
      'payment_method',
      'paid_on',
      'payment_evidence_ref',
      'transaction_evidence',
      'payment_evidence_missing',
      'cit_state',
      'vat_state',
      'version',
      'updated_at'
    ]) then
    return new;
  end if;
  if old.state in ('posted', 'reversed')
    and current_setting('app.tax_finalization', true) = 'on'
    and (to_jsonb(new) - array['cit_state', 'vat_state', 'payment_evidence_missing', 'version', 'updated_at'])
      = (to_jsonb(old) - array['cit_state', 'vat_state', 'payment_evidence_missing', 'version', 'updated_at']) then
    return new;
  end if;
  if old.state = 'posted'
    and current_setting('app.expense_metadata_correction', true) = 'on'
    and (to_jsonb(new) - array['payee_party_id', 'business_purpose'])
      = (to_jsonb(old) - array['payee_party_id', 'business_purpose']) then
    return new;
  end if;
  if old.state in ('posted', 'reversed') and (
    new.expense_class is distinct from old.expense_class or
    new.payee_party_id is distinct from old.payee_party_id or
    new.employee_party_id is distinct from old.employee_party_id or
    new.expense_date is distinct from old.expense_date or
    new.service_period_start is distinct from old.service_period_start or
    new.service_period_end is distinct from old.service_period_end or
    new.business_purpose is distinct from old.business_purpose or
    new.currency is distinct from old.currency or
    new.net_minor is distinct from old.net_minor or
    new.vat_minor is distinct from old.vat_minor or
    new.gross_minor is distinct from old.gross_minor or
    new.counter_account_code is distinct from old.counter_account_code or
    new.cit_state is distinct from old.cit_state or
    new.vat_state is distinct from old.vat_state or
    new.evidence_checklist is distinct from old.evidence_checklist or
    new.journal_id is distinct from old.journal_id or
    new.payment_method is distinct from old.payment_method or
    new.paid_on is distinct from old.paid_on or
    new.payment_evidence_ref is distinct from old.payment_evidence_ref or
    new.transaction_evidence is distinct from old.transaction_evidence or
    new.payment_evidence_missing is distinct from old.payment_evidence_missing or
    (old.state = 'reversed' and new.state is distinct from old.state) or
    (old.state = 'posted' and new.state not in ('posted', 'reversed'))
  ) then
    raise exception 'FINAL_EXPENSE_IMMUTABLE' using errcode = '55000';
  end if;
  return new;
end $$;

create or replace function prevent_final_expense_child_mutation() returns trigger language plpgsql as $$
declare parent_state expense_state;
begin
  select state into parent_state from expenses
  where organization_id = coalesce(old.organization_id, new.organization_id)
    and id = coalesce(old.expense_id, new.expense_id);
  if parent_state = 'posted' and tg_op = 'UPDATE' and tg_table_name = 'expense_lines'
    and current_setting('app.expense_metadata_correction', true) = 'on'
    and (to_jsonb(new) - array['expense_category_code', 'funding_treatment', 'description', 'dimensions'])
      = (to_jsonb(old) - array['expense_category_code', 'funding_treatment', 'description', 'dimensions']) then
    return new;
  end if;
  if parent_state in ('posted', 'reversed') and tg_op = 'UPDATE' and tg_table_name = 'expense_lines'
    and current_setting('app.tax_finalization', true) = 'on'
    and (to_jsonb(new) - array[
      'management_state',
      'cit_state',
      'vat_state',
      'cit_eligible_minor',
      'vat_eligible_minor',
      'payment_evidence_missing',
      'reviewed_by',
      'reviewed_at',
      'review_reason',
      'review_reference'
    ]) = (to_jsonb(old) - array[
      'management_state',
      'cit_state',
      'vat_state',
      'cit_eligible_minor',
      'vat_eligible_minor',
      'payment_evidence_missing',
      'reviewed_by',
      'reviewed_at',
      'review_reason',
      'review_reference'
    ]) then
    return new;
  end if;
  if parent_state in ('posted', 'reversed') and tg_op = 'UPDATE' and tg_table_name = 'expense_lines'
    and (to_jsonb(new) - 'dimensions') = (to_jsonb(old) - 'dimensions')
    and (coalesce(new.dimensions, '{}'::jsonb) - 'category') = (coalesce(old.dimensions, '{}'::jsonb) - 'category') then
    return new;
  end if;
  if parent_state in ('posted', 'reversed') then
    raise exception 'FINAL_EXPENSE_IMMUTABLE' using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;

create or replace function prevent_final_commercial_document_mutation() returns trigger language plpgsql as $$
begin
  if old.state in ('issued', 'posted', 'partially_paid', 'paid')
    and current_setting('app.payment_evidence_update', true) = 'on'
    and (to_jsonb(new) - array[
      'payment_method',
      'paid_on',
      'payment_evidence_ref',
      'transaction_evidence',
      'payment_evidence_missing',
      'state',
      'version',
      'updated_at'
    ]) = (to_jsonb(old) - array[
      'payment_method',
      'paid_on',
      'payment_evidence_ref',
      'transaction_evidence',
      'payment_evidence_missing',
      'state',
      'version',
      'updated_at'
    ])
    and new.state in (old.state, 'issued', 'posted', 'partially_paid', 'paid') then
    return new;
  end if;
  if old.state in ('issued', 'posted', 'partially_paid', 'paid')
    and current_setting('app.tax_finalization', true) = 'on'
    and (to_jsonb(new) - array['payment_evidence_missing', 'version', 'updated_at'])
      = (to_jsonb(old) - array['payment_evidence_missing', 'version', 'updated_at']) then
    return new;
  end if;
  if old.state in ('issued', 'posted', 'partially_paid', 'paid')
    and current_setting('app.commercial_document_metadata_correction', true) = 'on'
    and (to_jsonb(new) - array['party_id', 'version', 'updated_at'])
      = (to_jsonb(old) - array['party_id', 'version', 'updated_at']) then
    return new;
  end if;
  if old.state in ('issued', 'posted', 'partially_paid', 'paid', 'cancelled') and (
    new.type is distinct from old.type or new.document_number is distinct from old.document_number or
    new.series is distinct from old.series or new.fiscal_year is distinct from old.fiscal_year or
    new.party_id is distinct from old.party_id or new.document_date is distinct from old.document_date or
    new.due_date is distinct from old.due_date or new.currency is distinct from old.currency or
    new.net_minor is distinct from old.net_minor or new.tax_minor is distinct from old.tax_minor or
    new.gross_minor is distinct from old.gross_minor or new.control_account_code is distinct from old.control_account_code or
    new.original_document_id is distinct from old.original_document_id or
    new.payment_method is distinct from old.payment_method or
    new.paid_on is distinct from old.paid_on or
    new.payment_evidence_ref is distinct from old.payment_evidence_ref or
    new.transaction_evidence is distinct from old.transaction_evidence or
    new.payment_evidence_missing is distinct from old.payment_evidence_missing or
    (old.state = 'cancelled' and new.state is distinct from old.state) or
    (old.state <> 'cancelled' and new.state not in (old.state, 'cancelled', 'issued', 'posted', 'partially_paid', 'paid'))
  ) then
    raise exception 'FINAL_DOCUMENT_IMMUTABLE' using errcode = '55000';
  end if;
  return new;
end $$;

create or replace function prevent_final_commercial_document_child_mutation() returns trigger language plpgsql as $$
declare parent_state commercial_document_state;
begin
  select state into parent_state from commercial_documents
  where organization_id = coalesce(old.organization_id, new.organization_id)
    and id = coalesce(old.document_id, new.document_id);
  if parent_state in ('issued', 'posted', 'partially_paid', 'paid', 'cancelled') then
    if parent_state <> 'cancelled' and tg_op = 'UPDATE'
      and tg_table_name = 'commercial_document_lines'
      and current_setting('app.commercial_document_metadata_correction', true) = 'on'
      and (to_jsonb(new) - array['category_code', 'dimensions', 'description'])
        = (to_jsonb(old) - array['category_code', 'dimensions', 'description']) then
      return new;
    end if;
    if parent_state <> 'cancelled' and tg_op = 'UPDATE'
      and tg_table_name in ('commercial_document_lines', 'commercial_document_allocations')
      and current_setting('app.commercial_document_metadata_correction', true) = 'on'
      and (to_jsonb(new) - array['dimensions', 'description'])
        = (to_jsonb(old) - array['dimensions', 'description']) then
      return new;
    end if;
    if parent_state <> 'cancelled' and tg_op = 'UPDATE'
      and tg_table_name = 'commercial_document_lines'
      and current_setting('app.tax_finalization', true) = 'on'
      and (to_jsonb(new) - array[
        'tax_code',
        'management_state',
        'cit_state',
        'vat_state',
        'cit_eligible_minor',
        'vat_eligible_minor',
        'payment_evidence_missing',
        'reviewed_by',
        'reviewed_at',
        'review_reason',
        'review_reference',
        'dimensions'
      ]) = (to_jsonb(old) - array[
        'tax_code',
        'management_state',
        'cit_state',
        'vat_state',
        'cit_eligible_minor',
        'vat_eligible_minor',
        'payment_evidence_missing',
        'reviewed_by',
        'reviewed_at',
        'review_reason',
        'review_reference',
        'dimensions'
      ]) then
      return new;
    end if;
    raise exception 'FINAL_DOCUMENT_IMMUTABLE' using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;
