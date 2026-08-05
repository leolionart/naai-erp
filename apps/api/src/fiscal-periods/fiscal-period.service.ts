import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import type { ActorContext } from "../master-data/master-data.types.js";
import { PgFiscalPeriodStore, type PeriodCommandInput } from "./pg-fiscal-period.store.js";

const CLOSE_ROLES = new Set(["owner", "finance_admin", "accountant"]);
const REOPEN_ROLES = new Set(["owner", "finance_admin"]);

@Injectable()
export class FiscalPeriodService {
  constructor(
    @Inject(PgFiscalPeriodStore) private readonly store: PgFiscalPeriodStore,
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
  ) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }

  async transition(
    action: "close" | "reopen",
    context: ActorContext,
    input: PeriodCommandInput,
    idempotencyKey?: string,
  ) {
    const roles = action === "close" ? CLOSE_ROLES : REOPEN_ROLES;
    if (!context.roles.some((role) => roles.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (
      !Number.isInteger(input.fiscalYear) ||
      !Number.isInteger(input.periodNumber) ||
      input.periodNumber < 1 ||
      input.periodNumber > 53 ||
      !input.reason?.trim()
    )
      throw new Error("VALIDATION_FAILED");
    const data = await this.store.transition(
      action,
      context,
      { ...input, reason: input.reason.trim() },
      idempotencyKey,
    );
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }
}
