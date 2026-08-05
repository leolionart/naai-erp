import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  AGING_STORE,
  type AgingContext,
  type AgingQuery,
  type AgingSide,
  type AgingStore,
} from "./aging.types.js";

@Injectable()
export class AgingService {
  constructor(
    @Inject(AGING_STORE) private readonly store: AgingStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(auth: string | undefined, org: string, correlationId: string) {
    return this.master.authenticate(auth, org, correlationId);
  }
  private envelope(context: AgingContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }
  parseQuery(input: Record<string, string | undefined>): AgingQuery {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOf ?? "")) throw new Error("VALIDATION_FAILED");
    const limit = input.limit ? Number(input.limit) : 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("VALIDATION_FAILED");
    if (input.includeSettled && !["true", "false"].includes(input.includeSettled))
      throw new Error("VALIDATION_FAILED");
    if (
      input.bucket &&
      !["current", "1_30", "31_60", "61_90", "over_90", "unclassified"].includes(input.bucket)
    )
      throw new Error("VALIDATION_FAILED");
    if (input.paymentStatus && !["unpaid", "partially_paid", "paid"].includes(input.paymentStatus))
      throw new Error("VALIDATION_FAILED");
    return {
      asOf: input.asOf!,
      ...(input.partyId ? { partyId: input.partyId } : {}),
      ...(input.accountCode ? { accountCode: input.accountCode } : {}),
      ...(input.bucket ? { bucket: input.bucket as NonNullable<AgingQuery["bucket"]> } : {}),
      ...(input.paymentStatus
        ? { paymentStatus: input.paymentStatus as NonNullable<AgingQuery["paymentStatus"]> }
        : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
      limit,
      includeSettled: input.includeSettled === "true",
    };
  }
  async report(context: AgingContext, side: AgingSide, query: AgingQuery) {
    return this.envelope(context, await this.store.report(context.organizationId, side, query));
  }
  async item(context: AgingContext, side: AgingSide, itemId: string, query: AgingQuery) {
    const item = await this.store.item(context.organizationId, side, itemId, query);
    if (!item) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, item);
  }
}
