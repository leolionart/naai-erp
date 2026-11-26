-- Organization-level default funding source and priority-ordered ingestion funding rules.
create table if not exists organization_funding_defaults (
  organization_id text primary key references organizations(id) on delete cascade,
  default_funding_type text not null default 'owner_paid'
    check (default_funding_type in ('company_bank', 'owner_paid', 'owner_custody_cash', 'company_cash')),
  default_financial_account_id text null,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  foreign key (organization_id, default_financial_account_id)
    references financial_accounts(organization_id, id)
);

create table if not exists funding_rules (
  organization_id text not null references organizations(id) on delete cascade,
  id text not null,
  name text not null,
  priority integer not null default 100,
  is_active boolean not null default true,
  match_external_system text null,
  match_supplier_tax_id text null,
  match_category_code text null,
  match_keyword text null,
  match_min_amount_minor bigint null,
  match_max_amount_minor bigint null,
  target_funding_type text not null
    check (target_funding_type in ('company_bank', 'owner_paid', 'owner_custody_cash', 'company_cash')),
  target_financial_account_id text null,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  primary key (organization_id, id),
  foreign key (organization_id, target_financial_account_id)
    references financial_accounts(organization_id, id)
);

create index if not exists funding_rules_org_priority_idx
  on funding_rules (organization_id, is_active, priority, created_at, id);
