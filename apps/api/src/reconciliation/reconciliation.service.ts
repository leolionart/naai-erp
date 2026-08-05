import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  RECONCILIATION_STORE,
  type MatchInput,
  type ReconcileInput,
  type ReconciliationContext,
  type ReconciliationStore,
  type SuggestInput,
  type UnreconcileInput,
} from "./reconciliation.types.js";

const WRITE = new Set(["owner", "finance_admin", "accountant"]);

@Injectable()
export class ReconciliationService {
  constructor(
    @Inject(RECONCILIATION_STORE) private readonly store: ReconciliationStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.master.authenticate(authorization, organizationId, correlationId);
  }
  private envelope(context: ReconciliationContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }
  async getCandidates(context: ReconciliationContext, transactionId: string) {
    return this.envelope(
      context,
      await this.store.getCandidates(context.organizationId, transactionId),
    );
  }
  async suggest(
    context: ReconciliationContext,
    transactionId: string,
    input: SuggestInput,
    key?: string,
  ) {
    this.write(context, key);
    const thresholdBps = input.thresholdBps ?? 7000;
    const ambiguityMarginBps = input.ambiguityMarginBps ?? 1000;
    if (
      input.schemaVersion !== 1 ||
      ![thresholdBps, ambiguityMarginBps].every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 10000,
      )
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.suggest(
        context,
        transactionId,
        { ...input, thresholdBps, ambiguityMarginBps },
        key!,
      ),
    );
  }
  async match(
    context: ReconciliationContext,
    transactionId: string,
    input: MatchInput,
    key?: string,
  ) {
    this.write(context, key);
    if (
      input.schemaVersion !== 1 ||
      !input.allocations?.length ||
      !/^\d+$/.test(input.baseAmountMinor) ||
      BigInt(input.baseAmountMinor) <= 0n
    )
      throw new Error("VALIDATION_FAILED");
    if (input.manualOverride && (!input.overrideReason?.trim() || !input.overrideReference?.trim()))
      throw new Error("RECONCILIATION_OVERRIDE_REASON_REQUIRED");
    for (const allocation of input.allocations) {
      if (
        !allocation.targetId?.trim() ||
        !/^\d+$/.test(allocation.targetAmountMinor) ||
        BigInt(allocation.targetAmountMinor) <= 0n ||
        !/^[A-Z]{3}$/.test(allocation.targetCurrency) ||
        !/^\d+$/.test(allocation.baseAmountMinor) ||
        BigInt(allocation.baseAmountMinor) <= 0n
      )
        throw new Error("VALIDATION_FAILED");
    }
    for (const adjustment of input.adjustments ?? []) {
      if (
        !adjustment.description?.trim() ||
        !adjustment.accountCode?.trim() ||
        !/^\d+$/.test(adjustment.baseAmountMinor) ||
        BigInt(adjustment.baseAmountMinor) <= 0n
      )
        throw new Error("VALIDATION_FAILED");
    }
    return this.envelope(context, await this.store.match(context, transactionId, input, key!));
  }
  async reconcile(
    context: ReconciliationContext,
    transactionId: string,
    input: ReconcileInput,
    key?: string,
  ) {
    this.write(context, key);
    if (input.schemaVersion !== 1 || !input.reason?.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(context, await this.store.reconcile(context, transactionId, input, key!));
  }
  async unreconcile(
    context: ReconciliationContext,
    transactionId: string,
    input: UnreconcileInput,
    key?: string,
  ) {
    this.write(context, key);
    if (input.schemaVersion !== 1 || !input.reason?.trim()) throw new Error("VALIDATION_FAILED");
    return this.envelope(
      context,
      await this.store.unreconcile(context, transactionId, input, key!),
    );
  }
  async list(
    context: ReconciliationContext,
    filters: { state?: string; financialAccountId?: string },
  ) {
    return this.envelope(context, await this.store.list(context.organizationId, filters));
  }
  async get(context: ReconciliationContext, id: string) {
    const data = await this.store.get(context.organizationId, id);
    if (!data) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, data);
  }
  private write(context: ReconciliationContext, key?: string): asserts key is string {
    if (!context.roles.some((role) => WRITE.has(role))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  }
}
