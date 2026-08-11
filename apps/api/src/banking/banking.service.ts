import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  BANKING_STORE,
  type BankingContext,
  type BankingStore,
  type BankTransactionActionInput,
  type CreateFinancialAccountInput,
  type CreateOwnerCashWithdrawalInput,
  type ImportBankStatementInput,
} from "./banking.types.js";

const MANAGE = new Set(["owner", "finance_admin", "accountant"]);
const IMPORT = new Set([...MANAGE, "integration"]);

@Injectable()
export class BankingService {
  constructor(
    @Inject(BANKING_STORE) private readonly store: BankingStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.master.authenticate(authorization, organizationId, correlationId);
  }

  private envelope(context: BankingContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  async listAccounts(context: BankingContext) {
    return this.envelope(context, await this.store.listAccounts(context.organizationId));
  }
  async getAccount(context: BankingContext, id: string) {
    const data = await this.store.getAccount(context.organizationId, id);
    if (!data) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, data);
  }
  async createAccount(context: BankingContext, input: CreateFinancialAccountInput, key?: string) {
    this.authorize(context, MANAGE);
    this.requireKey(key);
    if (
      !input.code?.trim() ||
      !["bank", "cash"].includes(input.kind) ||
      !input.displayName?.trim() ||
      !/^[A-Z]{3}$/.test(input.currency) ||
      !input.ledgerAccountCode?.trim() ||
      (input.kind === "bank" && !input.bankCode?.trim())
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(context, await this.store.createAccount(context, input, key!));
  }
  async deactivateAccount(
    context: BankingContext,
    id: string,
    input: BankTransactionActionInput,
    key?: string,
  ) {
    this.authorize(context, MANAGE);
    this.requireKey(key);
    if (!input.reason?.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.deactivateAccount(context, id, input.reason.trim(), key!),
    );
  }
  async importStatement(context: BankingContext, input: ImportBankStatementInput, key?: string) {
    this.authorize(context, IMPORT);
    this.requireKey(key);
    this.validateImportInput(input);
    return this.envelope(context, await this.store.importStatement(context, input, key!));
  }
  async dryRunImport(context: BankingContext, input: ImportBankStatementInput) {
    this.authorize(context, IMPORT);
    this.validateImportInput(input);
    return this.envelope(context, await this.store.dryRunImport(context.organizationId, input));
  }
  async listImports(context: BankingContext, financialAccountId?: string) {
    return this.envelope(
      context,
      await this.store.listImports(context.organizationId, financialAccountId),
    );
  }
  async getImport(context: BankingContext, id: string) {
    const data = await this.store.getImport(context.organizationId, id);
    if (!data) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, data);
  }
  async listTransactions(
    context: BankingContext,
    filters: { financialAccountId?: string; state?: string; from?: string; to?: string },
  ) {
    return this.envelope(
      context,
      await this.store.listTransactions(context.organizationId, filters),
    );
  }
  async listOwnerCurrentMovements(context: BankingContext) {
    return this.envelope(
      context,
      await this.store.listOwnerCurrentMovements(context.organizationId),
    );
  }
  async createOwnerCashWithdrawal(
    context: BankingContext,
    input: CreateOwnerCashWithdrawalInput,
    key?: string,
  ) {
    this.authorize(context, MANAGE);
    this.requireKey(key);
    if (
      input.schemaVersion !== 1 ||
      input.movementType !== "owner_personal_withdrawal" ||
      !input.financialAccountId?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.bookingDate) ||
      !/^\d+$/.test(input.amountMinor) ||
      BigInt(input.amountMinor) <= 0n ||
      !/^[A-Z]{3}$/.test(input.currency) ||
      !input.description?.trim() ||
      !input.reason?.trim()
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(context, await this.store.createOwnerCashWithdrawal(context, input, key));
  }
  async getTransaction(context: BankingContext, id: string) {
    const data = await this.store.getTransaction(context.organizationId, id);
    if (!data) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, data);
  }
  async transitionTransaction(
    context: BankingContext,
    id: string,
    action: string,
    input: BankTransactionActionInput,
    key?: string,
  ) {
    this.authorize(context, MANAGE);
    this.requireKey(key);
    if (!(["ignore", "mark-needs-review"] as string[]).includes(action))
      throw new Error("INVALID_BANK_TRANSACTION_TRANSITION");
    if (!input.reason?.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.transitionTransaction(
        context,
        id,
        action as "ignore" | "mark-needs-review",
        input.reason.trim(),
        key!,
      ),
    );
  }
  private authorize(context: BankingContext, roles: ReadonlySet<string>) {
    if (!context.roles.some((role) => roles.has(role))) throw new Error("FORBIDDEN");
  }
  private requireKey(key?: string): asserts key is string {
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  }
  private validateImportInput(input: ImportBankStatementInput) {
    if (
      !input.financialAccountId?.trim() ||
      input.adapterId !== "generic-csv" ||
      input.adapterVersion !== 1 ||
      !input.filename?.trim() ||
      typeof input.csvText !== "string" ||
      input.csvText.length === 0 ||
      input.csvText.length > 5_000_000
    )
      throw new Error("BANK_IMPORT_INVALID");
  }
}
