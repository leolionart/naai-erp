export type JournalLineInput = Readonly<{
  accountCode: string;
  debitMinor?: string;
  creditMinor?: string;
  description?: string;
  dimensions?: Readonly<Record<string, string>>;
}>;

export type CreateJournalInput = Readonly<{
  id?: string;
  journalDate: string;
  description: string;
  currency: string;
  lines: readonly JournalLineInput[];
}>;

export type JournalActorContext = Readonly<{
  organizationId: string;
  actorId: string;
  roles: readonly string[];
  correlationId: string;
}>;
