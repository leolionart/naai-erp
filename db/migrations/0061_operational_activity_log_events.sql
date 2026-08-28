create table if not exists operational_activity_log_events (
  organization_id text not null,
  activity_id text not null,
  sequence integer not null,
  occurred_at timestamptz not null default now(),
  phase text not null,
  level text not null default 'info',
  message text not null,
  attempt integer,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  primary key (organization_id, activity_id, sequence),
  foreign key (organization_id, activity_id) references operational_activity_logs(organization_id, id) on delete cascade,
  constraint operational_activity_log_events_level_valid check (level in ('debug','info','warning','error')),
  constraint operational_activity_log_events_phase_not_blank check (btrim(phase) <> ''),
  constraint operational_activity_log_events_message_not_blank check (btrim(message) <> '')
);
create index if not exists operational_activity_log_events_org_activity_idx
  on operational_activity_log_events (organization_id, activity_id, occurred_at, sequence);
comment on table operational_activity_log_events is 'Append-only execution timeline for operational activity; metadata must be redacted and never contains secrets.';
