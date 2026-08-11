create table customer_receipts (
  organization_id text not null references organizations(id), id text not null,
  financial_account_id text not null, receipt_date date not null, amount_minor bigint not null,
  currency text not null, description text not null, state text not null default 'posted',
  journal_id text not null, customer_id text not null, version bigint not null default 1,
  created_by text not null, correlation_id text not null, created_at timestamptz not null default now(),
  primary key (organization_id,id),
  foreign key (organization_id,financial_account_id) references financial_accounts(organization_id,id),
  foreign key (organization_id,journal_id) references journal_entries(organization_id,id),
  foreign key (organization_id,customer_id) references parties(organization_id,id),
  check(amount_minor > 0), check(currency ~ '^[A-Z]{3}$'), check(btrim(description) <> ''),
  check(state = 'posted'), check(version > 0)
);
create table customer_receipt_allocations (
  organization_id text not null, id text not null, receipt_id text not null,
  sales_invoice_id text not null, amount_minor bigint not null,
  primary key (organization_id,id), unique(organization_id,receipt_id,sales_invoice_id),
  foreign key (organization_id,receipt_id) references customer_receipts(organization_id,id) deferrable initially deferred,
  foreign key (organization_id,sales_invoice_id) references commercial_documents(organization_id,id),
  check(amount_minor > 0)
);
