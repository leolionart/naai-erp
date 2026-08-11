alter table commercial_documents add column funding_financial_account_id text;
alter table commercial_documents add constraint commercial_documents_funding_account_fk
  foreign key(organization_id,funding_financial_account_id) references financial_accounts(organization_id,id);
alter table commercial_documents add constraint commercial_documents_purchase_funding check (
  (type='purchase_invoice') or funding_financial_account_id is null
);
