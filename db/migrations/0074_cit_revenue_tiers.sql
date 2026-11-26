-- Configurable year-based CIT revenue tiers (Law 67/2025/QH15) and organization CIT eligibility declaration.
create table if not exists statutory_cit_rate_tiers (
  effective_from_year integer not null check (effective_from_year between 1900 and 9999),
  effective_to_year integer null check (effective_to_year is null or effective_to_year >= effective_from_year),
  tier_order integer not null check (tier_order >= 1),
  tier_code text not null check (btrim(tier_code) <> ''),
  label text not null check (btrim(label) <> ''),
  max_revenue_minor bigint null check (max_revenue_minor is null or max_revenue_minor >= 0),
  rate_bps integer not null check (rate_bps between 0 and 10000),
  law_reference text not null default 'Law 67/2025/QH15' check (btrim(law_reference) <> ''),
  updated_at timestamptz not null default now(),
  primary key (effective_from_year, tier_order)
);

insert into statutory_cit_rate_tiers (
  effective_from_year,
  effective_to_year,
  tier_order,
  tier_code,
  label,
  max_revenue_minor,
  rate_bps,
  law_reference
) values
  (2025, null, 1, 'small_15', 'Doanh thu năm trước liền kề <= 3 tỷ đồng (15%)', 3000000000, 1500, 'Law 67/2025/QH15'),
  (2025, null, 2, 'medium_17', 'Doanh thu năm trước liền kề > 3 tỷ đồng đến <= 50 tỷ đồng (17%)', 50000000000, 1700, 'Law 67/2025/QH15'),
  (2025, null, 3, 'standard_20', 'Doanh thu năm trước liền kề > 50 tỷ đồng (20%)', null, 2000, 'Law 67/2025/QH15')
on conflict (effective_from_year, tier_order) do nothing;

create table if not exists organization_cit_policies (
  organization_id text primary key references organizations(id) on delete cascade,
  cit_small_enterprise_ineligible boolean not null default false,
  ineligibility_reason text null check (ineligibility_reason is null or btrim(ineligibility_reason) <> ''),
  prior_year_revenue_override_minor bigint null
    check (prior_year_revenue_override_minor is null or prior_year_revenue_override_minor >= 0),
  updated_by text not null check (btrim(updated_by) <> ''),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version >= 1)
);

create table if not exists organization_cit_rate_tiers (
  organization_id text not null references organizations(id) on delete cascade,
  effective_from_year integer not null check (effective_from_year between 1900 and 9999),
  effective_to_year integer null check (effective_to_year is null or effective_to_year >= effective_from_year),
  tier_order integer not null check (tier_order >= 1),
  tier_code text not null check (btrim(tier_code) <> ''),
  label text not null check (btrim(label) <> ''),
  max_revenue_minor bigint null check (max_revenue_minor is null or max_revenue_minor >= 0),
  rate_bps integer not null check (rate_bps between 0 and 10000),
  law_reference text not null default 'Law 67/2025/QH15' check (btrim(law_reference) <> ''),
  updated_by text not null check (btrim(updated_by) <> ''),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version >= 1),
  primary key (organization_id, effective_from_year, tier_order)
);

create index if not exists organization_cit_rate_tiers_lookup_idx
  on organization_cit_rate_tiers (organization_id, effective_from_year desc, tier_order asc);
