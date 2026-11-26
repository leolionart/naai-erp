import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION, type OwnerFundingMovementTypeContract } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  OWNER_FUNDING_STORE,
  type OwnerFundingContext,
  type OwnerFundingStore,
  type RecordOwnerFundingInput,
} from "./owner-funding.types.js";

const MANAGE = new Set(["owner", "finance_admin", "accountant"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MOVEMENT_TYPES = new Set<OwnerFundingMovementTypeContract>([
  "owner_funding",
  "owner_repayment",
]);

@Injectable()
export class OwnerFundingService {
  constructor(
    @Inject(OWNER_FUNDING_STORE) private readonly store: OwnerFundingStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.master.authenticate(authorization, organizationId, correlationId);
  }

  private envelope(context: OwnerFundingContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  async list(
    context: OwnerFundingContext,
    filters: {
      movementType?: string;
      financialAccountId?: string;
      from?: string;
      to?: string;
    },
  ) {
    if (
      (filters.movementType &&
        !MOVEMENT_TYPES.has(filters.movementType as OwnerFundingMovementTypeContract)) ||
      (filters.from && !ISO_DATE.test(filters.from)) ||
      (filters.to && !ISO_DATE.test(filters.to)) ||
      (filters.from && filters.to && filters.from > filters.to)
    ) {
      throw new Error("VALIDATION_FAILED");
    }
    return this.envelope(
      context,
      await this.store.list(context.organizationId, {
        ...(filters.movementType
          ? { movementType: filters.movementType as OwnerFundingMovementTypeContract }
          : {}),
        ...(filters.financialAccountId?.trim()
          ? { financialAccountId: filters.financialAccountId.trim() }
          : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
      }),
    );
  }

  async get(context: OwnerFundingContext, id: string) {
    const item = await this.store.get(context.organizationId, id);
    if (!item) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, item);
  }

  async record(context: OwnerFundingContext, input: RecordOwnerFundingInput, key?: string) {
    if (!context.roles.some((role) => MANAGE.has(role))) throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");

    const movementType: OwnerFundingMovementTypeContract = input.movementType ?? "owner_funding";
    if (!MOVEMENT_TYPES.has(movementType)) throw new Error("VALIDATION_FAILED");
    if (input.schemaVersion !== undefined && input.schemaVersion !== 1) {
      throw new Error("VALIDATION_FAILED");
    }
    if (!input.reason?.trim()) throw new Error("VALIDATION_FAILED");

    const hasBankTx = Boolean(input.bankTransactionId?.trim());
    if (!hasBankTx) {
      if (!input.reference?.trim()) throw new Error("OWNER_FUNDING_REFERENCE_REQUIRED");
      if (
        !input.financialAccountId?.trim() ||
        !input.bookingDate ||
        !ISO_DATE.test(input.bookingDate) ||
        !input.amountMinor ||
        !/^\d+$/.test(input.amountMinor) ||
        BigInt(input.amountMinor) <= 0n ||
        !input.description?.trim()
      ) {
        throw new Error("VALIDATION_FAILED");
      }
    } else {
      if (input.bookingDate !== undefined && !ISO_DATE.test(input.bookingDate)) {
        throw new Error("VALIDATION_FAILED");
      }
      if (
        input.amountMinor !== undefined &&
        (!/^\d+$/.test(input.amountMinor) || BigInt(input.amountMinor) <= 0n)
      ) {
        throw new Error("VALIDATION_FAILED");
      }
    }
    if (input.currency !== undefined && !/^[A-Z]{3}$/.test(input.currency)) {
      throw new Error("VALIDATION_FAILED");
    }

    return this.envelope(
      context,
      await this.store.record(context, { ...input, movementType }, key),
    );
  }
}
