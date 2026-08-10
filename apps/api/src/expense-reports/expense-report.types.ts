export type ExpenseReportContext = Readonly<{
  organizationId: string;
  actorId: string;
  roles: readonly string[];
  correlationId: string;
}>;

export type ExpenseReportRange = Readonly<{ startsOn: string; endsOn: string }>;
export type ExpenseReportDimension = "payee" | "category";

export type ExpenseReportFact = Readonly<{
  sourceId: string;
  month: string;
  currency: string;
  dimensionKey: string | null;
  dimensionName: string | null;
  netMinor: string;
  vatMinor: string;
  amountMinor: string;
}>;
