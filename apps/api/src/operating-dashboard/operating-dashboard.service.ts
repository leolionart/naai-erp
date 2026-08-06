import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  OPERATING_DASHBOARD_STORE,
  type OperatingDashboardContext,
  type OperatingDashboardQuery,
  type OperatingDashboardStore,
} from "./operating-dashboard.types.js";

@Injectable()
export class OperatingDashboardService {
  constructor(
    @Inject(OPERATING_DASHBOARD_STORE) private readonly store: OperatingDashboardStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}

  authenticate(auth: string | undefined, org: string, correlationId: string) {
    return this.master.authenticate(auth, org, correlationId);
  }

  parseQuery(input: Record<string, string | undefined>): OperatingDashboardQuery {
    const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
    const startsOn = input.startsOn ?? `${asOf.slice(0, 4)}-01-01`;
    const endsOn = input.endsOn ?? asOf;
    const limit = input.limit ? Number(input.limit) : 10;
    for (const value of [asOf, startsOn, endsOn])
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("VALIDATION_FAILED");
    if (startsOn > endsOn || endsOn > asOf) throw new Error("VALIDATION_FAILED");
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("VALIDATION_FAILED");
    return { asOf, startsOn, endsOn, limit };
  }

  async read(context: OperatingDashboardContext, query: OperatingDashboardQuery) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: await this.store.read(context.organizationId, query),
    };
  }
}
