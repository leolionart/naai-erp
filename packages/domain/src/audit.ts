export type AuditActorType = "user" | "service" | "system";

export type AuditEvent<TBefore = unknown, TAfter = unknown> = Readonly<{
  id: string;
  organizationId: string;
  actorId: string;
  actorType: AuditActorType;
  action: string;
  occurredAt: string;
  correlationId: string;
  reason?: string;
  before?: TBefore;
  after?: TAfter;
}>;
