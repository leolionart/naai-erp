alter table expenses add column freelance_due_date date;
alter table expenses add constraint expenses_freelance_due_date check (
  (expense_class = 'freelancer' and freelance_due_date is not null and payee_party_id is not null and freelance_due_date >= expense_date)
  or (expense_class <> 'freelancer' and freelance_due_date is null)
);

create table project_freelance_payables (
  organization_id text not null references organizations(id), id text not null,
  expense_id text not null, project_id text not null, freelancer_party_id text not null,
  due_date date not null, amount_minor bigint not null, paid_minor bigint not null default 0,
  currency text not null, state text not null default 'unpaid', journal_id text not null,
  version bigint not null default 1, created_by text not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), primary key(organization_id,id),
  unique(organization_id,expense_id),
  foreign key(organization_id,expense_id) references expenses(organization_id,id),
  foreign key(organization_id,project_id) references projects(organization_id,id),
  foreign key(organization_id,freelancer_party_id) references parties(organization_id,id),
  foreign key(organization_id,journal_id) references journal_entries(organization_id,id),
  check(amount_minor > 0 and paid_minor >= 0 and paid_minor <= amount_minor),
  check(currency ~ '^[A-Z]{3}$'), check(state in ('unpaid','partially_paid','paid')),
  check((state='unpaid' and paid_minor=0) or (state='partially_paid' and paid_minor>0 and paid_minor<amount_minor) or (state='paid' and paid_minor=amount_minor))
);

create table project_freelance_payable_payments (
  organization_id text not null, id text not null, payable_id text not null,
  financial_account_id text not null, payment_date date not null, amount_minor bigint not null,
  journal_id text not null, created_by text not null, correlation_id text not null,
  created_at timestamptz not null default now(), primary key(organization_id,id),
  foreign key(organization_id,payable_id) references project_freelance_payables(organization_id,id),
  foreign key(organization_id,financial_account_id) references financial_accounts(organization_id,id),
  foreign key(organization_id,journal_id) references journal_entries(organization_id,id),
  check(amount_minor > 0)
);
