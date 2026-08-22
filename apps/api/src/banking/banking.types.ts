import type { JournalActorContext } from "../journals/journal.types.js";

export type BankingContext = JournalActorContext;

export type CreateFinancialAccountInput = Readonly<{
  id?: string;
  code: string;
  kind: "bank" | "cash";
  displayName: string;
  currency: string;
  ledgerAccountCode: string;
  bankCode?: string;
  maskedIdentifier?: string;
  accountIdentity?: string;
}>;

export type ImportBankStatementInput = Readonly<{
  id?: string;
  financialAccountId?: string;
  financialAccount?: string;
  adapterId: "generic-csv";
  adapterVersion: 1;
  filename: string;
  csvText: string;
  columnMapping?: Readonly<Record<string, string>>;
}>;

export type BankTransactionActionInput = Readonly<{ reason: string }>;

export type CreateOwnerCashWithdrawalInput = Readonly<{
  id?: string;
  schemaVersion: 1;
  movementType: "owner_personal_withdrawal";
  financialAccountId: string;
  bookingDate: string;
  amountMinor: string;
  currency: string;
  description: string;
  reason: string;
}>;

export type BankingStore = Readonly<{
  listAccounts(organizationId: string): Promise<unknown>;
  getAccount(organizationId: string, id: string): Promise<unknown | undefined>;
  createAccount(
    context: BankingContext,
    input: CreateFinancialAccountInput,
    key: string,
  ): Promise<unknown>;
  deactivateAccount(
    context: BankingContext,
    id: string,
    reason: string,
    key: string,
  ): Promise<unknown>;
  importStatement(
    context: BankingContext,
    input: ImportBankStatementInput,
    key: string,
  ): Promise<unknown>;
  dryRunImport(organizationId: string, input: ImportBankStatementInput): Promise<unknown>;
  listImports(organizationId: string, financialAccountId?: string): Promise<unknown>;
  getImport(organizationId: string, id: string): Promise<unknown | undefined>;
  listTransactions(
    organizationId: string,
    filters: { financialAccountId?: string; state?: string; from?: string; to?: string },
  ): Promise<unknown>;
  listOwnerCurrentMovements(organizationId: string): Promise<unknown>;
  createOwnerCashWithdrawal(
    context: BankingContext,
    input: CreateOwnerCashWithdrawalInput,
    key: string,
  ): Promise<unknown>;
  getTransaction(organizationId: string, id: string): Promise<unknown | undefined>;
  transitionTransaction(
    context: BankingContext,
    id: string,
    action: "ignore" | "mark-needs-review",
    reason: string,
    key: string,
  ): Promise<unknown>;
}>;

export const BANKING_STORE = Symbol("BANKING_STORE");
