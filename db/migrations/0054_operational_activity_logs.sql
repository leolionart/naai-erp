create table if not exists operational_activity_logs (
  organization_id text not null references organizations(id),
  id text not null,
  service text not null,
  operation text not null,
  status text not null,
  severity text not null default 'info',
  worker_id text,
  correlation_id text,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null,
  completed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint operational_activity_logs_service_not_blank check (btrim(service) <> ''),
  constraint operational_activity_logs_operation_not_blank check (btrim(operation) <> ''),
  constraint operational_activity_logs_status_valid check (status in ('running','succeeded','failed','skipped')),
  constraint operational_activity_logs_severity_valid check (severity in ('info','warning','error'))
);

create index if not exists operational_activity_logs_org_created_idx
  on operational_activity_logs (organization_id, created_at desc);
create index if not exists operational_activity_logs_expiry_idx
  on operational_activity_logs (expires_at);

comment on table operational_activity_logs is
  'Bounded operational telemetry only; never replaces immutable resource/accounting audit events.';
