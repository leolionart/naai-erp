import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  INTERNAL_TRANSFER_STORE,
  type CreateInternalTransferInput,
  type InternalTransferContext,
  type InternalTransferStore,
  type MatchInternalTransferInput,
  type UnmatchInternalTransferInput,
} from "./internal-transfer.types.js";
const WRITE = new Set(["owner", "finance_admin", "accountant"]);
@Injectable()
export class InternalTransferService {
  constructor(
    @Inject(INTERNAL_TRANSFER_STORE) private readonly store: InternalTransferStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(auth: string | undefined, org: string, corr: string) {
    return this.master.authenticate(auth, org, corr);
  }
  private envelope(context: InternalTransferContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }
  async list(c: InternalTransferContext, f: { state?: string; financialAccountId?: string }) {
    return this.envelope(c, await this.store.list(c.organizationId, f));
  }
  async get(c: InternalTransferContext, id: string) {
    const d = await this.store.get(c.organizationId, id);
    if (!d) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(c, d);
  }
  async candidates(c: InternalTransferContext, transactionId: string) {
    return this.envelope(
      c,
      await this.store.transactionCandidates(c.organizationId, transactionId),
    );
  }
  async create(c: InternalTransferContext, input: CreateInternalTransferInput, key?: string) {
    this.write(c, key);
    if (
      input.schemaVersion !== 1 ||
      (!input.sourceTransactionId && !input.destinationTransactionId) ||
      !input.transitAccountId?.trim() ||
      !input.reason?.trim() ||
      !/^\d+$/.test(input.principalAmountMinor) ||
      !/^\d+$/.test(input.basePrincipalAmountMinor) ||
      !/^[A-Z]{3}$/.test(input.currency)
    )
      throw new Error("VALIDATION_FAILED");
    if (
      input.postingMode === "direct" &&
      (!input.sourceTransactionId || !input.destinationTransactionId)
    )
      throw new Error("INTERNAL_TRANSFER_DIRECT_REQUIRES_BOTH_LEGS");
    if (
      input.fee &&
      (!/^\d+$/.test(input.fee.amountMinor) ||
        !/^\d+$/.test(input.fee.baseAmountMinor) ||
        !input.fee.expenseAccountId?.trim() ||
        !input.fee.reason?.trim() ||
        (input.fee.mode === "separate_transaction" && !input.fee.transactionId))
    )
      throw new Error("VALIDATION_FAILED");
    if (input.fee?.mode === "embedded" && !input.sourceTransactionId)
      throw new Error("INTERNAL_TRANSFER_FEE_MISMATCH");
    return this.envelope(c, await this.store.create(c, input, key!));
  }
  async match(
    c: InternalTransferContext,
    id: string,
    input: MatchInternalTransferInput,
    key?: string,
  ) {
    this.write(c, key);
    if (
      input.schemaVersion !== 1 ||
      !input.counterpartTransactionId?.trim() ||
      !input.reason?.trim() ||
      !/^\d+$/.test(input.expectedResourceVersion)
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.match(c, id, input, key!));
  }
  async unmatch(
    c: InternalTransferContext,
    id: string,
    input: UnmatchInternalTransferInput,
    key?: string,
  ) {
    this.write(c, key);
    if (
      input.schemaVersion !== 1 ||
      !input.reason?.trim() ||
      !/^\d+$/.test(input.expectedResourceVersion)
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(c, await this.store.unmatch(c, id, input, key!));
  }
  private write(c: InternalTransferContext, key?: string): asserts key is string {
    if (!c.roles.some((r) => WRITE.has(r))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  }
}
