alter table api_credentials
  add column if not exists name text,
  add column if not exists auto_record boolean not null default false,
  add column if not exists version bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now();
--> statement-breakpoint
alter table integration_sources
  add column if not exists auto_record boolean not null default false;
--> statement-breakpoint
alter table expenses
  add column if not exists draft_reasons jsonb not null default '[]'::jsonb;
--> statement-breakpoint
alter table commercial_documents
  add column if not exists draft_reasons jsonb not null default '[]'::jsonb;
