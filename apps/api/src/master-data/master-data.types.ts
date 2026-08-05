export type ActorContext = Readonly<{
  organizationId: string;
  actorId: string;
  roles: readonly string[];
  correlationId: string;
}>;

export type MutationInput = Readonly<{
  data: Readonly<Record<string, unknown>>;
  expectedVersion?: string;
}>;

export type MutationResult = Readonly<{
  data: Readonly<Record<string, unknown>>;
  resourceVersion: string;
  auditEventId: string;
  idempotencyReplayed: boolean;
  nextActions: readonly string[];
}>;
