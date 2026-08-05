import type { MutationMetadata } from "./index.js";

export const BANKING_CONTRACT_VERSION = 1 as const;

export type BankAccountContract = Readonly<{
  id: string;
  code: string;
  displayName: string;
  kind: "bank" | "cash";
  currency: string;
  ledgerAccountCode: string;
  bankCode?: string;
  maskedIdentifier?: string;
  status: "active" | "inactive";
  resourceVersion: string;
}>;

export type CreateBankAccountRequest = Readonly<{
  schemaVersion: typeof BANKING_CONTRACT_VERSION;
  id?: string;
  code: string;
  displayName: string;
  kind: "bank" | "cash";
  currency: string;
  ledgerAccountCode: string;
  bankCode?: string;
  maskedIdentifier?: string;
  accountIdentity?: string;
}>;

export type BankCsvColumnMapping = Readonly<{
  bookingDate: string;
  amountMinor?: string;
  debitMinor?: string;
  creditMinor?: string;
  currency?: string;
  valueDate?: string;
  reference?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  providerTransactionId?: string;
}>;

export type BankStatementImportRequest = Readonly<{
  schemaVersion: typeof BANKING_CONTRACT_VERSION;
  financialAccountId: string;
  adapterId: string;
  adapterVersion: number;
  filename: string;
  csvText: string;
  columnMapping?: BankCsvColumnMapping;
}>;

export type BankImportRowDisposition =
  "new" | "duplicate_provider_id" | "duplicate_fingerprint" | "invalid";

export type BankImportRowResult = Readonly<{
  rowNumber: number;
  valid: boolean;
  disposition: BankImportRowDisposition;
  sourceKey?: string;
  transactionId?: string;
  errors: readonly string[];
  warnings: readonly string[];
}>;

export type BankStatementImportResult = Readonly<{
  importId?: string;
  dryRun: boolean;
  valid: boolean;
  totalRows: number;
  newRows: number;
  duplicateRows: number;
  invalidRows: number;
  rows: readonly BankImportRowResult[];
  mutation?: MutationMetadata;
}>;

export type BankTransactionContract = Readonly<{
  id: string;
  financialAccountId: string;
  sourceKey: string;
  state: "imported" | "suggested" | "matched" | "reconciled" | "ignored" | "needs_review";
  normalizationVersion: number;
  adapterId: string;
  adapterVersion: number;
  bookingDate: string;
  valueDate?: string;
  amountMinor: string;
  currency: string;
  reference?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  providerTransactionId?: string;
  rawPayloadHash: string;
  resourceVersion: string;
  nextActions: readonly string[];
}>;

export type BankTransactionBranchRequest = Readonly<{
  schemaVersion: typeof BANKING_CONTRACT_VERSION;
  reason: string;
}>;
